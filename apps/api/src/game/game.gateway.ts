import type {
    AckResponse,
    ClientEvents,
    GuestJwtPayload,
    MatchJoinAck,
    MatchJoinApprovedPayload,
    MatchJoinPayload,
    MatchRequestJoinPayload,
    MatchRespondJoinPayload,
    ServerEvents,
} from '@kardux/contracts';
import type { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { Logger } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import {
    chatSendPayloadSchema,
    matchConfigPatchSchema,
    matchJoinPayloadSchema,
    matchQuickPayloadSchema,
    matchRejoinPayloadSchema,
    matchRequestJoinPayloadSchema,
    matchRespondJoinPayloadSchema,
    pingLatencyPayloadSchema,
    roundPlayCardPayloadSchema,
    roundSelectAttributePayloadSchema,
} from '@kardux/contracts';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JwtService } from '@nestjs/jwt';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GameService } from './game.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MatchRuntimeService } from './match-runtime.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MatchService } from '../match/match.service.js';
import { KarduxError } from '../common/kardux-error.js';
import type { GameSocket } from './game-socket.type.js';
import { toErrorPayload } from './to-error-payload.js';

/** Everything `GameGateway` learns about a socket from its handshake (docs/SPEC.md's "SESIONES
 *  MULTI-PESTAÑA": `auth: { token, tabId }`, `playerKey = userId:tabId`), kept on
 *  `socket.data` for the lifetime of the connection. `token` is kept verbatim so it can be
 *  handed straight back as `MatchJoinAck.token` - the same bearer token already doubles as
 *  the rejoin credential (`match:rejoin { token }`), no separate session token to mint. */
interface SocketAuth {
    userId: string;
    tabId: string;
    token: string;
}

/** How long a dropped connection keeps its seat: enough for a reload, a network blip or a
 *  phone that briefly switches apps (mobile browsers suspend background tabs). */
const RECONNECT_GRACE_MS = 45_000;

interface RequestMeta {
    nickname: string;
    avatarSeed: string;
}

/**
 * Socket.IO gateway on namespace `/game` (docs/SPEC.md's "CONTRATO DE EVENTOS SOCKET.IO"). This
 * first slice only wires the join flows (direct `match:join` plus the new request/approve
 * `match:requestJoin`/`match:respondJoin`) - the rest of the event table (`match:create`,
 * `match:start`, `round:*`, ...) lands with `MatchRuntimeService` in a later phase.
 *
 * CORS is intentionally permissive here (`origin: true`, i.e. reflect the caller) rather than
 * reusing `CORS_ORIGINS`: Socket.IO's own CORS check runs independently of `app.enableCors()`
 * in `main.ts` (different transport layer), and `@WebSocketGateway`'s options are evaluated at
 * class-decoration time, before Nest's DI/`ConfigService` exist to read `CORS_ORIGINS` from.
 * Tightening this to the real origin whitelist is a `main.ts`-level concern for a later phase,
 * not something worth wiring a second, ad hoc env read for here.
 */
// CORS for this namespace is enforced by `KarduxIoAdapter` (main.ts) from `CORS_ORIGINS`.
@WebSocketGateway({ namespace: '/game' })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    @WebSocketServer()
    private readonly server!: Server<ClientEvents, ServerEvents>;

    private readonly logger = new Logger(GameGateway.name);

    /** Message timestamps per socket, for `chat:send`'s rate limit - a plain in-memory sliding
     *  window is enough for this project's scale (docs/SPEC.md just asks for "rate-limited,
     *  sanitizado", not a specific algorithm). */
    private readonly chatTimestamps = new Map<GameSocket, number[]>();

    /** Every live socket for a given `Player.id`, so a host/requester can be reached without
     *  them having joined any particular match room yet (e.g. a host who created the match
     *  over REST and is only sitting on the lobby screen still gets `match:joinRequested`).
     *  A `Set` per user, not a single socket, since nothing stops a user from having more than
     *  one live connection at once (e.g. a stale tab that hasn't disconnected yet). */
    private readonly socketsByUser = new Map<string, Set<GameSocket>>();

    /** `nickname`/`avatarSeed` chosen at `match:requestJoin` time, kept just long enough to
     *  reuse them in the `match:playerJoined` broadcast if/when the host approves - `MatchPlayer`
     *  itself has no nickname/avatar columns (out of scope for this slice), so this is the only
     *  place that memory lives between the two events. Falls back to the requester's `Player`
     *  record (see `respondJoin`) if the process restarted in between and lost this map. */
    private readonly pendingRequestMeta = new Map<string, RequestMeta>();

    /** Which match each socket is seated in, so a disconnect knows what seat to hold. */
    private readonly seatBySocket = new Map<GameSocket, { matchId: string; playerId: string }>();

    /** Seats of players whose connection dropped, released when the grace period ends. */
    private readonly graceTimers = new Map<string, NodeJS.Timeout>();

    constructor(
        private readonly gameService: GameService,
        private readonly jwtService: JwtService,
        private readonly matchRuntime: MatchRuntimeService,
        private readonly matchService: MatchService,
    ) {}

    afterInit(server: Server<ClientEvents, ServerEvents>): void {
        this.matchRuntime.setServer(server);
        // Seats held across a restart lost their grace timers with the old process: once the
        // grace window has passed, whoever did not reconnect is treated as having left.
        setTimeout(() => void this.releaseAbandonedSeats(), RECONNECT_GRACE_MS).unref();
    }

    private async releaseAbandonedSeats(): Promise<void> {
        try {
            const connected = new Set([...this.seatBySocket.values()].map((seat) => seat.playerId));
            for (const match of await this.gameService.listActiveMatches()) {
                for (const playerId of await this.matchRuntime.seatedHumans(match.id)) {
                    if (!connected.has(playerId)) {
                        await this.matchRuntime.abandon(match.id, playerId);
                    }
                }
            }
        } catch (error) {
            this.logger.warn(`Could not release abandoned seats: ${(error as Error).message}`);
        }
    }

    async handleConnection(client: GameSocket): Promise<void> {
        const handshakeAuth = client.handshake.auth as { token?: unknown; tabId?: unknown };
        const { token, tabId } = handshakeAuth;

        if (typeof token !== 'string' || token.length === 0) {
            this.rejectConnection(client, 'Missing token in the socket handshake.');
            return;
        }

        if (typeof tabId !== 'string' || tabId.length === 0) {
            this.rejectConnection(client, 'Missing tabId in the socket handshake.');
            return;
        }

        try {
            const payload = await this.jwtService.verifyAsync<GuestJwtPayload>(token);

            if (payload.tabId !== tabId) {
                this.rejectConnection(
                    client,
                    'tabId does not match the tab this token was issued for.',
                );
                return;
            }

            const auth: SocketAuth = { userId: payload.sub, tabId, token };
            client.data.auth = auth;
            this.registerSocket(auth.userId, client);
        } catch {
            this.rejectConnection(client, 'Invalid or expired token.');
        }
    }

    handleDisconnect(client: GameSocket): void {
        const auth = client.data.auth as SocketAuth | undefined;
        this.chatTimestamps.delete(client);

        if (auth) {
            this.unregisterSocket(auth.userId, client);
        }

        const seat = this.seatBySocket.get(client);
        this.seatBySocket.delete(client);
        if (seat) this.holdSeat(seat.matchId, seat.playerId);
    }

    /** A reload reconnects with the same `userId:tabId`; if nothing comes back in time, the
     *  player is treated exactly as if they had pressed "Abandonar". */
    private holdSeat(matchId: string, playerId: string): void {
        clearTimeout(this.graceTimers.get(playerId));
        const timer = setTimeout(() => {
            this.graceTimers.delete(playerId);
            const back = [...this.seatBySocket.values()].some(
                (seat) => seat.matchId === matchId && seat.playerId === playerId,
            );
            if (!back) {
                void this.matchRuntime.abandon(matchId, playerId).catch((error: unknown) => {
                    this.logger.warn(`Could not release seat: ${(error as Error).message}`);
                });
            }
        }, RECONNECT_GRACE_MS);
        timer.unref();
        this.graceTimers.set(playerId, timer);
    }

    private trackSeat(client: GameSocket, matchId: string, playerId: string): void {
        this.seatBySocket.set(client, { matchId, playerId });
        clearTimeout(this.graceTimers.get(playerId));
        this.graceTimers.delete(playerId);
    }

    /**
     * Direct join - existing contract (docs/SPEC.md): code + nickname + avatarSeed, immediate
     * `APPROVED` seat, or the typed `ERR_MATCH_FULL` if the room is already at `maxPlayers`
     * (counting only `APPROVED` players).
     */
    @SubscribeMessage('match:join')
    async handleJoin(
        @ConnectedSocket() client: GameSocket,
        @MessageBody() body: unknown,
    ): Promise<AckResponse<MatchJoinAck>> {
        try {
            const payload: MatchJoinPayload = matchJoinPayloadSchema.parse(body);
            return await this.joinByCode(client, this.requireAuth(client), payload.code);
        } catch (error) {
            return toErrorPayload(error);
        }
    }

    /**
     * Quick match (guests included): sit in the oldest open public lobby that still has a
     * live player waiting in it, or open a fresh one. No approval step - the lobby
     * auto-starts as soon as `autoStartPlayers` are seated.
     */
    @SubscribeMessage('match:quick')
    async handleQuick(
        @ConnectedSocket() client: GameSocket,
        @MessageBody() body: unknown,
    ): Promise<AckResponse<MatchJoinAck>> {
        try {
            const options = matchQuickPayloadSchema.parse(body ?? {});
            const auth = this.requireAuth(client);
            const current = await this.gameService.findActiveMatchForUser(auth.userId);
            const waitingAlone =
                current !== null &&
                current.status === 'LOBBY' &&
                (current.config as { visibility?: string }).visibility === 'public' &&
                (await this.gameService.countSeated(current.id)) <= 1;

            if (current && !waitingAlone) {
                return await this.joinByCode(client, auth, current.code);
            }

            // Against the machine: a fresh lobby, the bot takes the other seat and it starts.
            if (options.vsBot) {
                if (current) await this.abandonLobby(client, auth, current.id);
                const created = await this.matchService.createQuickMatch(auth.userId, {
                    vsBot: true,
                });
                const ack = await this.joinByCode(client, auth, created.code);
                await this.matchRuntime.addBot(created.matchId);
                return ack;
            }

            // Pair with someone already waiting. When two players search at the same time each
            // ends up alone in their own lobby; the waiting room re-sends `match:quick` every few
            // seconds, and only the *newer* lobby moves into the older one (deterministic
            // tie-break, so the two never swap past each other).
            const candidates = await this.matchService.listQuickCandidates(auth.userId);
            for (const candidate of candidates) {
                if (current && candidate.createdAt >= current.createdAt.toISOString()) continue;
                const waiting = await this.server.in(candidate.matchId).fetchSockets();
                const phase = await this.matchRuntime.phaseOf(candidate.matchId);
                if (waiting.length > 0 && phase === 'LOBBY') {
                    if (current) await this.abandonLobby(client, auth, current.id);
                    return await this.joinByCode(client, auth, candidate.code);
                }
            }

            if (current) {
                return await this.joinByCode(client, auth, current.code);
            }

            const created = await this.matchService.createQuickMatch(auth.userId);
            return await this.joinByCode(client, auth, created.code);
        } catch (error) {
            return toErrorPayload(error);
        }
    }

    /** Seats (or re-seats) the caller and pushes them a fresh snapshot. Nickname/avatar always
     *  come from the caller's `Player` row - a client can't impersonate another name. */
    private async joinByCode(
        client: GameSocket,
        auth: SocketAuth,
        code: string,
    ): Promise<MatchJoinAck> {
        const { match, created } = await this.gameService.joinDirect(auth.userId, code);
        const user = await this.gameService.getPlayer(auth.userId);
        const playerId = this.playerKey(auth);

        const refused = await this.matchRuntime.playerJoin(
            match.id,
            playerId,
            user.nickname,
            user.avatarSeed,
        );
        if (refused) {
            if (created) await this.gameService.releaseSeat(match.id, auth.userId);
            throw new KarduxError(refused.code, refused.message);
        }

        await this.leaveOtherMatchRooms(client, match.id);
        await client.join(match.id);
        this.trackSeat(client, match.id, playerId);
        await this.matchRuntime.rejoin(match.id, client, playerId);

        return { code: match.code, matchId: match.id, token: auth.token, playerId };
    }

    /** Drops the caller's own empty quick lobby before moving them into another one. */
    private async abandonLobby(
        client: GameSocket,
        auth: SocketAuth,
        matchId: string,
    ): Promise<void> {
        this.seatBySocket.delete(client);
        await client.leave(matchId);
        await this.matchRuntime.abandon(matchId, this.playerKey(auth));
    }

    private async leaveOtherMatchRooms(client: GameSocket, keepMatchId: string): Promise<void> {
        for (const room of client.rooms) {
            if (room !== client.id && room !== keepMatchId) await client.leave(room);
        }
    }

    /**
     * Request join - discovery flow (`GET /matches/public`, no code): creates a `PENDING`
     * `MatchPlayer` row and notifies the host, instead of seating the requester immediately.
     * No ack: the requester and the host each learn the outcome through their own
     * server-pushed events.
     */
    @SubscribeMessage('match:requestJoin')
    async handleRequestJoin(
        @ConnectedSocket() client: GameSocket,
        @MessageBody() body: unknown,
    ): Promise<void> {
        try {
            const payload: MatchRequestJoinPayload = matchRequestJoinPayloadSchema.parse(body);
            const auth = this.requireAuth(client);
            const { match, requestId } = await this.gameService.requestJoin(
                auth.userId,
                payload.matchId,
            );

            this.pendingRequestMeta.set(requestId, {
                nickname: payload.nickname,
                avatarSeed: payload.avatarSeed,
            });

            client.emit('match:joinRequestPending', { requestId });
            this.emitToUser(match.hostId, (socket) =>
                socket.emit('match:joinRequested', {
                    requestId,
                    nickname: payload.nickname,
                    avatarSeed: payload.avatarSeed,
                }),
            );
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    /**
     * Host decision on a pending request. Host-only (validated against `Match.hostId`); no
     * ack, the requester learns the outcome via `match:joinApproved`/`match:joinRejected`.
     */
    @SubscribeMessage('match:respondJoin')
    async handleRespondJoin(
        @ConnectedSocket() client: GameSocket,
        @MessageBody() body: unknown,
    ): Promise<void> {
        try {
            const payload: MatchRespondJoinPayload = matchRespondJoinPayloadSchema.parse(body);
            const auth = this.requireAuth(client);
            const result = await this.gameService.respondJoin(
                auth.userId,
                payload.requestId,
                payload.accept,
            );

            if (result.outcome === 'rejected') {
                this.pendingRequestMeta.delete(payload.requestId);
                this.emitToUser(result.matchPlayer.userId, (socket) =>
                    socket.emit('match:joinRejected', { requestId: payload.requestId }),
                );
                return;
            }

            const meta = this.pendingRequestMeta.get(payload.requestId);
            const nickname = meta?.nickname ?? result.matchPlayer.user.nickname;
            const avatarSeed = meta?.avatarSeed ?? result.matchPlayer.user.avatarSeed;
            this.pendingRequestMeta.delete(payload.requestId);

            const requesterSockets = this.socketsByUser.get(result.matchPlayer.userId);

            if (!requesterSockets || requesterSockets.size === 0) {
                this.logger.warn(
                    `Approved join request ${payload.requestId} for a requester with no live socket.`,
                );
                return;
            }

            for (const socket of requesterSockets) {
                const requesterAuth = this.requireAuth(socket);
                await socket.join(result.match.id);

                const approvedPayload: MatchJoinApprovedPayload = {
                    requestId: payload.requestId,
                    code: result.match.code,
                    matchId: result.match.id,
                    token: requesterAuth.token,
                    playerId: this.playerKey(requesterAuth),
                };
                socket.emit('match:joinApproved', approvedPayload);

                await this.matchRuntime.playerJoin(
                    result.match.id,
                    this.playerKey(requesterAuth),
                    nickname,
                    avatarSeed,
                );
            }
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    /**
     * Reconnection (docs/SPEC.md's "reconexión con gracia de 45 s"): the socket handshake already
     * re-authenticated this connection (same `token`/`tabId` check as any other message), so
     * this just needs to find which active match `auth.userId` currently has an `APPROVED`
     * seat in and push a fresh redacted snapshot - the engine never dropped them from
     * `turnOrder` on disconnect in the first place (see `handleDisconnect`), so there's no
     * state to "restore" beyond letting their socket see it again.
     */
    @SubscribeMessage('match:rejoin')
    async handleRejoin(
        @ConnectedSocket() client: GameSocket,
        @MessageBody() body: unknown,
    ): Promise<AckResponse<MatchJoinAck>> {
        try {
            matchRejoinPayloadSchema.parse(body);
            const auth = this.requireAuth(client);
            const match = await this.gameService.findActiveMatchForUser(auth.userId);

            if (!match) {
                throw new KarduxError('ERR_MATCH_NOT_FOUND');
            }

            const playerId = this.playerKey(auth);
            const rejoined = await this.matchRuntime.rejoin(match.id, client, playerId);

            if (!rejoined) {
                // A lobby simply re-seats you; a started match you're not part of can't be
                // resumed from this tab.
                if (match.status === 'LOBBY') {
                    return await this.joinByCode(client, auth, match.code);
                }
                throw new KarduxError('ERR_MATCH_NOT_FOUND');
            }

            await this.leaveOtherMatchRooms(client, match.id);
            await client.join(match.id);
            this.trackSeat(client, match.id, playerId);

            return { code: match.code, matchId: match.id, token: auth.token, playerId };
        } catch (error) {
            return toErrorPayload(error);
        }
    }

    @SubscribeMessage('match:config')
    async handleConfig(
        @ConnectedSocket() client: GameSocket,
        @MessageBody() body: unknown,
    ): Promise<void> {
        try {
            const patch = matchConfigPatchSchema.parse(body);
            const auth = this.requireAuth(client);
            const matchId = this.currentMatchRoom(client);
            if (!matchId) throw new KarduxError('ERR_MATCH_NOT_FOUND');

            await this.matchRuntime.configure(matchId, client, this.playerKey(auth), patch);
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    @SubscribeMessage('match:start')
    async handleStart(@ConnectedSocket() client: GameSocket): Promise<void> {
        try {
            const auth = this.requireAuth(client);
            const matchId = this.currentMatchRoom(client);
            if (!matchId) throw new KarduxError('ERR_MATCH_NOT_FOUND');

            await this.matchRuntime.start(matchId, client, this.playerKey(auth));
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    @SubscribeMessage('match:cancelCountdown')
    async handleCancelCountdown(@ConnectedSocket() client: GameSocket): Promise<void> {
        try {
            const auth = this.requireAuth(client);
            const matchId = this.currentMatchRoom(client);
            if (!matchId) throw new KarduxError('ERR_MATCH_NOT_FOUND');

            await this.matchRuntime.cancelCountdown(matchId, client, this.playerKey(auth));
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    /** "Abandonar": always final - see `MatchRuntimeService.abandon`. */
    @SubscribeMessage('match:leave')
    async handleLeave(@ConnectedSocket() client: GameSocket): Promise<void> {
        const auth = client.data.auth as SocketAuth | undefined;
        const matchId = this.currentMatchRoom(client);
        if (!auth || !matchId) return;

        this.seatBySocket.delete(client);
        await client.leave(matchId);
        await this.matchRuntime.abandon(matchId, this.playerKey(auth)).catch((error: unknown) => {
            this.logger.warn(`Could not record leave: ${(error as Error).message}`);
        });
    }

    @SubscribeMessage('round:selectAttribute')
    async handleSelectAttribute(
        @ConnectedSocket() client: GameSocket,
        @MessageBody() body: unknown,
    ): Promise<void> {
        try {
            const payload = roundSelectAttributePayloadSchema.parse(body);
            const auth = this.requireAuth(client);
            const matchId = this.currentMatchRoom(client);
            if (!matchId) throw new KarduxError('ERR_MATCH_NOT_FOUND');

            await this.matchRuntime.selectAttribute(
                matchId,
                client,
                this.playerKey(auth),
                payload.attribute,
            );
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    @SubscribeMessage('round:playCard')
    async handlePlayCard(
        @ConnectedSocket() client: GameSocket,
        @MessageBody() body: unknown,
    ): Promise<void> {
        try {
            roundPlayCardPayloadSchema.parse(body ?? {});
            const auth = this.requireAuth(client);
            const matchId = this.currentMatchRoom(client);
            if (!matchId) throw new KarduxError('ERR_MATCH_NOT_FOUND');

            await this.matchRuntime.playCard(matchId, client, this.playerKey(auth));
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    /** Rate-limited (max 5 messages / 3s per socket) and lightly sanitized (control characters
     *  stripped - `chatSendPayloadSchema` already caps length at 500). Broadcast to the whole
     *  match room, including the sender (simplest "message sent" confirmation - no separate
     *  ack). */
    @SubscribeMessage('chat:send')
    handleChatSend(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): void {
        try {
            const payload = chatSendPayloadSchema.parse(body);
            const auth = this.requireAuth(client);
            const matchId = this.currentMatchRoom(client);
            if (!matchId) throw new KarduxError('ERR_MATCH_NOT_FOUND');

            if (!this.checkChatRateLimit(client)) {
                throw new KarduxError('ERR_RATE_LIMITED');
            }

            // eslint-disable-next-line no-control-regex
            const text = payload.text.replace(/[\u0000-\u001f\u007f]/g, '').trim();
            if (text.length === 0) return;

            this.server.to(matchId).emit('chat:message', {
                playerId: this.playerKey(auth),
                text,
                at: Date.now(),
            });
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    @SubscribeMessage('ping:latency')
    handlePingLatency(@ConnectedSocket() client: GameSocket, @MessageBody() body: unknown): void {
        try {
            const payload = pingLatencyPayloadSchema.parse(body);
            client.emit('pong:latency', { t: payload.t, serverTime: Date.now() });
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    private checkChatRateLimit(client: GameSocket): boolean {
        const now = Date.now();
        const windowMs = 3_000;
        const maxMessages = 5;
        const timestamps = (this.chatTimestamps.get(client) ?? []).filter(
            (t) => now - t < windowMs,
        );

        if (timestamps.length >= maxMessages) {
            this.chatTimestamps.set(client, timestamps);
            return false;
        }

        timestamps.push(now);
        this.chatTimestamps.set(client, timestamps);
        return true;
    }

    /** A socket only ever joins one match room in this MVP (`client.rooms` also always
     *  contains the socket's own id as its default room, which is never a valid matchId). */
    private currentMatchRoom(client: GameSocket): string | undefined {
        return [...client.rooms].find((room) => room !== client.id);
    }

    private playerKey(auth: SocketAuth): string {
        return `${auth.userId}:${auth.tabId}`;
    }

    private requireAuth(client: GameSocket): SocketAuth {
        const auth = client.data.auth as SocketAuth | undefined;

        if (!auth) {
            throw new KarduxError('ERR_UNAUTHORIZED');
        }

        return auth;
    }

    private registerSocket(userId: string, client: GameSocket): void {
        const sockets = this.socketsByUser.get(userId) ?? new Set<GameSocket>();
        sockets.add(client);
        this.socketsByUser.set(userId, sockets);
    }

    private unregisterSocket(userId: string, client: GameSocket): void {
        const sockets = this.socketsByUser.get(userId);

        if (!sockets) {
            return;
        }

        sockets.delete(client);

        if (sockets.size === 0) {
            this.socketsByUser.delete(userId);
        }
    }

    private emitToUser(userId: string, emit: (socket: GameSocket) => void): void {
        const sockets = this.socketsByUser.get(userId);

        if (!sockets) {
            return;
        }

        for (const socket of sockets) {
            emit(socket);
        }
    }

    private rejectConnection(client: GameSocket, message: string): void {
        client.emit('error', { code: 'ERR_UNAUTHORIZED', message });
        client.disconnect(true);
    }
}
