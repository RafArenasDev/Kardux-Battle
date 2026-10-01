import type {
    CreateMatchRequest,
    MatchConfig,
    MatchOutcome,
    MatchSummary,
    MatchSummaryWithRole,
} from '@kardux/contracts';
import type {
    Match,
    MatchPlayer as MatchPlayerRow,
    Prisma,
    Player as PlayerRow,
} from '@prisma/client';
import { randomInt, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { matchConfigSchema } from '@kardux/contracts';
import { POKEMON_DECK, validateDeckConfig } from '@kardux/content';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';
import { buildAvatarUrl } from '../common/avatar.js';
import { KarduxError } from '../common/kardux-error.js';
import { disabledDeckIds } from '../config/app-config.js';

const CODE_ALPHABET = '0123456789ABCDEF';
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 10;

const WITH_HOST_AND_COUNT = {
    host: true,
    _count: { select: { players: { where: { status: 'APPROVED' } } } },
} satisfies Prisma.MatchInclude;

type MatchWithHost = Match & { host: PlayerRow; _count: { players: number } };

/** Adds every approved seat (with its account) to `WITH_HOST_AND_COUNT`, so the history list
 *  can work out the host's own outcome and the winner's nickname without a second query. */
const WITH_HOST_AND_PLAYERS = {
    ...WITH_HOST_AND_COUNT,
    players: {
        where: { status: 'APPROVED' },
        include: { user: true },
    },
} satisfies Prisma.MatchInclude;

type MatchWithHostAndPlayers = MatchWithHost & {
    players: (MatchPlayerRow & { user: PlayerRow })[];
};

/**
 * Two kinds of rooms:
 * - **Private** (`POST /matches`, registered players only): never listed anywhere except the
 *   host's own panel; others get in with the hex code or the share link.
 * - **Quick** (`match:quick`, anyone including guests): public 1v1 lobbies that auto-start the
 *   moment the second player sits down - no approval step.
 */
@Injectable()
export class MatchService {
    constructor(private readonly prisma: PrismaService) {}

    async createMatch(hostUserId: string, request: CreateMatchRequest): Promise<MatchSummary> {
        const host = await this.prisma.player.findUnique({ where: { id: hostUserId } });
        if (!host?.username) {
            throw new KarduxError('ERR_GUEST_CANNOT_HOST');
        }

        return this.insertMatch(hostUserId, { ...request, visibility: 'private' });
    }

    /** A fresh public quick-match lobby hosted by whoever asked for it (guests allowed), 1 vs 1
     *  for up to 20 minutes: the original 32-card deck (4 packs x 8 quartets) against a person,
     *  a longer 48-card deck (6 x 8) against the machine. */
    async createQuickMatch(
        hostUserId: string,
        options: { vsBot?: boolean } = {},
    ): Promise<MatchSummary> {
        return this.insertMatch(hostUserId, {
            visibility: 'public',
            fillWithBots: options.vsBot ?? false,
            minPlayers: 2,
            maxPlayers: 2,
            autoStartPlayers: 2,
            autoStartCountdownMs: 4_000,
            matchDurationMs: 20 * 60_000,
            turnTimeoutMs: 20_000,
            onTurnTimeout: 'random_attr',
            deckSources: [POKEMON_DECK.id],
            // Against the machine the person always leads the first round.
            firstTurn: options.vsBot ? 'first_joined' : 'lowest_card',
            packs: options.vsBot ? 6 : 4,
            cardsPerPack: 8,
            attributeCount: 4,
        });
    }

    /** Open quick-match lobbies with a free seat, oldest first (fair queue). */
    async listQuickCandidates(excludeUserId: string): Promise<MatchSummary[]> {
        const matches = await this.prisma.match.findMany({
            where: {
                status: 'LOBBY',
                config: { path: ['visibility'], equals: 'public' },
                players: { none: { userId: excludeUserId } },
            },
            include: WITH_HOST_AND_COUNT,
            orderBy: { createdAt: 'asc' },
            take: 20,
        });

        return matches
            .map((match) => this.toSummary(match))
            .filter(
                (summary) =>
                    !summary.config.fillWithBots &&
                    summary.playerCount < summary.config.autoStartPlayers,
            );
    }

    async getByCode(code: string): Promise<MatchSummary> {
        const match = await this.prisma.match.findFirst({
            where: { code: code.toUpperCase(), status: { in: ['LOBBY', 'IN_PROGRESS'] } },
            include: WITH_HOST_AND_COUNT,
        });

        if (!match) {
            throw new KarduxError('ERR_MATCH_NOT_FOUND');
        }

        return this.toSummary(match);
    }

    /** The host's private rooms, newest first - their whole history (open, cancelled, and
     *  finished alike), the only place a private match is ever listed. */
    async listMine(userId: string): Promise<MatchSummaryWithRole[]> {
        const hosted = await this.prisma.match.findMany({
            where: { hostId: userId, config: { path: ['visibility'], equals: 'private' } },
            include: WITH_HOST_AND_PLAYERS,
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        return hosted.map((match) => this.toHistoryItem(match, userId));
    }

    /** The match the caller is currently seated in (lobby or playing), for "Continuar". */
    async findActive(userId: string): Promise<MatchSummary | null> {
        const match = await this.prisma.match.findFirst({
            where: {
                status: { in: ['LOBBY', 'IN_PROGRESS'] },
                players: { some: { userId, status: 'APPROVED', eliminatedAt: null } },
            },
            include: WITH_HOST_AND_COUNT,
            orderBy: { createdAt: 'desc' },
        });

        return match ? this.toSummary(match) : null;
    }

    private async insertMatch(
        hostUserId: string,
        request: CreateMatchRequest,
    ): Promise<MatchSummary> {
        const config = this.parseConfig(request);
        const code = await this.generateUniqueCode();
        const seed = config.seed ?? randomUUID();

        const match = await this.prisma.match.create({
            data: { code, config, seed, hostId: hostUserId },
            include: WITH_HOST_AND_COUNT,
        });

        return this.toSummary(match);
    }

    private parseConfig(request: CreateMatchRequest): MatchConfig {
        const result = matchConfigSchema.safeParse(request);

        if (!result.success) {
            throw new KarduxError('ERR_INVALID_CONFIG', result.error.issues[0]?.message);
        }

        const disabled = disabledDeckIds();
        if (result.data.deckSources.some((id) => disabled.has(id))) {
            throw new KarduxError(
                'ERR_INVALID_CONFIG',
                'That deck is not available on this server.',
            );
        }

        // Fail at creation, not when the host presses "Iniciar": the deck must be buildable.
        const deckProblem = validateDeckConfig(result.data);
        if (deckProblem) {
            throw new KarduxError('ERR_INVALID_CONFIG', deckProblem.en, { localized: deckProblem });
        }

        return result.data;
    }

    private async generateUniqueCode(): Promise<string> {
        for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
            const code = Array.from(
                { length: CODE_LENGTH },
                () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
            ).join('');

            const collision = await this.prisma.match.findFirst({
                where: { code, status: { in: ['LOBBY', 'IN_PROGRESS'] } },
                select: { id: true },
            });

            if (!collision) {
                return code;
            }
        }

        throw new KarduxError(
            'ERR_VALIDATION',
            'Could not allocate a free room code, please retry.',
        );
    }

    private toSummary(match: MatchWithHost): MatchSummary {
        return {
            matchId: match.id,
            code: match.code,
            status: match.status,
            config: match.config as MatchConfig,
            hostId: match.hostId,
            hostNickname: match.host.nickname,
            hostAvatarUrl: buildAvatarUrl(match.host.avatarSeed),
            playerCount: match._count.players,
            createdAt: match.createdAt.toISOString(),
        };
    }

    /** The host's own result for one of their private rooms - `null` while it's still
     *  `LOBBY`/`IN_PROGRESS`, since there's nothing to report yet. `abandoned` beats `lost`:
     *  both leave the host at 0 cards in last place, only `hasLeft` says which one it was. */
    private toHistoryItem(
        match: MatchWithHostAndPlayers,
        hostUserId: string,
    ): MatchSummaryWithRole {
        const hostRow = match.players.find((player) => player.userId === hostUserId);
        const winnerRow = match.players.find((player) => player.userId === match.winnerId);

        const outcome: MatchOutcome | null =
            match.status === 'CANCELLED'
                ? 'cancelled'
                : match.status !== 'FINISHED'
                  ? null
                  : hostRow?.hasLeft
                    ? 'abandoned'
                    : match.isDraw
                      ? 'draw'
                      : match.winnerId === hostUserId
                        ? 'won'
                        : 'lost';

        return {
            ...this.toSummary(match),
            role: 'admin',
            winnerNickname: winnerRow?.user.nickname ?? null,
            isDraw: match.isDraw,
            outcome,
        };
    }
}
