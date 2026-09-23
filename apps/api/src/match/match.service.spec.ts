import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { KarduxError } from '../common/kardux-error.js';
import { MatchService } from './match.service.js';

const HOST = { id: 'host-1', nickname: 'RafArenas', avatarSeed: 'RafArenas' };
// Registered (has `username`) - a pure guest can join a match but not host one (2026-09-22).
const REGISTERED_HOST = { ...HOST, username: 'raf_arenas', passwordHash: 'hashed' };

function createService(overrides: Partial<Record<string, unknown>> = {}) {
    const prisma = {
        match: {
            create: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
        },
        user: {
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

    it('rejects hosting for a caller with no username (pure guest)', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...HOST, username: null } as never);

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
    it('tags hosted matches "admin" and approved-player matches "player", newest first', async () => {
        const { service, prisma } = createService();
        const hostedMatch = {
            id: 'match-1',
            code: 'AAAAAA',
            status: 'LOBBY',
            config: { visibility: 'public' },
            hostId: HOST.id,
            host: HOST,
            createdAt: new Date('2026-09-21T12:00:00.000Z'),
        };
        const joinedMatch = {
            id: 'match-2',
            code: 'BBBBBB',
            status: 'LOBBY',
            config: { visibility: 'public' },
            hostId: 'other-host',
            host: { id: 'other-host', nickname: 'Misty', avatarSeed: 'Misty' },
            createdAt: new Date('2026-09-21T13:00:00.000Z'),
        };
        vi.mocked(prisma.match.findMany)
            .mockResolvedValueOnce([hostedMatch] as never)
            .mockResolvedValueOnce([joinedMatch] as never);

        const result = await service.listMine(HOST.id);

        expect(prisma.match.findMany).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ where: { hostId: HOST.id } }),
        );
        expect(prisma.match.findMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: {
                    hostId: { not: HOST.id },
                    players: { some: { userId: HOST.id, status: 'APPROVED' } },
                },
            }),
        );
        expect(result).toEqual([
            expect.objectContaining({ matchId: 'match-2', role: 'player' }),
            expect.objectContaining({ matchId: 'match-1', role: 'admin' }),
        ]);
    });
});
