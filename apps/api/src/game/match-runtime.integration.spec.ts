import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { MatchConfig, MatchFinishedPayload, PublicRoundView } from '@kardux/contracts';
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

function once<T>(socket: ClientSocket, event: string): Promise<T> {
    return new Promise((resolve) => socket.once(event, (payload: T) => resolve(payload)));
}

/**
 * End-to-end proof that a match is actually playable, not just joinable - the gap
 * `MatchRuntimeService` closes. Uses tiny decks (1 pack x 2 cards) so a "full match" is a
 * single round, keeping these fast and deterministic without needing to reverse-engineer the
 * `local` deck source's hashed stats to predict a winner in advance.
 */
describe('MatchRuntimeService (real game loop, via sockets)', () => {
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
            await prisma.matchEvent.deleteMany({ where: { matchId: { in: createdMatchIds } } });
            await prisma.round.deleteMany({ where: { matchId: { in: createdMatchIds } } });
            await prisma.deckSnapshot.deleteMany({ where: { matchId: { in: createdMatchIds } } });
            await prisma.match.deleteMany({ where: { id: { in: createdMatchIds.splice(0) } } });
        }
        if (createdUserIds.length > 0) {
            // Finished matches between accounts are rated, so their stats go first.
            await prisma.leaderboardStat.deleteMany({ where: { userId: { in: createdUserIds } } });
            await prisma.player.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
        }
    });

    afterAll(async () => {
        await app.close();
    });

    async function createRegisteredUser(username: string) {
        const user = await prisma.player.create({
            data: { nickname: username, avatarSeed: username, username, passwordHash: 'x' },
        });
        createdUserIds.push(user.id);
        return user;
    }

    async function createMatch(hostId: string, overrides: Partial<MatchConfig>) {
        const config = matchConfigSchema.parse({
            visibility: 'public',
            deckSources: ['pokeapi'],
            packs: 1,
            cardsPerPack: 2,
            attributeCount: 3,
            minPlayers: 2,
            maxPlayers: 2,
            autoStartPlayers: 2,
            autoStartCountdownMs: 0,
            turnTimeoutMs: 0,
            matchDurationMs: 0,
            ...overrides,
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

    it('plays a full match to completion - one player ends up with the whole deck', async () => {
        const host = await createRegisteredUser(`host-${randomUUID().slice(0, 8)}`);
        const player = await createRegisteredUser(`player-${randomUUID().slice(0, 8)}`);
        const match = await createMatch(host.id, {});

        const hostSocket = await connect(host.id, 'Host');
        const playerSocket = await connect(player.id, 'Player');

        const startedPromise = once<void>(hostSocket, 'match:started');
        const roundStartedPromise = once<PublicRoundView>(hostSocket, 'round:started');
        const finishedPromise = once<MatchFinishedPayload>(hostSocket, 'match:finished');

        await hostSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Host',
            avatarSeed: 'host-1',
        });
        await playerSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Player',
            avatarSeed: 'player-1',
        });

        // autoStartPlayers=2, autoStartCountdownMs=0 - joining the 2nd player alone triggers
        // the countdown, then an immediate `system.tick` deals the deck and starts the match.
        await startedPromise;

        // Whoever the engine picked as leader is unknown to the test in advance - both sockets
        // attempt to select an attribute; only the real leader's attempt succeeds, the other
        // gets a harmless `ERR_NOT_YOUR_TURN` this test doesn't assert on.
        // 'hp' is always the Pokémon deck's first attribute.
        hostSocket.emit('round:selectAttribute', { attribute: 'hp' });
        playerSocket.emit('round:selectAttribute', { attribute: 'hp' });

        const round = await roundStartedPromise;
        expect(round.playOrder).toHaveLength(2);

        for (const playerId of round.playOrder) {
            // `playerId` is the engine's `userId:tabId` playerKey, not the bare `Player.id`.
            const socket = playerId.startsWith(`${host.id}:`) ? hostSocket : playerSocket;
            socket.emit('round:playCard');
        }

        const finished = await finishedPromise;

        expect(finished.standings).toHaveLength(2);
        expect(finished.isDraw).toBe(false);
        expect(finished.winnerId).not.toBeNull();
        const winnerStanding = finished.standings.find((p) => p.id === finished.winnerId);
        expect(winnerStanding?.cardCount).toBe(2);

        const persistedMatch = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
        expect(persistedMatch.status).toBe('FINISHED');
        expect(persistedMatch.isDraw).toBe(false);

        const deckSnapshot = await prisma.deckSnapshot.findUnique({ where: { matchId: match.id } });
        expect(deckSnapshot?.cards).toHaveLength(2);

        const rounds = await prisma.round.findMany({ where: { matchId: match.id } });
        expect(rounds).toHaveLength(1);
        expect((rounds[0]?.playedCards as Record<string, unknown>) ?? {}).toBeTruthy();
    }, 10_000);

    it('ends the match by matchDurationMs, declaring a draw when nobody played a round', async () => {
        const host = await createRegisteredUser(`host-${randomUUID().slice(0, 8)}`);
        const player = await createRegisteredUser(`player-${randomUUID().slice(0, 8)}`);
        const match = await createMatch(host.id, { matchDurationMs: 300 });

        const hostSocket = await connect(host.id, 'Host');
        const playerSocket = await connect(player.id, 'Player');

        const finishedPromise = once<MatchFinishedPayload>(hostSocket, 'match:finished');

        await hostSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Host',
            avatarSeed: 'host-1',
        });
        await playerSocket.timeout(2000).emitWithAck('match:join', {
            code: match.code,
            nickname: 'Player',
            avatarSeed: 'player-1',
        });

        // No round action sent at all - `matchDurationMs` (300ms) elapses on its own via the
        // scheduled `system.tick`, and both players are tied at 1 card each (1 pack x 2 cards).
        const finished = await finishedPromise;

        expect(finished.isDraw).toBe(true);
        expect(finished.winnerId).toBeNull();

        const persistedMatch = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
        expect(persistedMatch.status).toBe('FINISHED');
        expect(persistedMatch.isDraw).toBe(true);
        expect(persistedMatch.winnerId).toBeNull();
    }, 10_000);
});
