import type { LeaderboardEntry, LeaderboardQuery, LeaderboardResponse } from '@kardux/contracts';
import type { LeaderboardStat, Player as PlayerRow } from '@prisma/client';
import { Injectable } from '@nestjs/common';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';
import { buildAvatarUrl } from '../common/avatar.js';
import { KarduxError } from '../common/kardux-error.js';

type LeaderboardRow = LeaderboardStat & { user: PlayerRow };

/** Decoded shape of the opaque keyset cursor - see `encodeCursor`/`decodeCursor`. */
interface LeaderboardCursor {
    elo: number;
    id: string;
}

@Injectable()
export class LeaderboardService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * `GET /leaderboard`: the global ranking by Elo, keyset-paginated over
     * `(elo desc, id desc)` - `id` (a `cuid()`, so it's already unique and stable) breaks ties
     * between rows with the same Elo, which offset pagination can't do consistently once rows
     * are inserted/updated between pages.
     *
     * Only the `global` scope from docs/SPEC.md exists here: `scope` (per card source) and
     * `period`/`friends` would need columns/tables (per-source stats, time buckets, a friends
     * graph) that `LeaderboardStat` doesn't have yet, per the "no new models without approval"
     * rule - out of scope for this endpoint until that's designed separately.
     */
    async getGlobal(query: LeaderboardQuery): Promise<LeaderboardResponse> {
        const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;

        const rows = await this.prisma.leaderboardStat.findMany({
            // `exactOptionalPropertyTypes` forbids an explicit `where: undefined` - spread in
            // the key only when there's actually a cursor to filter after.
            ...(cursor
                ? {
                      where: {
                          OR: [
                              { elo: { lt: cursor.elo } },
                              { elo: cursor.elo, id: { lt: cursor.id } },
                          ],
                      },
                  }
                : {}),
            orderBy: [{ elo: 'desc' }, { id: 'desc' }],
            // One extra row: if it comes back, there's a next page.
            take: query.limit + 1,
            include: { user: true },
        });

        const hasNextPage = rows.length > query.limit;
        const page = hasNextPage ? rows.slice(0, query.limit) : rows;
        const lastRow = page[page.length - 1];
        const nextCursor =
            hasNextPage && lastRow ? this.encodeCursor(lastRow.elo, lastRow.id) : null;

        return {
            entries: page.map((row) => this.toEntry(row)),
            nextCursor,
        };
    }

    private toEntry(row: LeaderboardRow): LeaderboardEntry {
        return {
            userId: row.userId,
            nickname: row.user.nickname,
            avatarUrl: buildAvatarUrl(row.user.avatarSeed),
            elo: row.elo,
            gamesPlayed: row.gamesPlayed,
            wins: row.wins,
            losses: row.losses,
            draws: row.draws,
            streak: row.streak,
            roundsWon: row.roundsWon,
            cardsWonTotal: row.cardsWonTotal,
            favoriteAttribute: row.favoriteAttribute,
        };
    }

    /** Opaque cursor = base64url of `{ elo, id }` - deterministic and only ever produced/read
     *  by this service, so the wire format is free to change later without a client contract. */
    private encodeCursor(elo: number, id: string): string {
        const payload: LeaderboardCursor = { elo, id };
        return Buffer.from(JSON.stringify(payload)).toString('base64url');
    }

    private decodeCursor(raw: string): LeaderboardCursor {
        try {
            const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
            if (
                typeof parsed === 'object' &&
                parsed !== null &&
                typeof (parsed as Record<string, unknown>).elo === 'number' &&
                typeof (parsed as Record<string, unknown>).id === 'string'
            ) {
                return parsed as LeaderboardCursor;
            }
        } catch {
            // Falls through to the shared `ERR_VALIDATION` below - malformed base64/JSON and a
            // well-formed-but-wrong-shape payload are both just "invalid cursor" to the caller.
        }

        throw new KarduxError('ERR_VALIDATION', 'Invalid leaderboard cursor.');
    }
}
