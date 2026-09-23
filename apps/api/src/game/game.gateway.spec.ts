import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import type {
    ErrorPayload,
    MatchJoinApprovedPayload,
    MatchJoinRejectedPayload,
    MatchJoinRequestedPayload,
    MatchJoinRequestPendingPayload,
    Player,
} from '@kardux/contracts';
import { matchConfigSchema } from '@kardux/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { JwtService } from '@nestjs/jwt';
import { io, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppConfigModule } from '../config/app-config.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GameModule } from './game.module.js';

/** Waits for the next occurrence of `event` on `socket` and resolves with its payload. */
function once<T>(socket: ClientSocket, event: string): Promise<T> {
    return new Promise((resolve) => socket.once(event, (payload: T) => resolve(payload)));
}

describe('GameGateway (/game)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let jwtService: JwtService;
    let baseUrl: string;

    const sockets: ClientSocket[] = [];
    const createdUserIds: string[] = [];
    const createdMatchIds: string[] = [];

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppConfigModule, PrismaModule, GameModule],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useWebSocketAdapter(new IoAdapter(app));
        await app.init();
        await app.listen(0);

        prisma = moduleRef.get(PrismaService);
        jwtService = moduleRef.get(JwtService, { strict: false });

        const address = app.getHttpServer().address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}/game`;
    });

    afterEach(async () => {
        for (const socket of sockets.splice(0)) {
            socket.disconnect();
        }
        if (createdMatchIds.length > 0) {
            await prisma.match.deleteMany({ where: { id: { in: createdMatchIds.splice(0) } } });
        }
        if (createdUserIds.length > 0) {
            await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
        }
    });

    afterAll(async () => {
        await app.close();
    });

    async function createUser(nickname: string) {
        const user = await prisma.user.create({ data: { nickname, avatarSeed: nickname } });
        createdUserIds.push(user.id);
        return user;
    }

    async function createMatch(hostId: string, maxPlayers: number) {
        // `autoStartPlayers` defaults to 7 and matchConfigSchema requires it to sit between
        // minPlayers and maxPlayers - pin it to maxPlayers so small-capacity test matches
        // (e.g. maxPlayers=2) don't fail that cross-field check.
        const config = matchConfigSchema.parse({
            visibility: 'public',
            maxPlayers,
            autoStartPlayers: maxPlayers,
        });
        const code = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
        const match = await prisma.match.create({
            data: { code, config, seed: randomUUID(), hostId },
        });
        createdMatchIds.push(match.id);
        return match;
    }

    async function connect(userId: string, nickname: string): Promise<ClientSocket> {
        const tabId = randomUUID();
        const token = await jwtService.signAsync({ sub: userId, tabId, nickname });
        const socket = io(baseUrl, {
            auth: { token, tabId },
            transports: ['websocket'],
            forceNew: true,
        });
        sockets.push(socket);

        await new Promise<void>((resolve, reject) => {
            socket.once('connect', () => resolve());
            socket.once('connect_error', reject);
        });

        return socket;
    }

    it('direct join succeeds and broadcasts match:playerJoined to the room', async () => {
        const host = await createUser('Host');
        const match = await createMatch(host.id, 7);
        const hostSocket = await connect(host.id, 'Host');

        await hostSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Host',
            avatarSeed: 'host-1',
        });

        const player = await createUser('Ash');
        const playerSocket = await connect(player.id, 'Ash');
        const broadcastPromise = once<Player>(hostSocket, 'match:playerJoined');

        const ack = await playerSocket
            .timeout(2000)
            .emitWithAck('match:join', { code: match.code, nickname: 'Ash', avatarSeed: 'ash-1' });

        expect(ack).toMatchObject({ code: match.code, matchId: match.id });
        expect((ack as { playerId: string }).playerId).toContain(player.id);

        const broadcast = await broadcastPromise;
        // Identity comes from the User row, never from the client payload.
        expect(broadcast).toMatchObject({
            nickname: 'Ash',
            avatarSeed: player.avatarSeed,
            seat: 1,
        });

        const row = await prisma.matchPlayer.findUnique({
            where: { matchId_userId: { matchId: match.id, userId: player.id } },
        });
        expect(row?.status).toBe('APPROVED');
    });

    it('direct join returns ERR_MATCH_FULL once the match is at capacity', async () => {
        // matchConfigSchema requires maxPlayers >= 2 - fill both seats (host + one filler)
        // before the player under test hits the cap.
        const host = await createUser('Host');
        const match = await createMatch(host.id, 2);
        const hostSocket = await connect(host.id, 'Host');
        await hostSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Host',
            avatarSeed: 'host-1',
        });

        const filler = await createUser('Brock');
        const fillerSocket = await connect(filler.id, 'Brock');
        await fillerSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Brock',
            avatarSeed: 'brock-1',
        });

        const player = await createUser('Ash');
        const playerSocket = await connect(player.id, 'Ash');

        const ack = (await playerSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Ash',
            avatarSeed: 'ash-1',
        })) as ErrorPayload;

        expect(ack.code).toBe('ERR_MATCH_FULL');

        const row = await prisma.matchPlayer.findUnique({
            where: { matchId_userId: { matchId: match.id, userId: player.id } },
        });
        expect(row).toBeNull();
    });

    it('request join stays pending until the host approves it, then broadcasts and notifies the requester', async () => {
        const host = await createUser('Host');
        const match = await createMatch(host.id, 7);
        const hostSocket = await connect(host.id, 'Host');
        await hostSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Host',
            avatarSeed: 'host-1',
        });

        const requester = await createUser('Requester');
        const requesterSocket = await connect(requester.id, 'Requester');

        const requestedPromise = once<MatchJoinRequestedPayload>(hostSocket, 'match:joinRequested');
        const pendingPromise = once<MatchJoinRequestPendingPayload>(
            requesterSocket,
            'match:joinRequestPending',
        );

        requesterSocket.emit('match:requestJoin', {
            matchId: match.id,
            nickname: 'Requester',
            avatarSeed: 'req-1',
        });

        const [requested, pending] = await Promise.all([requestedPromise, pendingPromise]);
        expect(requested).toMatchObject({ nickname: 'Requester', avatarSeed: 'req-1' });
        expect(pending.requestId).toBe(requested.requestId);

        const pendingRow = await prisma.matchPlayer.findUnique({
            where: { matchId_userId: { matchId: match.id, userId: requester.id } },
        });
        expect(pendingRow?.status).toBe('PENDING');

        const approvedPromise = once<MatchJoinApprovedPayload>(
            requesterSocket,
            'match:joinApproved',
        );
        const broadcastPromise = once<Player>(hostSocket, 'match:playerJoined');

        hostSocket.emit('match:respondJoin', { requestId: requested.requestId, accept: true });

        const [approved, broadcast] = await Promise.all([approvedPromise, broadcastPromise]);
        expect(approved).toMatchObject({
            requestId: requested.requestId,
            matchId: match.id,
            code: match.code,
        });
        expect(broadcast).toMatchObject({ nickname: 'Requester', avatarSeed: 'req-1', seat: 1 });

        const approvedRow = await prisma.matchPlayer.findUnique({
            where: { matchId_userId: { matchId: match.id, userId: requester.id } },
        });
        expect(approvedRow?.status).toBe('APPROVED');
    });

    it('request join is rejected by the host and the row is kept as REJECTED', async () => {
        const host = await createUser('Host');
        const match = await createMatch(host.id, 7);
        const hostSocket = await connect(host.id, 'Host');
        await hostSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Host',
            avatarSeed: 'host-1',
        });

        const requester = await createUser('Requester');
        const requesterSocket = await connect(requester.id, 'Requester');

        const requestedPromise = once<MatchJoinRequestedPayload>(hostSocket, 'match:joinRequested');
        requesterSocket.emit('match:requestJoin', {
            matchId: match.id,
            nickname: 'Requester',
            avatarSeed: 'req-1',
        });
        const requested = await requestedPromise;

        const rejectedPromise = once<MatchJoinRejectedPayload>(
            requesterSocket,
            'match:joinRejected',
        );
        hostSocket.emit('match:respondJoin', { requestId: requested.requestId, accept: false });

        const rejected = await rejectedPromise;
        expect(rejected.requestId).toBe(requested.requestId);

        const row = await prisma.matchPlayer.findUnique({
            where: { matchId_userId: { matchId: match.id, userId: requester.id } },
        });
        expect(row?.status).toBe('REJECTED');
    });

    it('request join returns immediate ERR_MATCH_FULL with no pending row when the match is already full', async () => {
        // matchConfigSchema requires maxPlayers >= 2 - fill both seats (host + one filler)
        // before the requester under test hits the cap.
        const host = await createUser('Host');
        const match = await createMatch(host.id, 2);
        const hostSocket = await connect(host.id, 'Host');
        await hostSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Host',
            avatarSeed: 'host-1',
        });

        const filler = await createUser('Brock');
        const fillerSocket = await connect(filler.id, 'Brock');
        await fillerSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Brock',
            avatarSeed: 'brock-1',
        });

        const requester = await createUser('Requester');
        const requesterSocket = await connect(requester.id, 'Requester');

        const errorPromise = once<ErrorPayload>(requesterSocket, 'error');
        requesterSocket.emit('match:requestJoin', {
            matchId: match.id,
            nickname: 'Requester',
            avatarSeed: 'req-1',
        });

        const error = await errorPromise;
        expect(error.code).toBe('ERR_MATCH_FULL');

        const row = await prisma.matchPlayer.findUnique({
            where: { matchId_userId: { matchId: match.id, userId: requester.id } },
        });
        expect(row).toBeNull();
    });

    it('rejects a handshake missing tabId/token with ERR_UNAUTHORIZED and disconnects', async () => {
        const socket = io(baseUrl, {
            auth: { token: 'not-a-real-token' },
            transports: ['websocket'],
            forceNew: true,
        });
        sockets.push(socket);

        const errorPromise = once<ErrorPayload>(socket, 'error');
        const error = await errorPromise;

        expect(error.code).toBe('ERR_UNAUTHORIZED');
    });
});
