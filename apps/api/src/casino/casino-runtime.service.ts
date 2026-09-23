import { randomInt, randomUUID } from 'node:crypto';
import type {
    CasinoActionPayload,
    CasinoClientEvents,
    CasinoGame,
    CasinoJoinAck,
    CasinoServerEvents,
    CasinoTier,
    CasinoWallet,
    ErrorCode,
} from '@kardux/contracts';
import type {
    BlackjackAction,
    CasinoError,
    BlackjackState,
    HoldemAction,
    HoldemState,
} from '@kardux/casino-engine';
import {
    REFILL_AMOUNT,
    REFILL_THRESHOLD,
    createBlackjackTable,
    createHoldemTable,
    holdemBotAction,
    redactBlackjack,
    redactHoldem,
    reduceBlackjack,
    reduceHoldem,
} from '@kardux/casino-engine';
import { randomAvatarSeed } from '@kardux/content';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
// Value imports required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Namespace, Socket } from 'socket.io';
import type { AppConfig } from '../config/app-config.js';
import { KarduxError } from '../common/kardux-error.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';

type Table = BlackjackState | HoldemState;
type CasinoSocket = Socket<CasinoClientEvents, CasinoServerEvents>;

const TABLE_KEY = 'kardux:casino:table:';
const TABLE_INDEX = 'kardux:casino:tables';
const TABLE_TTL_SECONDS = 6 * 60 * 60;
const REFILL_KEY = 'kardux:casino:refill:';
const REFILL_COOLDOWN_SECONDS = 24 * 60 * 60;

/** Pause between a settled blackjack round / a finished hold'em hand and the next one. */
const NEXT_ROUND_MS = 5_000;
const NEXT_HAND_MS = 5_500;
/** Bots "think" for a human-like moment before acting. */
const BOT_THINK_MIN_MS = 1_300;
const BOT_THINK_SPREAD_MS = 1_400;
/** Hold'em tables are filled with bots up to this many seats so a lone player can always play. */
const HOLDEM_TARGET_SEATS = 4;
/** A disconnected player keeps their seat this long before leaving automatically. */
const ABSENCE_GRACE_MS = 60_000;

const ENGINE_ERRORS: Record<CasinoError, ErrorCode> = {
    TABLE_FULL: 'ERR_TABLE_FULL',
    NOT_SEATED: 'ERR_NOT_ALLOWED',
    NOT_NOW: 'ERR_NOT_ALLOWED',
    NOT_YOUR_TURN: 'ERR_NOT_YOUR_TURN',
    NOT_ALLOWED: 'ERR_NOT_ALLOWED',
    INVALID_BET: 'ERR_INVALID_BET',
    NOT_ENOUGH_CHIPS: 'ERR_NOT_ENOUGH_CHIPS',
};

const BOT_NAMES = ['Ace', 'Maverick', 'Luna', 'Rook', 'Vega', 'Blaze', 'Nova', 'Orion'];

/**
 * Owns every live casino table: seats players, runs the pure `@kardux/casino-engine` reducers,
 * drives timers and bots, and keeps chips in sync with `players.coins`.
 *
 * Chips model: at blackjack the seat plays straight from the player's balance (synced after
 * every change); at hold'em the player buys in (moved off the balance) and cashes the stack
 * back out on leaving. Tables are snapshotted to Redis so an API restart keeps them.
 */
@Injectable()
export class CasinoRuntimeService implements OnModuleDestroy {
    private readonly logger = new Logger(CasinoRuntimeService.name);
    private readonly tables = new Map<string, Table>();
    private readonly locks = new Map<string, Promise<unknown>>();
    private readonly timers = new Map<string, NodeJS.Timeout>();
    private readonly botTimers = new Map<string, NodeJS.Timeout>();
    private readonly absences = new Map<string, NodeJS.Timeout>();
    private readonly redis: Redis | null;
    private restored = false;
    private server?: Namespace<CasinoClientEvents, CasinoServerEvents>;

    constructor(
        private readonly prisma: PrismaService,
        config: ConfigService<AppConfig, true>,
    ) {
        this.redis = this.createRedisClient(config.get('REDIS_URL', { infer: true }));
    }

    setServer(server: Namespace<CasinoClientEvents, CasinoServerEvents>): void {
        this.server = server;
    }

    onModuleDestroy(): void {
        for (const timer of [
            ...this.timers.values(),
            ...this.botTimers.values(),
            ...this.absences.values(),
        ]) {
            clearTimeout(timer);
        }
        this.redis?.quit().catch(() => undefined);
    }

    // ---- Public API (called by the gateway / controller) ----

    async wallet(userId: string): Promise<CasinoWallet> {
        const player = await this.prisma.player.findUnique({ where: { id: userId } });
        const coins = player?.coins ?? 0;
        return { coins, canRefill: coins < REFILL_THRESHOLD && !this.tableOf(userId) };
    }

    /** Free top-up for a nearly broke player, at most once a day (tracked in Redis). */
    async refill(userId: string): Promise<CasinoWallet> {
        const wallet = await this.wallet(userId);
        if (!wallet.canRefill)
            throw new KarduxError('ERR_NOT_ALLOWED', 'Refills are only for low balances.');
        const key = `${REFILL_KEY}${userId}`;
        if (this.redis?.status === 'ready') {
            const claimed = await this.redis.set(key, '1', 'EX', REFILL_COOLDOWN_SECONDS, 'NX');
            if (claimed !== 'OK')
                throw new KarduxError('ERR_NOT_ALLOWED', 'Come back tomorrow for another refill.');
        }
        await this.prisma.player.update({
            where: { id: userId },
            data: { coins: { increment: REFILL_AMOUNT } },
        });
        await this.emitWallet(userId);
        return this.wallet(userId);
    }

    async sit(
        userId: string,
        socket: CasinoSocket,
        game: CasinoGame,
        tier: CasinoTier,
    ): Promise<CasinoJoinAck> {
        await this.ensureRestored();
        this.cancelAbsence(userId);

        const current = this.tableOf(userId);
        if (current && current.kind === game && current.config.tier === tier) {
            await socket.join(current.tableId);
            this.pushTo(socket, current);
            return { tableId: current.tableId, game, tier };
        }
        if (current) await this.leave(userId);

        const player = await this.prisma.player.findUnique({ where: { id: userId } });
        if (!player) throw new KarduxError('ERR_UNAUTHORIZED');

        const table =
            game === 'blackjack' ? this.findBlackjackTable(tier) : this.findHoldemTable(tier);
        this.tables.set(table.tableId, table);

        if (table.kind === 'blackjack') {
            await this.dispatch(table.tableId, {
                type: 'join',
                id: userId,
                nickname: player.nickname,
                avatarSeed: player.avatarSeed,
                chips: player.coins,
            });
        } else {
            const buyIn = Math.min(player.coins, table.config.maxBuyIn);
            if (buyIn < table.config.minBuyIn) {
                throw new KarduxError(
                    'ERR_NOT_ENOUGH_CHIPS',
                    `This table needs at least ${table.config.minBuyIn} chips.`,
                );
            }
            // Make room: a human always takes precedence over a bot.
            if (table.seats.length >= table.config.maxSeats) {
                const bot = [...table.seats].reverse().find((seat) => seat.isBot && !seat.inHand);
                if (bot) await this.dispatch(table.tableId, { type: 'leave', id: bot.id });
            }
            await this.prisma.player.update({
                where: { id: userId },
                data: { coins: { decrement: buyIn } },
            });
            await this.dispatch(table.tableId, {
                type: 'join',
                id: userId,
                nickname: player.nickname,
                avatarSeed: player.avatarSeed,
                isBot: false,
                buyIn,
            });
            await this.fillBots(table.tableId);
        }

        const seated = this.tables.get(table.tableId)!;
        if (!seated.seats.some((seat) => seat.id === userId)) {
            throw new KarduxError('ERR_TABLE_FULL');
        }
        await socket.join(table.tableId);
        this.pushTo(socket, seated);
        await this.emitWallet(userId);
        return { tableId: table.tableId, game, tier };
    }

    async act(userId: string, payload: CasinoActionPayload): Promise<void> {
        await this.ensureRestored();
        const table = this.tableOf(userId);
        if (!table) throw new KarduxError('ERR_NOT_ALLOWED', 'Take a seat first.');

        if (table.kind === 'blackjack') {
            if (payload.action === 'bet') {
                await this.dispatch(
                    table.tableId,
                    { type: 'bet', id: userId, amount: payload.amount },
                    userId,
                );
            } else if (['hit', 'stand', 'double', 'split'].includes(payload.action)) {
                await this.dispatch(
                    table.tableId,
                    { type: payload.action as 'hit', id: userId },
                    userId,
                );
            } else {
                throw new KarduxError('ERR_NOT_ALLOWED');
            }
            return;
        }

        if (payload.action === 'raise') {
            await this.dispatch(
                table.tableId,
                { type: 'raise', id: userId, to: payload.to },
                userId,
            );
        } else if (['fold', 'check', 'call', 'allIn'].includes(payload.action)) {
            await this.dispatch(
                table.tableId,
                { type: payload.action as 'fold', id: userId },
                userId,
            );
        } else {
            throw new KarduxError('ERR_NOT_ALLOWED');
        }
    }

    /** Leaves the player's table, cashing out a hold'em stack. */
    async leave(userId: string): Promise<void> {
        this.cancelAbsence(userId);
        const table = this.tableOf(userId);
        if (!table) return;

        if (table.kind === 'holdem') {
            const seat = table.seats.find((candidate) => candidate.id === userId)!;
            await this.dispatch(table.tableId, { type: 'leave', id: userId });
            // Leaving mid-hand folds it: chips already in the pot stay there, the stack is cashed out.
            if (seat.stack > 0) {
                await this.prisma.player.update({
                    where: { id: userId },
                    data: { coins: { increment: seat.stack } },
                });
            }
        } else {
            await this.dispatch(table.tableId, { type: 'leave', id: userId });
        }

        const sockets = await this.server?.in(table.tableId).fetchSockets();
        for (const socket of sockets ?? []) {
            if ((socket.data as { auth?: { userId: string } }).auth?.userId === userId) {
                socket.leave(table.tableId);
            }
        }
        await this.emitWallet(userId);
        await this.disposeIfEmpty(table.tableId);
    }

    /** Called on disconnect: the seat is kept for a grace period, then released. */
    scheduleAbsence(userId: string): void {
        if (!this.tableOf(userId)) return;
        this.cancelAbsence(userId);
        this.absences.set(
            userId,
            setTimeout(() => {
                this.absences.delete(userId);
                void this.leave(userId).catch((error: unknown) =>
                    this.logger.error(`Absent player cleanup failed: ${(error as Error).message}`),
                );
            }, ABSENCE_GRACE_MS),
        );
    }

    // ---- Tables ----

    private tableOf(userId: string): Table | undefined {
        for (const table of this.tables.values()) {
            if (table.seats.some((seat) => seat.id === userId)) return table;
        }
        return undefined;
    }

    private findBlackjackTable(tier: CasinoTier): BlackjackState {
        for (const table of this.tables.values()) {
            if (
                table.kind === 'blackjack' &&
                table.config.tier === tier &&
                table.seats.length < table.config.maxSeats
            ) {
                return table;
            }
        }
        return createBlackjackTable(randomUUID(), tier, randomUUID());
    }

    private findHoldemTable(tier: CasinoTier): HoldemState {
        for (const table of this.tables.values()) {
            if (table.kind !== 'holdem' || table.config.tier !== tier) continue;
            const humans = table.seats.filter((seat) => !seat.isBot).length;
            if (humans < table.config.maxSeats) return table;
        }
        return createHoldemTable(randomUUID(), tier, randomUUID());
    }

    /** Tops a hold'em table up with bots so there is always a game to play. */
    private async fillBots(tableId: string): Promise<void> {
        const table = this.tables.get(tableId);
        if (!table || table.kind !== 'holdem') return;
        const taken = new Set(table.seats.map((seat) => seat.nickname));
        let missing = HOLDEM_TARGET_SEATS - table.seats.length;
        for (const name of BOT_NAMES) {
            if (missing <= 0) break;
            if (taken.has(name)) continue;
            await this.dispatch(tableId, {
                type: 'join',
                id: `bot:${randomUUID()}`,
                nickname: name,
                avatarSeed: randomAvatarSeed(() => randomInt(1_000_000) / 1_000_000),
                isBot: true,
                buyIn: table.config.maxBuyIn,
            });
            missing -= 1;
        }
    }

    private async disposeIfEmpty(tableId: string): Promise<void> {
        const table = this.tables.get(tableId);
        if (!table) return;
        const humans = table.seats.filter((seat) => !('isBot' in seat && seat.isBot));
        if (humans.length > 0) return;
        this.clearTimers(tableId);
        this.tables.delete(tableId);
        await this.redis?.del(`${TABLE_KEY}${tableId}`).catch(() => undefined);
        await this.redis?.srem(TABLE_INDEX, tableId).catch(() => undefined);
    }

    // ---- Dispatch ----

    private dispatch(
        tableId: string,
        action: BlackjackAction | HoldemAction,
        actorId?: string,
    ): Promise<void> {
        const previous = this.locks.get(tableId) ?? Promise.resolve();
        const run = previous
            .catch(() => undefined)
            .then(async () => {
                const before = this.tables.get(tableId);
                if (!before) throw new KarduxError('ERR_NOT_ALLOWED', 'This table is closed.');

                const now = Date.now();
                const result =
                    before.kind === 'blackjack'
                        ? reduceBlackjack(before, action as BlackjackAction, now)
                        : reduceHoldem(before, action as HoldemAction, now);

                const error = result.events.find((event) => event.type === 'error');
                if (error && error.type === 'error') {
                    if (actorId) throw new KarduxError(ENGINE_ERRORS[error.code], error.message);
                    return;
                }

                this.tables.set(tableId, result.state);
                await this.syncBlackjackChips(before, result.state);
                await this.saveTable(result.state);
                this.broadcast(result.state, result.events);
                this.schedule(result.state);
            });
        this.locks.set(
            tableId,
            run.catch(() => undefined),
        );
        return run;
    }

    /** Blackjack seats play from the balance: mirror every chip change into `players.coins`. */
    private async syncBlackjackChips(before: Table, after: Table): Promise<void> {
        if (after.kind !== 'blackjack' || before.kind !== 'blackjack') return;
        for (const seat of after.seats) {
            const previous = before.seats.find((candidate) => candidate.id === seat.id);
            if (previous && previous.chips === seat.chips) continue;
            await this.prisma.player
                .update({ where: { id: seat.id }, data: { coins: seat.chips } })
                .catch(() => undefined);
            await this.emitWallet(seat.id);
        }
    }

    private schedule(table: Table): void {
        this.clearTimers(table.tableId);
        const tableId = table.tableId;
        const later = (delay: number, action: BlackjackAction | HoldemAction): void => {
            this.timers.set(
                tableId,
                setTimeout(
                    () => {
                        this.timers.delete(tableId);
                        void this.dispatch(tableId, action).catch((error: unknown) =>
                            this.logger.error(`Casino timer failed: ${(error as Error).message}`),
                        );
                    },
                    Math.max(0, delay),
                ),
            );
        };

        if (table.kind === 'blackjack') {
            if (table.phase === 'SETTLED') later(NEXT_ROUND_MS, { type: 'nextRound' });
            else if (table.deadline !== null) later(table.deadline - Date.now(), { type: 'tick' });
            return;
        }

        if (table.phase === 'SHOWDOWN') {
            this.timers.set(
                tableId,
                setTimeout(() => {
                    this.timers.delete(tableId);
                    void this.prepareNextHand(tableId).catch((error: unknown) =>
                        this.logger.error(`Next hand failed: ${(error as Error).message}`),
                    );
                }, NEXT_HAND_MS),
            );
            return;
        }
        if (table.phase === 'WAITING' && table.seats.filter((seat) => seat.stack > 0).length >= 2) {
            later(1_500, { type: 'startHand' });
            return;
        }
        if (table.phase === 'PLAYING') {
            if (table.deadline !== null) later(table.deadline - Date.now(), { type: 'tick' });
            const actor = table.seats.find((seat) => seat.id === table.toActId);
            if (actor?.isBot) {
                this.botTimers.set(
                    tableId,
                    setTimeout(
                        () => {
                            this.botTimers.delete(tableId);
                            const current = this.tables.get(tableId);
                            if (
                                !current ||
                                current.kind !== 'holdem' ||
                                current.toActId !== actor.id
                            )
                                return;
                            const move = holdemBotAction(
                                current,
                                actor.id,
                                randomInt(1_000_000) / 1_000_000,
                            );
                            void this.dispatch(tableId, move).catch(() => undefined);
                        },
                        BOT_THINK_MIN_MS + randomInt(BOT_THINK_SPREAD_MS),
                    ),
                );
            }
        }
    }

    /** Between hands: broke bots are replaced, broke humans leave, then the next hand deals. */
    private async prepareNextHand(tableId: string): Promise<void> {
        const table = this.tables.get(tableId);
        if (!table || table.kind !== 'holdem') return;
        for (const seat of table.seats.filter((candidate) => candidate.stack === 0)) {
            if (seat.isBot) {
                await this.dispatch(tableId, { type: 'leave', id: seat.id });
            } else {
                this.server
                    ?.to(tableId)
                    .emit('casino:event', { type: 'busted', playerId: seat.id });
                await this.leave(seat.id);
            }
        }
        if (!this.tables.has(tableId)) return;
        await this.fillBots(tableId);
        await this.dispatch(tableId, { type: 'startHand' });
    }

    private clearTimers(tableId: string): void {
        for (const map of [this.timers, this.botTimers]) {
            const timer = map.get(tableId);
            if (timer) clearTimeout(timer);
            map.delete(tableId);
        }
    }

    private cancelAbsence(userId: string): void {
        const timer = this.absences.get(userId);
        if (timer) clearTimeout(timer);
        this.absences.delete(userId);
    }

    // ---- Broadcasting ----

    private redact(table: Table, viewerId: string): unknown {
        return table.kind === 'blackjack'
            ? redactBlackjack(table, viewerId)
            : redactHoldem(table, viewerId);
    }

    private pushTo(socket: CasinoSocket, table: Table): void {
        const userId = (socket.data as { auth?: { userId: string } }).auth?.userId ?? '';
        socket.emit('casino:state', this.redact(table, userId));
    }

    private broadcast(table: Table, events: readonly { type: string }[]): void {
        if (!this.server) return;
        void this.server
            .in(table.tableId)
            .fetchSockets()
            .then((sockets) => {
                for (const socket of sockets) {
                    const userId =
                        (socket.data as { auth?: { userId: string } }).auth?.userId ?? '';
                    socket.emit('casino:state', this.redact(table, userId));
                }
            });
        for (const event of events) {
            if (event.type !== 'error')
                this.server.to(table.tableId).emit('casino:event', { ...event });
        }
    }

    private async emitWallet(userId: string): Promise<void> {
        if (!this.server || userId.startsWith('bot:')) return;
        const wallet = await this.wallet(userId);
        const sockets = await this.server.fetchSockets();
        for (const socket of sockets) {
            if ((socket.data as { auth?: { userId: string } }).auth?.userId === userId) {
                socket.emit('casino:wallet', wallet);
            }
        }
    }

    // ---- Redis snapshots ----

    private async saveTable(table: Table): Promise<void> {
        if (!this.redis || this.redis.status !== 'ready') return;
        try {
            await this.redis.set(
                `${TABLE_KEY}${table.tableId}`,
                JSON.stringify(table),
                'EX',
                TABLE_TTL_SECONDS,
            );
            await this.redis.sadd(TABLE_INDEX, table.tableId);
        } catch (error) {
            this.logger.error(
                `Could not snapshot table ${table.tableId}: ${(error as Error).message}`,
            );
        }
    }

    /** Loads tables saved before a restart (once, on first use). */
    private async ensureRestored(): Promise<void> {
        if (this.restored || !this.redis || this.redis.status !== 'ready') return;
        this.restored = true;
        try {
            const ids = await this.redis.smembers(TABLE_INDEX);
            for (const id of ids) {
                const raw = await this.redis.get(`${TABLE_KEY}${id}`);
                if (!raw) {
                    await this.redis.srem(TABLE_INDEX, id);
                    continue;
                }
                const table = JSON.parse(raw) as Table;
                this.tables.set(id, table);
                this.schedule(table);
            }
            if (ids.length > 0) this.logger.log(`Restored ${this.tables.size} casino table(s).`);
        } catch (error) {
            this.logger.error(`Casino restore failed: ${(error as Error).message}`);
        }
    }

    private createRedisClient(url: string): Redis | null {
        try {
            const client = new Redis(url, {
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                retryStrategy: (attempt) => Math.min(attempt * 1_000, 10_000),
            });
            client.on('error', () => undefined);
            client.connect().catch(() => undefined);
            return client;
        } catch {
            return null;
        }
    }
}
