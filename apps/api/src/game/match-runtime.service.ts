import { randomUUID } from 'node:crypto';
import type {
    Card,
    ClientEvents,
    ErrorPayload,
    MatchConfigPatch,
    MatchState,
    ServerEvents,
} from '@kardux/contracts';
import type { EngineAction, EngineEvent, ReduceResult } from '@kardux/engine';
import { createMatch, reduce, redactFor } from '@kardux/engine';
import type { Prisma } from '@prisma/client';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Server } from 'socket.io';
import type { AppConfig } from '../config/app-config.js';
import { KarduxError } from '../common/kardux-error.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DeckBuilder } from '../deck/deck-builder.service.js';
import type { GameSocket } from './game-socket.type.js';
import { toErrorPayload } from './to-error-payload.js';

const LOCK_PREFIX = 'kardux:lock:match:';
const LOCK_TTL_MS = 5_000;

/**
 * Owns every match's live `@kardux/engine` `MatchState` in memory and is the only thing that
 * ever calls `reduce()` (CLAUDE.md's "MatchRuntimeService", ADR 0002/0006). `GameGateway`
 * translates a validated socket payload into one call here; this service does the rest:
 * locking, dispatching through the pure engine, broadcasting the resulting events, persisting
 * the durable side effects (`Round`/`DeckSnapshot`/`MatchEvent`/final `Match`/`MatchPlayer`
 * rows), and scheduling the next timer-driven `system.tick`.
 *
 * State lives only in this process's memory - there is no snapshot of a live, in-progress
 * `MatchState` in the database (only its durable *outcomes*: rounds, the initial deck, the
 * final standings). If this process restarts mid-match, that match's live state is lost; a
 * fresh `ensureSession` call for it fails loudly (`ERR_VALIDATION`) rather than silently
 * re-dealing a new hand under the old match id. Fine for this project's current single-
 * instance free-tier deployment; a real multi-instance deployment would need to persist and
 * rehydrate `MatchState` itself, not just its outcomes - out of scope here.
 */
@Injectable()
export class MatchRuntimeService implements OnModuleDestroy {
    private readonly logger = new Logger(MatchRuntimeService.name);
    private readonly sessions = new Map<string, MatchState>();
    private readonly locks = new Map<string, Promise<unknown>>();
    private readonly timers = new Map<string, NodeJS.Timeout>();
    private readonly redis: Redis | null;
    private server?: Server<ClientEvents, ServerEvents>;

    constructor(
        private readonly prisma: PrismaService,
        private readonly deckBuilder: DeckBuilder,
        config: ConfigService<AppConfig, true>,
    ) {
        this.redis = this.createRedisClient(config.get('REDIS_URL', { infer: true }));
    }

    /** Called once from `GameGateway.afterInit` - the gateway owns the actual namespace
     *  `Server` instance (Nest injects it via `@WebSocketServer()`), this service only needs
     *  it to broadcast. */
    setServer(server: Server<ClientEvents, ServerEvents>): void {
        this.server = server;
    }

    onModuleDestroy(): void {
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
        // `.quit()` rejects with "Connection is closed" if the client never actually
        // connected (e.g. no local Redis running, per docs/PENDING-WORK.md) - harmless during
        // shutdown, but left uncaught it surfaces as an unhandled rejection in tests.
        this.redis?.quit().catch(() => undefined);
    }

    // ---- Public entry points - one per `ClientEvents` action `GameGateway` forwards here ----

    /** Also checked after every join: triggers the `autoStartPlayers` countdown once the
     *  active player count reaches it (CLAUDE.md rule 3). Silently ignores the engine's
     *  "already joined" rejection (`ERR_VALIDATION`) - that's the expected outcome of a
     *  reconnect/retried join, not a real error the joining client needs to see. */
    async playerJoin(
        matchId: string,
        client: GameSocket,
        playerId: string,
        nickname: string,
        avatarSeed: string,
    ): Promise<void> {
        const result = await this.dispatchAndReport(
            matchId,
            client,
            { type: 'player.join', playerId, nickname, avatarSeed },
            (error) => error.code !== 'ERR_VALIDATION',
        );

        if (result) {
            await this.maybeAutoStart(matchId);
        }
    }

    async playerLeave(matchId: string, playerId: string): Promise<void> {
        try {
            await this.dispatchAction(matchId, { type: 'player.leave', playerId });
        } catch (error) {
            this.logger.warn(
                `player.leave failed for match ${matchId}, player ${playerId}: ${(error as Error).message}`,
            );
        }
    }

    async configure(
        matchId: string,
        client: GameSocket,
        playerId: string,
        patch: MatchConfigPatch,
    ): Promise<void> {
        await this.dispatchAndReport(matchId, client, {
            type: 'match.configure',
            playerId,
            patch,
        });
    }

    /** Builds the real deck (`DeckBuilder`) before dispatching - the engine never fetches data
     *  itself (ADR 0003), so the deck has to already exist by the time `match.start` runs. */
    async start(matchId: string, client: GameSocket, playerId: string): Promise<void> {
        let state: MatchState;
        try {
            state = await this.ensureSession(matchId);
        } catch (error) {
            client.emit('error', toErrorPayload(error));
            return;
        }

        let deck: Card[];
        try {
            deck = await this.deckBuilder.build(state.config, { seed: state.seed });
        } catch (error) {
            client.emit('error', toErrorPayload(error));
            return;
        }

        await this.dispatchAndReport(matchId, client, { type: 'match.start', playerId, deck });
    }

    async cancelCountdown(matchId: string, client: GameSocket, playerId: string): Promise<void> {
        await this.dispatchAndReport(matchId, client, {
            type: 'match.cancelCountdown',
            playerId,
        });
    }

    async selectAttribute(
        matchId: string,
        client: GameSocket,
        playerId: string,
        attribute: string,
    ): Promise<void> {
        await this.dispatchAndReport(matchId, client, {
            type: 'round.selectAttribute',
            playerId,
            attribute,
        });
    }

    async playCard(matchId: string, client: GameSocket, playerId: string): Promise<void> {
        await this.dispatchAndReport(matchId, client, { type: 'round.playCard', playerId });
    }

    /** Used by `match:rejoin`: pushes a fresh redacted snapshot to the reconnecting socket
     *  without dispatching any engine action. Returns `false` if the match has no live session
     *  (never started, or this process lost it) or `playerId` was never seated in it. */
    async rejoin(matchId: string, client: GameSocket, playerId: string): Promise<boolean> {
        let state: MatchState;
        try {
            state = await this.ensureSession(matchId);
        } catch {
            return false;
        }

        if (!state.players.some((player) => player.id === playerId)) {
            return false;
        }

        client.emit('match:state', redactFor(playerId, state));
        return true;
    }

    // ---- Core dispatch ----

    private async ensureSession(matchId: string): Promise<MatchState> {
        const existing = this.sessions.get(matchId);
        if (existing) return existing;

        const match = await this.prisma.match.findUnique({ where: { id: matchId } });

        if (!match) {
            throw new KarduxError('ERR_MATCH_NOT_FOUND');
        }

        if (match.status !== 'LOBBY') {
            throw new KarduxError(
                'ERR_VALIDATION',
                "This match's live state is not available in memory (the server may have " +
                    'restarted since it started) and cannot be resumed.',
            );
        }

        const state = createMatch(match.config as unknown as MatchState['config'], {
            matchId: match.id,
            code: match.code,
            seed: match.seed,
            now: Date.now(),
        });
        this.sessions.set(matchId, state);

        return state;
    }

    private async dispatchAction(matchId: string, action: EngineAction): Promise<ReduceResult> {
        return this.withLock(matchId, async () => {
            const before = await this.ensureSession(matchId);
            const now = Date.now();
            const result = reduce(before, action, { now });

            this.sessions.set(matchId, result.state);

            // Persist durable side effects (Round/DeckSnapshot/Match/MatchEvent rows) BEFORE
            // telling any client what happened - a socket reacting to a broadcast (e.g.
            // re-querying `GET /leaderboard` right after `match:finished`) must never be able
            // to observe a state the database doesn't have yet.
            await this.persist(matchId, before, action, result.events, now);

            this.broadcastEvents(matchId, result.events);

            if (result.events.some((event) => event.type !== 'error')) {
                await this.pushState(matchId, result.state);
            }

            this.scheduleTimer(matchId, result.state);

            return result;
        });
    }

    /** Runs `action`, reports the first `error` event (if any) to `client`, and swallows/reports
     *  thrown exceptions (`ensureSession`'s `ERR_MATCH_NOT_FOUND`, etc.) the same way. `keepError`
     *  lets a caller (only `playerJoin` today) treat a specific error code as an expected no-op
     *  instead of something to surface. Returns the result, or `undefined` on any error. */
    private async dispatchAndReport(
        matchId: string,
        client: GameSocket,
        action: EngineAction,
        keepError: (error: ErrorPayload) => boolean = () => true,
    ): Promise<ReduceResult | undefined> {
        try {
            const result = await this.dispatchAction(matchId, action);
            const error = this.firstError(result.events);

            if (error && keepError(error)) {
                client.emit('error', error);
            }

            return result;
        } catch (error) {
            client.emit('error', toErrorPayload(error));
            return undefined;
        }
    }

    private firstError(events: readonly EngineEvent[]): ErrorPayload | undefined {
        const found = events.find((event) => event.type === 'error');
        return found && found.type === 'error'
            ? { code: found.code, message: found.message }
            : undefined;
    }

    private async maybeAutoStart(matchId: string): Promise<void> {
        const state = this.sessions.get(matchId);

        if (!state || state.phase !== 'LOBBY') return;

        const activeCount = state.players.filter((player) => !player.isSpectator).length;

        if (activeCount < state.config.autoStartPlayers) return;

        try {
            const deck = await this.deckBuilder.build(state.config, { seed: state.seed });
            await this.dispatchAction(matchId, { type: 'match.beginCountdown', deck });
        } catch (error) {
            this.logger.warn(
                `Auto-start deck build failed for match ${matchId}: ${(error as Error).message}`,
            );
        }
    }

    // ---- Broadcasting ----

    private broadcastEvents(matchId: string, events: readonly EngineEvent[]): void {
        if (!this.server) return;
        const room = this.server.to(matchId);

        for (const event of events) {
            switch (event.type) {
                case 'player.joined':
                    room.emit('match:playerJoined', event.player);
                    break;
                case 'player.left':
                    room.emit('match:playerLeft', { playerId: event.playerId });
                    break;
                case 'match.countdownStarted':
                    room.emit('match:countdown', { endsAt: event.endsAt });
                    break;
                case 'match.countdownCancelled':
                    // No dedicated wire event for this in CLAUDE.md's table - the state push
                    // right after this (phase back to LOBBY) is what tells clients it happened.
                    break;
                case 'match.started':
                    room.emit('match:started');
                    break;
                case 'round.started':
                    room.emit('round:started', event.round);
                    break;
                case 'round.attributeSelected':
                    room.emit('round:attributeSelected', { attribute: event.attribute });
                    break;
                case 'round.cardPlayed':
                    room.emit('round:cardPlayed', { playerId: event.playerId });
                    break;
                case 'round.revealed':
                    room.emit('round:revealed', { cards: event.cards });
                    break;
                case 'round.resolved':
                    room.emit('round:resolved', event.result);
                    break;
                case 'round.tie':
                    room.emit('round:tie', { potSize: event.potSize });
                    break;
                case 'match.finished':
                    room.emit('match:finished', {
                        standings: event.standings,
                        winnerId: event.winnerId,
                        isDraw: event.isDraw,
                    });
                    break;
                case 'error':
                    // Never broadcast - only the acting client learns about its own rejection
                    // (see `dispatchAndReport`).
                    break;
            }
        }
    }

    private async pushState(matchId: string, state: MatchState): Promise<void> {
        if (!this.server) return;

        const sockets = await this.server.in(matchId).fetchSockets();

        for (const socket of sockets) {
            const auth = (socket.data as { auth?: { userId: string; tabId: string } }).auth;
            if (!auth) continue;
            const viewerId = `${auth.userId}:${auth.tabId}`;
            socket.emit('match:state', redactFor(viewerId, state));
        }
    }

    // ---- Persistence of durable side effects ----

    private async persist(
        matchId: string,
        before: MatchState,
        action: EngineAction,
        events: readonly EngineEvent[],
        now: number,
    ): Promise<void> {
        try {
            for (const event of events) {
                if (event.type === 'error') continue;

                await this.prisma.matchEvent.create({
                    data: {
                        matchId,
                        type: event.type,
                        payload: event as unknown as Prisma.InputJsonValue,
                    },
                });
            }

            for (const event of events) {
                if (event.type === 'match.started') {
                    const deck =
                        action.type === 'match.start' ? action.deck : (before.pendingDeck ?? []);
                    await this.persistMatchStarted(matchId, deck, now);
                }

                if (event.type === 'round.resolved') {
                    await this.persistRoundResolved(matchId, before, event);
                }

                if (event.type === 'match.finished') {
                    await this.persistMatchFinished(matchId, event, now);
                }
            }
        } catch (error) {
            this.logger.error(
                `Failed to persist side effects for match ${matchId}: ${(error as Error).message}`,
            );
        }
    }

    private async persistMatchStarted(
        matchId: string,
        deck: readonly Card[],
        now: number,
    ): Promise<void> {
        await this.prisma.match.update({
            where: { id: matchId },
            data: { status: 'IN_PROGRESS', startedAt: new Date(now) },
        });

        await this.prisma.deckSnapshot.upsert({
            where: { matchId },
            create: { matchId, cards: deck as unknown as Prisma.InputJsonValue },
            update: { cards: deck as unknown as Prisma.InputJsonValue },
        });
    }

    private async persistRoundResolved(
        matchId: string,
        before: MatchState,
        event: Extract<EngineEvent, { type: 'round.resolved' }>,
    ): Promise<void> {
        const { result } = event;
        const leaderId = before.round?.leaderId;
        if (!leaderId) return;

        await this.prisma.round.upsert({
            where: { matchId_index: { matchId, index: result.index } },
            create: {
                matchId,
                index: result.index,
                attribute: result.attribute,
                leaderId: this.userIdOf(leaderId),
                winnerId: result.winnerId ? this.userIdOf(result.winnerId) : null,
                isTie: result.isTie,
                potSize: result.potSize,
                playedCards: result.cards as unknown as Prisma.InputJsonValue,
            },
            update: {},
        });
    }

    private async persistMatchFinished(
        matchId: string,
        event: Extract<EngineEvent, { type: 'match.finished' }>,
        now: number,
    ): Promise<void> {
        await this.prisma.match.update({
            where: { id: matchId },
            data: {
                status: 'FINISHED',
                endedAt: new Date(now),
                winnerId: event.winnerId ? this.userIdOf(event.winnerId) : null,
                isDraw: event.isDraw,
            },
        });

        await Promise.all(
            event.standings.map((player, index) =>
                this.prisma.matchPlayer.updateMany({
                    where: { matchId, userId: this.userIdOf(player.id) },
                    data: {
                        finalCards: player.cardCount,
                        placement: index + 1,
                        eliminatedAt: player.eliminatedAt ? new Date(player.eliminatedAt) : null,
                    },
                }),
            ),
        );

        this.clearTimer(matchId);
    }

    /** `Player.id`/`EngineAction.playerId` is the `userId:tabId` playerKey (CLAUDE.md's
     *  "SESIONES MULTI-PESTAÑA"); `Round.leaderId`/`winnerId`/`MatchPlayer.userId` reference
     *  the durable `User.id` alone - strip the tab suffix before writing either. */
    private userIdOf(playerKey: string): string {
        return playerKey.split(':')[0]!;
    }

    // ---- Timers ----

    private scheduleTimer(matchId: string, state: MatchState): void {
        this.clearTimer(matchId);

        if (state.phase === 'FINISHED') return;

        const deadlines = [state.countdownEndsAt, state.turnDeadline, state.endsAt].filter(
            (value): value is number => value !== null,
        );

        if (deadlines.length === 0) return;

        const delay = Math.max(0, Math.min(...deadlines) - Date.now());
        const timer = setTimeout(() => {
            void this.dispatchAction(matchId, { type: 'system.tick' }).catch((error: unknown) => {
                this.logger.error(
                    `system.tick failed for match ${matchId}: ${(error as Error).message}`,
                );
            });
        }, delay);

        this.timers.set(matchId, timer);
    }

    private clearTimer(matchId: string): void {
        const timer = this.timers.get(matchId);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(matchId);
        }
    }

    // ---- Locking: an in-process async mutex per match (the real correctness guarantee for
    // this single-instance deployment) plus a best-effort Redis lock on top (CLAUDE.md /
    // ADR 0002's "Redis-backed per-room lock"). The Redis lock is insurance for a future
    // multi-instance deployment, not what makes this safe today - `MatchState` itself only
    // lives in this process's memory, so a second instance couldn't correctly act on it even
    // while holding the lock. Never blocks on Redis being down: a failed acquire/release just
    // falls back to the in-process mutex alone. ----

    private async withLock<T>(matchId: string, fn: () => Promise<T>): Promise<T> {
        const previous = this.locks.get(matchId) ?? Promise.resolve();
        const run = previous
            .catch(() => undefined)
            .then(async () => {
                const token = await this.acquireRedisLock(matchId);
                try {
                    return await fn();
                } finally {
                    await this.releaseRedisLock(matchId, token);
                }
            });

        this.locks.set(
            matchId,
            run.catch(() => undefined),
        );

        return run;
    }

    private async acquireRedisLock(matchId: string): Promise<string | null> {
        if (!this.redis) return null;

        const token = randomUUID();

        try {
            const result = await this.redis.set(
                `${LOCK_PREFIX}${matchId}`,
                token,
                'PX',
                LOCK_TTL_MS,
                'NX',
            );
            return result === 'OK' ? token : null;
        } catch {
            return null;
        }
    }

    private async releaseRedisLock(matchId: string, token: string | null): Promise<void> {
        if (!this.redis || !token) return;

        try {
            // Compare-and-delete via a tiny Lua script: only clear the lock if it's still the
            // one we set, so a slow caller whose TTL already expired doesn't delete someone
            // else's newer lock.
            await this.redis.eval(
                'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
                1,
                `${LOCK_PREFIX}${matchId}`,
                token,
            );
        } catch {
            // Best-effort - the PX TTL above frees it eventually either way.
        }
    }

    private createRedisClient(url: string): Redis | null {
        try {
            const client = new Redis(url, {
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                retryStrategy: () => null,
            });
            client.on('error', (error: Error) => {
                this.logger.warn(`Redis lock backend unavailable: ${error.message}`);
            });
            client.connect().catch(() => undefined);
            return client;
        } catch (error) {
            this.logger.warn(`Could not initialize Redis client: ${(error as Error).message}`);
            return null;
        }
    }
}
