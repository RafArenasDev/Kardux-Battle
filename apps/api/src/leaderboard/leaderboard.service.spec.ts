import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { KarduxError } from '../common/kardux-error.js';
import { LeaderboardService } from './leaderboard.service.js';

const USER_A = { id: 'user-a', nickname: 'Ada', avatarSeed: 'Ada' };
const USER_B = { id: 'user-b', nickname: 'Bob', avatarSeed: 'Bob' };

function statRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'stat-a',
        userId: USER_A.id,
        user: USER_A,
        elo: 1300,
        gamesPlayed: 10,
        wins: 6,
        losses: 3,
        draws: 1,
        streak: 2,
        roundsWon: 40,
        cardsWonTotal: 120,
        favoriteAttribute: 'attack',
        updatedAt: new Date('2026-09-21T00:00:00.000Z'),
        ...overrides,
    };
}

function createService() {
    const prisma = {
        leaderboardStat: {
            findMany: vi.fn(),
        },
    } as unknown as PrismaService;

    return { service: new LeaderboardService(prisma), prisma };
}

describe('LeaderboardService.getGlobal', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('maps rows to leaderboard entries with a DiceBear avatar URL', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.leaderboardStat.findMany).mockResolvedValue([statRow()] as never);

        const result = await service.getGlobal({ limit: 20 });

        expect(prisma.leaderboardStat.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [{ elo: 'desc' }, { id: 'desc' }],
                take: 21,
                include: { user: true },
            }),
        );
        expect(prisma.leaderboardStat.findMany).not.toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.anything() }),
        );
        expect(result.nextCursor).toBeNull();
        expect(result.entries).toHaveLength(1);
        expect(result.entries[0]).toMatchObject({
            userId: USER_A.id,
            nickname: USER_A.nickname,
            elo: 1300,
            favoriteAttribute: 'attack',
        });
        expect(result.entries[0]?.avatarUrl).toContain(USER_A.avatarSeed);
    });

    it('returns a nextCursor when there are more rows than the page limit', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.leaderboardStat.findMany).mockResolvedValue([
            statRow({ id: 'stat-a', userId: USER_A.id, user: USER_A, elo: 1400 }),
            statRow({ id: 'stat-b', userId: USER_B.id, user: USER_B, elo: 1300 }),
        ] as never);

        const result = await service.getGlobal({ limit: 1 });

        expect(result.entries).toHaveLength(1);
        expect(result.entries[0]?.userId).toBe(USER_A.id);
        expect(result.nextCursor).not.toBeNull();
        expect(typeof result.nextCursor).toBe('string');

        // The cursor round-trips to a `where` clause that filters strictly after (elo, id).
        const cursor = result.nextCursor;
        if (!cursor) {
            throw new Error('expected a cursor');
        }
        vi.mocked(prisma.leaderboardStat.findMany).mockClear();
        vi.mocked(prisma.leaderboardStat.findMany).mockResolvedValue([]);

        await service.getGlobal({ cursor, limit: 1 });

        expect(prisma.leaderboardStat.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { OR: [{ elo: { lt: 1400 } }, { elo: 1400, id: { lt: 'stat-a' } }] },
            }),
        );
    });

    it('returns nextCursor: null when there are no more rows than the page limit', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.leaderboardStat.findMany).mockResolvedValue([
            statRow({ id: 'stat-a', userId: USER_A.id, user: USER_A, elo: 1400 }),
        ] as never);

        const result = await service.getGlobal({ limit: 20 });

        expect(result.entries).toHaveLength(1);
        expect(result.nextCursor).toBeNull();
    });

    it('rejects a malformed cursor with ERR_VALIDATION', async () => {
        const { service } = createService();

        const error = await service
            .getGlobal({ cursor: 'not-valid-base64json', limit: 20 })
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KarduxError);
        expect((error as KarduxError).code).toBe('ERR_VALIDATION');
    });
});
