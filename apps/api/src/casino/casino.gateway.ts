import type {
    CasinoClientEvents,
    CasinoJoinAck,
    CasinoServerEvents,
    ErrorPayload,
    GuestJwtPayload,
} from '@kardux/contracts';
import type { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { casinoActionPayloadSchema, casinoJoinPayloadSchema } from '@kardux/contracts';
import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
} from '@nestjs/websockets';
// Value imports required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JwtService } from '@nestjs/jwt';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CasinoRuntimeService } from './casino-runtime.service.js';
import { KarduxError } from '../common/kardux-error.js';
import { toErrorPayload } from '../game/to-error-payload.js';

type CasinoSocket = Socket<CasinoClientEvents, CasinoServerEvents>;

/**
 * Socket.IO gateway on namespace `/casino`: blackjack and Texas Hold'em tables. Same handshake
 * as `/game` (`auth: { token, tabId }`); table logic lives in `CasinoRuntimeService`.
 */
@WebSocketGateway({ namespace: '/casino' })
export class CasinoGateway implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
    /** Live sockets per player: the seat is only released when the last one disconnects. */
    private readonly socketsByUser = new Map<string, Set<CasinoSocket>>();

    constructor(
        private readonly jwtService: JwtService,
        private readonly runtime: CasinoRuntimeService,
    ) {}

    afterInit(server: Namespace<CasinoClientEvents, CasinoServerEvents>): void {
        this.runtime.setServer(server);
    }

    async handleConnection(client: CasinoSocket): Promise<void> {
        const { token, tabId } = client.handshake.auth as { token?: unknown; tabId?: unknown };
        try {
            if (typeof token !== 'string' || typeof tabId !== 'string') throw new Error('No auth');
            const payload = await this.jwtService.verifyAsync<GuestJwtPayload>(token);
            if (payload.tabId !== tabId) throw new Error('Tab mismatch');
            client.data = { auth: { userId: payload.sub, tabId } };
            const sockets = this.socketsByUser.get(payload.sub) ?? new Set<CasinoSocket>();
            sockets.add(client);
            this.socketsByUser.set(payload.sub, sockets);
            client.emit('casino:wallet', await this.runtime.wallet(payload.sub));
        } catch {
            client.emit('error', {
                code: 'ERR_UNAUTHORIZED',
                message: 'Invalid or expired token.',
            });
            client.disconnect(true);
        }
    }

    handleDisconnect(client: CasinoSocket): void {
        const userId = this.userOf(client);
        if (!userId) return;
        const sockets = this.socketsByUser.get(userId);
        sockets?.delete(client);
        if (sockets && sockets.size > 0) return;
        this.socketsByUser.delete(userId);
        this.runtime.scheduleAbsence(userId);
    }

    @SubscribeMessage('casino:join')
    async handleJoin(
        @ConnectedSocket() client: CasinoSocket,
        @MessageBody() body: unknown,
    ): Promise<CasinoJoinAck | ErrorPayload> {
        try {
            const payload = casinoJoinPayloadSchema.parse(body);
            return await this.runtime.sit(
                this.requireUser(client),
                client,
                payload.game,
                payload.tier,
            );
        } catch (error) {
            return toErrorPayload(error);
        }
    }

    @SubscribeMessage('casino:action')
    async handleAction(
        @ConnectedSocket() client: CasinoSocket,
        @MessageBody() body: unknown,
    ): Promise<void> {
        try {
            await this.runtime.act(this.requireUser(client), casinoActionPayloadSchema.parse(body));
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    @SubscribeMessage('casino:leave')
    async handleLeave(@ConnectedSocket() client: CasinoSocket): Promise<void> {
        try {
            await this.runtime.leave(this.requireUser(client));
        } catch (error) {
            client.emit('error', toErrorPayload(error));
        }
    }

    private userOf(client: CasinoSocket): string | undefined {
        return (client.data as { auth?: { userId: string } } | undefined)?.auth?.userId;
    }

    private requireUser(client: CasinoSocket): string {
        const userId = this.userOf(client);
        if (!userId) throw new KarduxError('ERR_UNAUTHORIZED');
        return userId;
    }
}
