import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { KarduxError } from '../common/kardux-error.js';
import { MatchService } from './match.service.js';

const HOST = { id: 'host-1', nickname: 'RafArenas', avatarSeed: 'RafArenas' };

function createService(overrides: Partial<Record<string, unknown>> = {}) {
    const prisma = {
        match: {
            create: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
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
            createdAt: new Date('2026-09-21T00:00:00.000Z'),
        } as never);

        const result = await service.createMatch(HOST.id, { visibility: 'public' });

        expect(prisma.match.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ hostId: HOST.id }),
                include: { host: true },
            }),
        );
        expect(result).toMatchObject({
            matchId: 'match-1',
            code: 'ABCDEF',
            status: 'LOBBY',
            hostId: HOST.id,
            hostNickname: HOST.nickname,
            hostAvatarUrl: expect.stringContaining(HOST.avatarSeed),
        });
    });

    it('rejects a config that fails MatchConfig cross-field rules', async () => {
        const { service } = createService();

        await expect(
            service.createMatch(HOST.id, { minPlayers: 10, maxPlayers: 2 }),
        ).rejects.toThrow(KarduxError);
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
