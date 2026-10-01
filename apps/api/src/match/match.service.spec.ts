import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { KarduxError } from '../common/kardux-error.js';
import { MatchService } from './match.service.js';

const HOST = { id: 'host-1', nickname: 'RafArenas', avatarSeed: 'RafArenas' };
// Registered (has `username`) - a pure guest can join a match but not host one.
const REGISTERED_HOST = { ...HOST, username: 'raf_arenas', passwordHash: 'hashed' };

function createService(overrides: Partial<Record<string, unknown>> = {}) {
    const prisma = {
        match: {
            create: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
        },
        player: {
            findUnique: vi.fn().mockResolvedValue(REGISTERED_HOST),
        },
        ...overrides,
    } as unknown as PrismaService;

    return { service: new MatchService(prisma), prisma };
}

describe('MatchService.createMatch', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('fills MatchConfig defaults and persists a LOBBY match under the caller as host', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findFirst).mockResolvedValue(null); // no code collision
        vi.mocked(prisma.match.create).mockResolvedValue({
            id: 'match-1',
            code: 'ABCDEF',
            status: 'LOBBY',
            config: { visibility: 'public', minPlayers: 2, maxPlayers: 7 },
            hostId: HOST.id,
            host: HOST,
            _count: { players: 0 },
            createdAt: new Date('2026-09-21T00:00:00.000Z'),
        } as never);

        // Private is forced even if the caller asks for public.
        const result = await service.createMatch(HOST.id, { visibility: 'public' });

        expect(prisma.match.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    hostId: HOST.id,
                    config: expect.objectContaining({ visibility: 'private' }),
                }),
            }),
        );
        expect(result).toMatchObject({
            matchId: 'match-1',
            code: 'ABCDEF',
            status: 'LOBBY',
            hostId: HOST.id,
            hostNickname: HOST.nickname,
            hostAvatarUrl: expect.stringMatching(/^data:image\/svg\+xml/),
            playerCount: 0,
        });
    });

    it('rejects a config that fails MatchConfig cross-field rules', async () => {
        const { service } = createService();

        await expect(
            service.createMatch(HOST.id, { minPlayers: 10, maxPlayers: 2 }),
        ).rejects.toThrow(KarduxError);
    });

    it('rejects hosting for a caller with no username (pure guest)', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.player.findUnique).mockResolvedValue({ ...HOST, username: null } as never);

        const error = await service
            .createMatch(HOST.id, { visibility: 'public' })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KarduxError);
        expect((error as KarduxError).code).toBe('ERR_GUEST_CANNOT_HOST');
        expect(prisma.match.create).not.toHaveBeenCalled();
    });
});

describe('MatchService.getByCode', () => {
    it('throws ERR_MATCH_NOT_FOUND when no active match has that code', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findFirst).mockResolvedValue(null);

        const error = await service.getByCode('ZZZZZZ').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KarduxError);
        expect((error as KarduxError).code).toBe('ERR_MATCH_NOT_FOUND');
    });
});

describe('MatchService.listMine', () => {
    const RIVAL = { id: 'rival-1', nickname: 'ShadowKnight', avatarSeed: 'ShadowKnight' };

    function row(overrides: Partial<Record<string, unknown>>) {
        return {
            id: 'match-1',
            code: 'AAAAAA',
            status: 'LOBBY',
            config: { visibility: 'private' },
            hostId: HOST.id,
            host: HOST,
            winnerId: null,
            isDraw: false,
            _count: { players: 1 },
            players: [{ userId: HOST.id, hasLeft: false, user: HOST }],
            createdAt: new Date('2026-09-21T12:00:00.000Z'),
            ...overrides,
        };
    }

    it("lists only the caller's hosted private rooms, as admin, with no outcome yet", async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findMany).mockResolvedValueOnce([row({})] as never);

        const result = await service.listMine(HOST.id);

        expect(prisma.match.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { hostId: HOST.id, config: { path: ['visibility'], equals: 'private' } },
            }),
        );
        expect(result).toEqual([
            expect.objectContaining({
                matchId: 'match-1',
                role: 'admin',
                playerCount: 1,
                outcome: null,
                winnerNickname: null,
            }),
        ]);
    });

    it('reports "won" when the host is the winner of a finished match', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findMany).mockResolvedValueOnce([
            row({
                status: 'FINISHED',
                winnerId: HOST.id,
                players: [
                    { userId: HOST.id, hasLeft: false, user: HOST },
                    { userId: RIVAL.id, hasLeft: false, user: RIVAL },
                ],
            }),
        ] as never);

        const [result] = await service.listMine(HOST.id);

        expect(result).toMatchObject({ outcome: 'won', winnerNickname: HOST.nickname });
    });

    it('reports "abandoned" instead of "lost" when the host is the one who quit', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findMany).mockResolvedValueOnce([
            row({
                status: 'FINISHED',
                winnerId: RIVAL.id,
                players: [
                    { userId: HOST.id, hasLeft: true, user: HOST },
                    { userId: RIVAL.id, hasLeft: false, user: RIVAL },
                ],
            }),
        ] as never);

        const [result] = await service.listMine(HOST.id);

        expect(result).toMatchObject({ outcome: 'abandoned', winnerNickname: RIVAL.nickname });
    });

    it('reports "cancelled" for a lobby the host closed before anyone else joined', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findMany).mockResolvedValueOnce([
            row({ status: 'CANCELLED' }),
        ] as never);

        const [result] = await service.listMine(HOST.id);

        expect(result).toMatchObject({ outcome: 'cancelled' });
    });
});
