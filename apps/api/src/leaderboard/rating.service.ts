import type { Player as MatchPlayerView } from '@kardux/contracts';
import { BASE_RATING, placementsOf, ratingChanges } from '@kardux/engine';
import { Injectable, Logger } from '@nestjs/common';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';

/** Bot seats (`bot:*`) never touch the ranking. */
const BOT_PREFIX = 'bot:';

interface RoundSummary {
    winnerId: string | null;
    leaderId: string;
    attribute: string;
    potSize: number;
}

/**
 * Turns a finished match into ranking points. Only registered accounts are ranked (a guest
 * identity is disposable), and a match needs every seat filled by a ranked account - so games
 * against the machine or with guests never change the table.
 *
 * Idempotent through `Match.ratedAt`: the match is claimed with a conditional update before
 * any stat is written, so a retried call can never count the same match twice.
 */
@Injectable()
export class RatingService {
    private readonly logger = new Logger(RatingService.name);

    constructor(private readonly prisma: PrismaService) {}

    async rateMatch(matchId: string, standings: readonly MatchPlayerView[]): Promise<void> {
        if (standings.length < 2 || standings.some((p) => p.id.startsWith(BOT_PREFIX))) return;

        const accounts = await this.prisma.player.findMany({
            where: {
                id: { in: standings.map((player) => this.userIdOf(player.id)) },
                username: { not: null },
            },
            include: { leaderboardStat: true },
        });
        if (accounts.length !== standings.length) return;

        const claimed = await this.prisma.match.updateMany({
            where: { id: matchId, ratedAt: null },
            data: { ratedAt: new Date() },
        });
        if (claimed.count === 0) return;

        const accountOf = (playerKey: string) =>
            accounts.find((row) => row.id === this.userIdOf(playerKey))!;
        const placements = placementsOf(standings);
        const changes = ratingChanges(
            standings.map((player) => ({
                id: player.id,
                rating: accountOf(player.id).leaderboardStat?.elo ?? BASE_RATING,
                placement: placements.get(player.id)!,
            })),
        );

        const rounds: RoundSummary[] = await this.prisma.round.findMany({
            where: { matchId },
            select: { winnerId: true, leaderId: true, attribute: true, potSize: true },
        });
        const best = Math.min(...placements.values());
        const sharedFirst = [...placements.values()].filter((value) => value === best).length > 1;

        await this.prisma.$transaction(
            standings.map((player) => {
                const account = accountOf(player.id);
                const placement = placements.get(player.id)!;
                const won = placement === best && !sharedFirst && !player.hasLeft;
                const drew = placement === best && sharedFirst && !player.hasLeft;
                const lost = !won && !drew;
                const streak = won ? Math.max(0, account.leaderboardStat?.streak ?? 0) + 1 : 0;
                const roundsWon = rounds.filter((round) => round.winnerId === account.id);
                const cardsWon = roundsWon.reduce((sum, round) => sum + round.potSize, 0);
                const favorite = this.favoriteAttribute(rounds, account.id);
                const delta = changes.get(player.id) ?? 0;

                return this.prisma.leaderboardStat.upsert({
                    where: { userId: account.id },
                    create: {
                        userId: account.id,
                        elo: BASE_RATING + delta,
                        gamesPlayed: 1,
                        wins: won ? 1 : 0,
                        draws: drew ? 1 : 0,
                        losses: lost ? 1 : 0,
                        streak,
                        roundsWon: roundsWon.length,
                        cardsWonTotal: cardsWon,
                        favoriteAttribute: favorite,
                    },
                    update: {
                        elo: { increment: delta },
                        gamesPlayed: { increment: 1 },
                        wins: { increment: won ? 1 : 0 },
                        draws: { increment: drew ? 1 : 0 },
                        losses: { increment: lost ? 1 : 0 },
                        streak,
                        roundsWon: { increment: roundsWon.length },
                        cardsWonTotal: { increment: cardsWon },
                        ...(favorite ? { favoriteAttribute: favorite } : {}),
                    },
                });
            }),
        );

        this.logger.log(`Match ${matchId} rated for ${standings.length} players.`);
    }

    /** The attribute this player picked most often when leading a round. */
    private favoriteAttribute(rounds: readonly RoundSummary[], userId: string): string | null {
        const counts = new Map<string, number>();
        for (const round of rounds) {
            if (round.leaderId !== userId) continue;
            counts.set(round.attribute, (counts.get(round.attribute) ?? 0) + 1);
        }
        let favorite: string | null = null;
        let most = 0;
        for (const [attribute, count] of counts) {
            if (count > most) {
                favorite = attribute;
                most = count;
            }
        }
        return favorite;
    }

    private userIdOf(playerKey: string): string {
        return playerKey.split(':')[0]!;
    }
}
