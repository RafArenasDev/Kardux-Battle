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
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { RatingService } from '../leaderboard/rating.service.js';
import type { GameSocket } from './game-socket.type.js';
import { toErrorPayload } from './to-error-payload.js';

const LOCK_PREFIX = 'kardux:lock:match:';
/** Pause after the attribute is announced before the leader's card is laid down, then between
 *  each following player's card - one step at a time, so everyone can follow the table. */
const LEADER_PLAY_DELAY_MS = 1_200;
const FOLLOWER_PLAY_DELAY_MS = 1_300;
/** A bot "thinks" before choosing its attribute. */
const BOT_THINK_MS = 2_200;

/** Player ids starting with this prefix are the server-driven practice rival. */
export const BOT_PREFIX = 'bot:';
/** The practice rival: always the same name and face, so players recognise it. */
const PRACTICE_NICKNAME = 'Nova';
const PRACTICE_AVATAR = 'astronaut-helmet:ice';
const LOCK_TTL_MS = 5_000;
const STATE_PREFIX = 'kardux:match:state:';
/** Live matches are kept for a day; a finished one only long enough to show the result. */
const STATE_TTL_SECONDS = 24 * 60 * 60;
const FINISHED_STATE_TTL_SECONDS = 15 * 60;

/**
 * Owns every match's live `@kardux/engine` `MatchState` in memory and is the only thing that
 * ever calls `reduce()` (docs/SPEC.md's "MatchRuntimeService", ADR 0002/0006). `GameGateway`
 * translates a validated socket payload into one call here; this service does the rest:
 * locking, dispatching through the pure engine, broadcasting the resulting events, persisting
 * the durable side effects (`Round`/`DeckSnapshot`/`MatchEvent`/final `Match`/`MatchPlayer`
 * rows), and scheduling the next timer-driven `system.tick`.
 *
 * Live state is held in memory and snapshotted to Redis after every accepted action
 * (`kardux:match:state:<id>`), so a page reload, a dropped socket or an API restart (every
 * file save in `nest start --watch`) resumes the exact same match - same piles, same turn,
 * same timers. Without Redis the service still works, just memory-only: a restart then marks
 * any in-progress match as abandoned instead of re-dealing it under the same id.
 */
@Injectable()
export class MatchRuntimeService implements OnModuleDestroy {
    private readonly logger = new Logger(MatchRuntimeService.name);
    private readonly sessions = new Map<string, MatchState>();
    private readonly locks = new Map<string, Promise<unknown>>();
    private readonly timers = new Map<string, NodeJS.Timeout>();
    private readonly autoPlays = new Map<string, NodeJS.Timeout>();
    private readonly autoSelects = new Map<string, NodeJS.Timeout>();
    private readonly redis: Redis | null;
    private server?: Server<ClientEvents, ServerEvents>;

    constructor(
        private readonly prisma: PrismaService,
        private readonly deckBuilder: DeckBuilder,
        private readonly rating: RatingService,
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
        for (const timer of this.autoPlays.values()) clearTimeout(timer);
        for (const timer of this.autoSelects.values()) clearTimeout(timer);
        this.autoSelects.clear();
        this.autoPlays.clear();
        // `.quit()` rejects with "Connection is closed" if the client never actually
        // connected (e.g. no local Redis running, per docs/PENDING-WORK.md) - harmless during
        // shutdown, but left uncaught it surfaces as an unhandled rejection in tests.
        this.redis?.quit().catch(() => undefined);
    }

    // ---- Public entry points - one per `ClientEvents` action `GameGateway` forwards here ----

    /** Also checked after every join: triggers the `autoStartPlayers` countdown once the
     *  active player count reaches it (docs/SPEC.md rule 3). Silently ignores the engine's
     *  "already joined" rejection (`ERR_VALIDATION`) - that's the expected outcome of a
     *  reconnect/retried join, not a real error the joining client needs to see. */
    async playerJoin(
        matchId: string,
        playerId: string,
        nickname: string,
        avatarSeed: string,
    ): Promise<ErrorPayload | null> {
        const result = await this.dispatchAction(matchId, {
            type: 'player.join',
            playerId,
            nickname,
            avatarSeed,
        });
        const error = this.firstError(result.events);

        // "Already seated" is the expected outcome of a reload/rejoin - not a failure.
        if (error && error.code !== 'ERR_VALIDATION') {
            return error;
        }

        await this.maybeAutoStart(matchId);
        return null;
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
        // Every card of the round is then laid down automatically (see `autoPlayNext`).
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

    /** Human players still holding a seat in a live match (not left, not knocked out). */
    async seatedHumans(matchId: string): Promise<string[]> {
        try {
            const state = await this.ensureSession(matchId);
            return state.players
                .filter(
                    (player) =>
                        !player.id.startsWith(BOT_PREFIX) &&
                        !player.hasLeft &&
                        (state.phase === 'LOBBY' ||
                            state.phase === 'COUNTDOWN' ||
                            !player.isSpectator),
                )
                .map((player) => player.id);
        } catch {
            return [];
        }
    }

    /** Whether live-match snapshots are being written to Redis right now. */
    cacheStatus(): 'up' | 'down' | 'disabled' {
        if (!this.redis) return 'disabled';
        return this.redis.status === 'ready' ? 'up' : 'down';
    }

    /** Current engine phase of a live match, or `null` when nothing is loaded for it. Used
     *  by quick matchmaking to skip lobbies that already started their countdown. */
    async phaseOf(matchId: string): Promise<MatchState['phase'] | null> {
        try {
            return (await this.ensureSession(matchId)).phase;
        } catch {
            return null;
        }
    }

    // ---- Core dispatch ----

    private async ensureSession(matchId: string): Promise<MatchState> {
        const existing = this.sessions.get(matchId);
        if (existing) return existing;

        const snapshot = await this.loadSnapshot(matchId);
        if (snapshot) {
            this.sessions.set(matchId, snapshot);
            this.scheduleTimer(matchId, snapshot);
            return snapshot;
        }

        const match = await this.prisma.match.findUnique({ where: { id: matchId } });

        if (!match || match.status === 'FINISHED') {
            throw new KarduxError('ERR_MATCH_NOT_FOUND');
        }

        if (match.status === 'IN_PROGRESS') {
            // Nothing left to resume from (no Redis snapshot) - close it out instead of
            // leaving a zombie match that every "Continuar" would keep pointing at.
            await this.prisma.match.update({
                where: { id: matchId },
                data: { status: 'FINISHED', endedAt: new Date() },
            });
            throw new KarduxError(
                'ERR_MATCH_NOT_FOUND',
                'Esta partida se interrumpió y ya no se puede retomar.',
            );
        }

        const state = createMatch(match.config as unknown as MatchState['config'], {
            matchId: match.id,
            code: match.code,
            seed: match.seed,
            now: Date.now(),
        });
        this.sessions.set(matchId, state);
        await this.saveSnapshot(state);

        return state;
    }

    private async dispatchAction(matchId: string, action: EngineAction): Promise<ReduceResult> {
        return this.withLock(matchId, async () => {
            const before = await this.ensureSession(matchId);
            const now = Date.now();
            const result = reduce(before, action, { now });

            this.sessions.set(matchId, result.state);
            if (result.state.version !== before.version) {
                await this.saveSnapshot(result.state);
            }

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
            this.autoPlayNext(matchId, result.state);
            this.autoSelectAttribute(matchId, result.state);

            return result;
        });
    }

    /**
     * Rule 6 of the spec: once the leader picks the attribute, the leader and then every other
     * player lays down their top card in play order. Nobody chooses which card to play, so the
     * runtime lays each top card down itself, one player at a time, paced so the table can
     * animate every throw. Queued outside the per-match lock (never nested inside it).
     */
    private autoPlayNext(matchId: string, state: MatchState): void {
        const round = state.round;
        if (state.phase !== 'AWAITING_CARDS' || !round) return;

        const nextPlayerId = round.playOrder.find((id) => !round.playedCards[id]);
        if (!nextPlayerId || this.autoPlays.has(matchId)) return;

        const delay =
            nextPlayerId === round.leaderId ? LEADER_PLAY_DELAY_MS : FOLLOWER_PLAY_DELAY_MS;
        const timer = setTimeout(() => {
            this.autoPlays.delete(matchId);
            void this.dispatchAction(matchId, {
                type: 'round.playCard',
                playerId: nextPlayerId,
            }).catch((error: unknown) =>
                this.logger.error(
                    `Auto-play failed for match ${matchId}: ${(error as Error).message}`,
                ),
            );
        }, delay);
        this.autoPlays.set(matchId, timer);
    }

    /** The bot leads: it picks its attribute after a short "think". */
    private autoSelectAttribute(matchId: string, state: MatchState): void {
        if (state.phase !== 'AWAITING_ATTRIBUTE' || this.autoSelects.has(matchId)) return;

        const leaderId = state.turnOrder[state.currentTurnIndex];
        if (!leaderId?.startsWith(BOT_PREFIX) || !state.piles[leaderId]?.[0]) return;

        const attribute = this.bestAttributeFor(state, leaderId);
        // Wait for the deal/reveal to finish at the table, then "think" like a person would.
        const opensIn = Math.max(0, (state.turnOpensAt ?? 0) - Date.now());
        const timer = setTimeout(() => {
            this.autoSelects.delete(matchId);
            void this.dispatchAction(matchId, {
                type: 'round.selectAttribute',
                playerId: leaderId,
                attribute,
            }).catch((error: unknown) =>
                this.logger.error(
                    `Auto-select failed for match ${matchId}: ${(error as Error).message}`,
                ),
            );
        }, opensIn + BOT_THINK_MS);
        this.autoSelects.set(matchId, timer);
    }

    /**
     * The bot's choice: the attribute where its top card ranks highest against every card in
     * the match (a percentile per attribute). It only uses the deck's overall distribution -
     * never another player's current card.
     */
    private bestAttributeFor(state: MatchState, botId: string): string {
        const card = state.piles[botId]![0]!;
        const everyCard = [
            ...Object.values(state.piles).flat(),
            ...state.pot,
            ...Object.values(state.round?.playedCards ?? {}),
        ];

        let best = Object.keys(card.stats)[0]!;
        let bestScore = -1;
        for (const [key, value] of Object.entries(card.stats)) {
            const beaten = everyCard.filter((other) => (other.stats[key] ?? 0) < value).length;
            const score = beaten / Math.max(1, everyCard.length);
            if (score > bestScore) {
                bestScore = score;
                best = key;
            }
        }
        return best;
    }

    /** Seats the practice rival in a lobby ("play against the machine"). */
    async addBot(matchId: string): Promise<void> {
        const result = await this.dispatchAction(matchId, {
            type: 'player.join',
            playerId: `${BOT_PREFIX}nova`,
            nickname: PRACTICE_NICKNAME,
            avatarSeed: PRACTICE_AVATAR,
        });
        const error = this.firstError(result.events);
        if (error && error.code !== 'ERR_VALIDATION') {
            throw new KarduxError(error.code, error.message);
        }
        await this.maybeAutoStart(matchId);
    }

    /**
     * A player walks away (the "Abandonar" button, or a dropped connection that never came
     * back). There is no way to pause or resume a match:
     * - in a private lobby the host leaving deletes the room for everyone;
     * - anywhere else the seat is given up; mid-match that is a forfeit (zero cards, last
     *   place), and the match ends as soon as fewer than two players remain;
     * - once no human is left at the table, the match is deleted.
     */
    async abandon(matchId: string, playerId: string): Promise<void> {
        let state: MatchState;
        try {
            state = await this.ensureSession(matchId);
        } catch {
            return;
        }
        if (!state.players.some((player) => player.id === playerId)) return;

        const beforeDeal = state.phase === 'LOBBY' || state.phase === 'COUNTDOWN';
        const userId = this.userIdOf(playerId);

        if (beforeDeal && state.config.visibility === 'private' && state.hostId === playerId) {
            await this.deleteMatch(matchId);
            return;
        }

        if (state.phase !== 'FINISHED') {
            await this.playerLeave(matchId, playerId);
        }

        if (beforeDeal) {
            await this.prisma.matchPlayer.deleteMany({ where: { matchId, userId } });
        } else {
            await this.prisma.matchPlayer.updateMany({
                where: { matchId, userId, eliminatedAt: null },
                data: { eliminatedAt: new Date() },
            });
        }

        const after = this.sessions.get(matchId);
        const humansLeft = (after?.players ?? []).filter(
            (player) =>
                !player.id.startsWith(BOT_PREFIX) &&
                !player.hasLeft &&
                (beforeDeal || !player.isSpectator),
        );
        if (humansLeft.length === 0) {
            await this.deleteMatch(matchId);
        }
    }

    /** Removes a match for good: everyone still in the room is sent back to the lobby. */
    async deleteMatch(matchId: string): Promise<void> {
        this.closeRoom(matchId);
        await this.dispose(matchId);
        await this.prisma.match.deleteMany({ where: { id: matchId } });
    }

    /** Stops everything this process runs for a match (host deleted it, or it ended). */
    async dispose(matchId: string): Promise<void> {
        this.clearTimer(matchId);
        const autoPlay = this.autoPlays.get(matchId);
        if (autoPlay) clearTimeout(autoPlay);
        this.autoPlays.delete(matchId);
        const autoSelect = this.autoSelects.get(matchId);
        if (autoSelect) clearTimeout(autoSelect);
        this.autoSelects.delete(matchId);
        this.sessions.delete(matchId);
        if (this.redis?.status === 'ready') {
            await this.redis.del(`${STATE_PREFIX}${matchId}`).catch(() => undefined);
        }
    }

    /** Tells everyone still in the room that the host closed the match, then empties it. */
    closeRoom(matchId: string): void {
        this.server?.to(matchId).emit('match:closed', { matchId });
        this.server?.in(matchId).socketsLeave(matchId);
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
            // Tell the room why nothing is happening instead of failing silently.
            this.server?.to(matchId).emit('error', toErrorPayload(error));
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
                    // No dedicated wire event for this in docs/SPEC.md's table - the state push
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

        try {
            await this.rating.rateMatch(matchId, event.standings);
        } catch (error) {
            this.logger.error(`Rating failed for match ${matchId}: ${(error as Error).message}`);
        }
    }

    /** `Player.id`/`EngineAction.playerId` is the `userId:tabId` playerKey (docs/SPEC.md's
     *  "SESIONES MULTI-PESTAÑA"); `Round.leaderId`/`winnerId`/`MatchPlayer.userId` reference
     *  the durable `Player.id` alone - strip the tab suffix before writing either. */
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
    // this single-instance deployment) plus a best-effort Redis lock on top (docs/SPEC.md /
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
        if (!this.redis || this.redis.status !== 'ready') return null;

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
        if (!this.redis || !token || this.redis.status !== 'ready') return;

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

    // ---- Redis snapshots of live MatchState (see the class comment) ----

    private async saveSnapshot(state: MatchState): Promise<void> {
        if (!this.redis || this.redis.status !== 'ready') return;

        const ttl = state.phase === 'FINISHED' ? FINISHED_STATE_TTL_SECONDS : STATE_TTL_SECONDS;
        try {
            await this.redis.set(
                `${STATE_PREFIX}${state.matchId}`,
                JSON.stringify(state),
                'EX',
                ttl,
            );
        } catch (error) {
            this.logger.warn(
                `Could not snapshot match ${state.matchId}: ${(error as Error).message}`,
            );
        }
    }

    private async loadSnapshot(matchId: string): Promise<MatchState | null> {
        if (!this.redis || this.redis.status !== 'ready') return null;

        try {
            const raw = await this.redis.get(`${STATE_PREFIX}${matchId}`);
            return raw ? (JSON.parse(raw) as MatchState) : null;
        } catch {
            return null;
        }
    }

    private createRedisClient(url: string): Redis | null {
        try {
            const client = new Redis(url, {
                lazyConnect: true,
                maxRetriesPerRequest: 1,
                // Keep retrying in the background (Redis may start after the API) without
                // blocking any request: every call checks `status === 'ready'` first.
                retryStrategy: (attempt) => Math.min(attempt * 1_000, 10_000),
            });
            let warned = false;
            client.on('error', (error: Error) => {
                if (warned) return;
                warned = true;
                // Informational, not a fault: without Redis matches still work, they just
                // don't survive an API restart. `pnpm dev` starts Redis automatically.
                this.logger.log(
                    `Redis not reachable (${error.message || 'connection refused'}) - match snapshots paused until it is.`,
                );
            });
            client.on('ready', () => {
                warned = false;
                this.logger.log('Redis connected - match state snapshots enabled.');
            });
            client.connect().catch(() => undefined);
            return client;
        } catch (error) {
            this.logger.warn(`Could not initialize Redis client: ${(error as Error).message}`);
            return null;
        }
    }
}
