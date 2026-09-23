import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { KarduxError } from '../common/kardux-error.js';
import { GameService } from './game.service.js';

const HOST = { id: 'host-1', nickname: 'RafArenas', avatarSeed: 'RafArenas' };
const REQUESTER = { id: 'user-2', nickname: 'Misty', avatarSeed: 'Misty' };

const MATCH = {
    id: 'match-1',
    code: 'ABCDEF',
    status: 'LOBBY',
    config: { maxPlayers: 2 },
    hostId: HOST.id,
    host: HOST,
};

function createService(overrides: Partial<Record<string, unknown>> = {}) {
    const prisma = {
        match: {
            findFirst: vi.fn(),
        },
        matchPlayer: {
            count: vi.fn(),
            upsert: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        ...overrides,
    } as unknown as PrismaService;

    return { service: new GameService(prisma), prisma };
}

describe('GameService.joinDirect', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('upserts an APPROVED MatchPlayer row when there is room', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findFirst).mockResolvedValue(MATCH as never);
        vi.mocked(prisma.matchPlayer.count).mockResolvedValue(0);
        vi.mocked(prisma.matchPlayer.upsert).mockResolvedValue({} as never);

        const result = await service.joinDirect(REQUESTER.id, 'abcdef');

        expect(prisma.matchPlayer.upsert).toHaveBeenCalledWith({
            where: { matchId_userId: { matchId: MATCH.id, userId: REQUESTER.id } },
            create: {
                matchId: MATCH.id,
                userId: REQUESTER.id,
                seat: 0,
                joinOrder: 0,
                status: 'APPROVED',
            },
            update: { status: 'APPROVED' },
        });
        expect(result).toEqual({ match: MATCH, seat: 0, joinOrder: 0 });
    });

    it('throws ERR_MATCH_FULL without touching MatchPlayer when the room is at capacity', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findFirst).mockResolvedValue(MATCH as never);
        vi.mocked(prisma.matchPlayer.count).mockResolvedValue(2); // maxPlayers: 2

        const error = await service.joinDirect(REQUESTER.id, 'abcdef').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KarduxError);
        expect((error as KarduxError).code).toBe('ERR_MATCH_FULL');
        expect(prisma.matchPlayer.upsert).not.toHaveBeenCalled();
    });

    it('throws ERR_MATCH_NOT_FOUND when the code has no active match', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findFirst).mockResolvedValue(null);

        const error = await service.joinDirect(REQUESTER.id, 'ZZZZZZ').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KarduxError);
        expect((error as KarduxError).code).toBe('ERR_MATCH_NOT_FOUND');
    });
});

describe('GameService.requestJoin', () => {
    it('upserts a PENDING MatchPlayer row when there is room', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findFirst).mockResolvedValue(MATCH as never);
        vi.mocked(prisma.matchPlayer.count).mockResolvedValue(0);
        vi.mocked(prisma.matchPlayer.upsert).mockResolvedValue({ id: 'request-1' } as never);

        const result = await service.requestJoin(REQUESTER.id, MATCH.id);

        expect(prisma.matchPlayer.upsert).toHaveBeenCalledWith({
            where: { matchId_userId: { matchId: MATCH.id, userId: REQUESTER.id } },
            create: {
                matchId: MATCH.id,
                userId: REQUESTER.id,
                seat: 0,
                joinOrder: 0,
                status: 'PENDING',
            },
            update: { status: 'PENDING' },
        });
        expect(result).toEqual({ match: MATCH, requestId: 'request-1' });
    });

    it('throws ERR_MATCH_FULL without creating a PENDING row when the room is at capacity', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.match.findFirst).mockResolvedValue(MATCH as never);
        vi.mocked(prisma.matchPlayer.count).mockResolvedValue(2); // maxPlayers: 2

        const error = await service.requestJoin(REQUESTER.id, MATCH.id).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KarduxError);
        expect((error as KarduxError).code).toBe('ERR_MATCH_FULL');
        expect(prisma.matchPlayer.upsert).not.toHaveBeenCalled();
    });
});

describe('GameService.respondJoin', () => {
    function pendingRow(overrides: Partial<Record<string, unknown>> = {}) {
        return {
            id: 'request-1',
            matchId: MATCH.id,
            userId: REQUESTER.id,
            status: 'PENDING',
            match: MATCH,
            user: REQUESTER,
            ...overrides,
        };
    }

    it('approves and seats the requester when the host accepts', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.matchPlayer.findUnique).mockResolvedValue(pendingRow() as never);
        vi.mocked(prisma.matchPlayer.count).mockResolvedValue(0);
        vi.mocked(prisma.matchPlayer.update).mockResolvedValue({
            ...pendingRow(),
            status: 'APPROVED',
            seat: 0,
            joinOrder: 0,
        } as never);

        const result = await service.respondJoin(HOST.id, 'request-1', true);

        expect(prisma.matchPlayer.update).toHaveBeenCalledWith({
            where: { id: 'request-1' },
            data: { status: 'APPROVED', seat: 0, joinOrder: 0 },
            include: { user: true },
        });
        expect(result.outcome).toBe('approved');
    });

    it('rejects and keeps the row when the host rejects', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.matchPlayer.findUnique).mockResolvedValue(pendingRow() as never);
        vi.mocked(prisma.matchPlayer.update).mockResolvedValue({
            ...pendingRow(),
            status: 'REJECTED',
        } as never);

        const result = await service.respondJoin(HOST.id, 'request-1', false);

        expect(prisma.matchPlayer.update).toHaveBeenCalledWith({
            where: { id: 'request-1' },
            data: { status: 'REJECTED' },
            include: { user: true },
        });
        expect(result.outcome).toBe('rejected');
    });

    it('throws ERR_NOT_HOST when the caller is not the match host', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.matchPlayer.findUnique).mockResolvedValue(pendingRow() as never);

        const error = await service
            .respondJoin('someone-else', 'request-1', true)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KarduxError);
        expect((error as KarduxError).code).toBe('ERR_NOT_HOST');
        expect(prisma.matchPlayer.update).not.toHaveBeenCalled();
    });

    it('throws ERR_MATCH_FULL on accept when capacity filled up meanwhile', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.matchPlayer.findUnique).mockResolvedValue(pendingRow() as never);
        vi.mocked(prisma.matchPlayer.count).mockResolvedValue(2); // maxPlayers: 2

        const error = await service
            .respondJoin(HOST.id, 'request-1', true)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KarduxError);
        expect((error as KarduxError).code).toBe('ERR_MATCH_FULL');
        expect(prisma.matchPlayer.update).not.toHaveBeenCalled();
    });

    it('throws ERR_VALIDATION when the request id does not exist', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.matchPlayer.findUnique).mockResolvedValue(null);

        const error = await service
            .respondJoin(HOST.id, 'not-a-real-request', true)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KarduxError);
        expect((error as KarduxError).code).toBe('ERR_VALIDATION');
    });

    it('throws ERR_VALIDATION when the request was already resolved', async () => {
        const { service, prisma } = createService();
        vi.mocked(prisma.matchPlayer.findUnique).mockResolvedValue(
            pendingRow({ status: 'APPROVED' }) as never,
        );

        const error = await service
            .respondJoin(HOST.id, 'request-1', true)
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(KarduxError);
        expect((error as KarduxError).code).toBe('ERR_VALIDATION');
    });
});
