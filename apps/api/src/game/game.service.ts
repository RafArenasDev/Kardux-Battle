import type { MatchConfig } from '@kardux/contracts';
import type { Match, MatchPlayer, Player as PlayerRow } from '@prisma/client';
import { Injectable } from '@nestjs/common';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';
import { KarduxError } from '../common/kardux-error.js';

export type MatchWithHost = Match & { host: PlayerRow };
export type MatchPlayerWithUser = MatchPlayer & { user: PlayerRow };

export interface JoinDirectResult {
    match: MatchWithHost;
    seat: number;
    joinOrder: number;
    /** `false` when the caller already held this seat (reload, second open of a link). */
    created: boolean;
}

export interface RequestJoinResult {
    match: MatchWithHost;
    requestId: string;
}

export type RespondJoinResult =
    | { outcome: 'rejected'; match: MatchWithHost; matchPlayer: MatchPlayerWithUser }
    | {
          outcome: 'approved';
          match: MatchWithHost;
          matchPlayer: MatchPlayerWithUser;
          seat: number;
          joinOrder: number;
      };

/**
 * Business logic behind `GameGateway`'s join flows - kept separate from the gateway the same
 * way `MatchService` is kept separate from `MatchController`: the gateway only deals with
 * sockets/rooms/acks, this deals with Prisma and the typed errors that drive them.
 *
 * Deliberately narrow: only the two join paths (`GameGateway`'s `match:join` and
 * `match:requestJoin`/`match:respondJoin`, docs/SPEC.md "Solicitudes de ingreso"). Dealing,
 * starting the match and everything that happens at the table belong to `MatchRuntimeService`.
 */
@Injectable()
export class GameService {
    constructor(private readonly prisma: PrismaService) {}

    async findActiveMatchByCode(code: string): Promise<MatchWithHost> {
        const match = await this.prisma.match.findFirst({
            where: { code: code.toUpperCase(), status: { in: ['LOBBY', 'IN_PROGRESS'] } },
            include: { host: true },
        });

        if (!match) {
            throw new KarduxError('ERR_MATCH_NOT_FOUND');
        }

        return match;
    }

    /** Used by `GameGateway`'s `match:rejoin`: the one active (`LOBBY`/`IN_PROGRESS`) match
     *  where `userId` has an `APPROVED` seat, if any. A user is only ever expected to be
     *  actively seated in one match at a time in this MVP - if more than one somehow matches,
     *  the most recently created one wins rather than erroring, since reconnecting to *a*
     *  playable match beats refusing to reconnect at all. */
    async findActiveMatchForUser(userId: string): Promise<MatchWithHost | null> {
        return this.prisma.match.findFirst({
            where: {
                status: { in: ['LOBBY', 'IN_PROGRESS'] },
                players: { some: { userId, status: 'APPROVED', eliminatedAt: null } },
            },
            include: { host: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findActiveMatchById(matchId: string): Promise<MatchWithHost> {
        const match = await this.prisma.match.findFirst({
            where: { id: matchId, status: { in: ['LOBBY', 'IN_PROGRESS'] } },
            include: { host: true },
        });

        if (!match) {
            throw new KarduxError('ERR_MATCH_NOT_FOUND');
        }

        return match;
    }

    /**
     * Direct join (docs/SPEC.md's `match:join` contract): immediate `APPROVED` seat, no admin
     * involved. `upsert` so a player who already has a row (e.g. previously `REJECTED` from a
     * request-join, or reconnecting) can still get straight in via a code/deep link - direct
     * join never asks for approval.
     */
    async getPlayer(userId: string): Promise<PlayerRow> {
        const user = await this.prisma.player.findUnique({ where: { id: userId } });
        if (!user) throw new KarduxError('ERR_UNAUTHORIZED');
        return user;
    }

    async joinDirect(userId: string, code: string): Promise<JoinDirectResult> {
        const match = await this.findActiveMatchByCode(code);
        const existing = await this.prisma.matchPlayer.findUnique({
            where: { matchId_userId: { matchId: match.id, userId } },
        });

        // Coming back to a seat you already hold (reload, share link opened twice) is never
        // "match full".
        if (existing?.status === 'APPROVED') {
            return { match, seat: existing.seat, joinOrder: existing.joinOrder, created: false };
        }

        const approvedCount = await this.countApproved(match.id);
        // Once a match is underway, newcomers watch as spectators (engine rule), so only the
        // lobby enforces the seat limit.
        if (match.status === 'LOBBY') {
            this.assertCapacity(match.config as MatchConfig, approvedCount);
        }

        await this.prisma.matchPlayer.upsert({
            where: { matchId_userId: { matchId: match.id, userId } },
            create: {
                matchId: match.id,
                userId,
                seat: approvedCount,
                joinOrder: approvedCount,
                status: 'APPROVED',
            },
            update: { status: 'APPROVED' },
        });

        return { match, seat: approvedCount, joinOrder: approvedCount, created: true };
    }

    /** Undoes a seat the engine refused (two players raced for the last one). */
    async releaseSeat(matchId: string, userId: string): Promise<void> {
        await this.prisma.matchPlayer.deleteMany({ where: { matchId, userId } });
    }

    /**
     * Request join (discovery flow, no code in hand): creates/reopens a `PENDING` row and
     * leaves seating to `respondJoin`. `seat`/`joinOrder` are meaningless while `PENDING` (no
     * seat has been claimed yet) - `0` is just a placeholder satisfying the non-null column,
     * overwritten for real once (if) the host accepts.
     */
    async requestJoin(userId: string, matchId: string): Promise<RequestJoinResult> {
        const match = await this.findActiveMatchById(matchId);
        const approvedCount = await this.countApproved(match.id);
        this.assertCapacity(match.config as MatchConfig, approvedCount);

        const matchPlayer = await this.prisma.matchPlayer.upsert({
            where: { matchId_userId: { matchId: match.id, userId } },
            create: { matchId: match.id, userId, seat: 0, joinOrder: 0, status: 'PENDING' },
            update: { status: 'PENDING' },
        });

        return { match, requestId: matchPlayer.id };
    }

    /**
     * Host-only decision on a `PENDING` row. Rejection keeps the row (`REJECTED`) instead of
     * deleting it, as docs/SPEC.md asks ("útil para auditoría/historial"). Re-checks
     * capacity on accept too - time may have passed between the request and the host's
     * decision, and another player could have filled the last seat meanwhile.
     */
    async respondJoin(
        hostUserId: string,
        requestId: string,
        accept: boolean,
    ): Promise<RespondJoinResult> {
        const matchPlayer = await this.prisma.matchPlayer.findUnique({
            where: { id: requestId },
            include: { match: { include: { host: true } }, user: true },
        });

        if (!matchPlayer) {
            throw new KarduxError('ERR_VALIDATION', 'No join request exists with that id.');
        }

        const { match } = matchPlayer;

        if (match.hostId !== hostUserId) {
            throw new KarduxError('ERR_NOT_HOST');
        }

        if (matchPlayer.status !== 'PENDING') {
            throw new KarduxError('ERR_VALIDATION', 'This join request was already resolved.');
        }

        if (!accept) {
            const rejected = await this.prisma.matchPlayer.update({
                where: { id: requestId },
                data: { status: 'REJECTED' },
                include: { user: true },
            });

            return { outcome: 'rejected', match, matchPlayer: rejected };
        }

        const approvedCount = await this.countApproved(match.id);
        this.assertCapacity(match.config as MatchConfig, approvedCount);

        const approved = await this.prisma.matchPlayer.update({
            where: { id: requestId },
            data: { status: 'APPROVED', seat: approvedCount, joinOrder: approvedCount },
            include: { user: true },
        });

        return {
            outcome: 'approved',
            match,
            matchPlayer: approved,
            seat: approvedCount,
            joinOrder: approvedCount,
        };
    }

    /** Every match that is still waiting or being played. */
    async listActiveMatches(): Promise<Match[]> {
        return this.prisma.match.findMany({ where: { status: { in: ['LOBBY', 'IN_PROGRESS'] } } });
    }

    async countSeated(matchId: string): Promise<number> {
        return this.countApproved(matchId);
    }

    private async countApproved(matchId: string): Promise<number> {
        return this.prisma.matchPlayer.count({ where: { matchId, status: 'APPROVED' } });
    }

    private assertCapacity(config: MatchConfig, approvedCount: number): void {
        if (approvedCount >= config.maxPlayers) {
            throw new KarduxError('ERR_MATCH_FULL');
        }
    }
}
