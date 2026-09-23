import type {
    CreateMatchRequest,
    MatchConfig,
    MatchSummary,
    MatchSummaryWithRole,
} from '@kardux/contracts';
import type { Match, Prisma, User } from '@prisma/client';
import { randomInt, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { matchConfigSchema } from '@kardux/contracts';
import { DECKS, deckLimits, validateDeckConfig } from '@kardux/content';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';
import { buildAvatarUrl } from '../common/avatar.js';
import { KarduxError } from '../common/kardux-error.js';

const CODE_ALPHABET = '0123456789ABCDEF';
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 10;

const WITH_HOST_AND_COUNT = {
    host: true,
    _count: { select: { players: { where: { status: 'APPROVED' } } } },
} satisfies Prisma.MatchInclude;

type MatchWithHost = Match & { host: User; _count: { players: number } };

/**
 * Two kinds of rooms (2026-09-23 decision):
 * - **Private** (`POST /matches`, registered players only): never listed anywhere except the
 *   host's own panel; others get in with the hex code or the share link.
 * - **Quick** (`match:quick`, anyone including guests): public 1v1 lobbies that auto-start the
 *   moment the second player sits down - no approval step.
 */
@Injectable()
export class MatchService {
    constructor(private readonly prisma: PrismaService) {}

    async createMatch(hostUserId: string, request: CreateMatchRequest): Promise<MatchSummary> {
        const host = await this.prisma.user.findUnique({ where: { id: hostUserId } });
        if (!host?.username) {
            throw new KarduxError('ERR_GUEST_CANNOT_HOST');
        }

        return this.insertMatch(hostUserId, { ...request, visibility: 'private' });
    }

    /** A fresh public quick-match lobby hosted by whoever asked for it (guests allowed). */
    async createQuickMatch(hostUserId: string): Promise<MatchSummary> {
        const deck = DECKS[randomInt(DECKS.length)]!;
        const limits = deckLimits(deck);

        return this.insertMatch(hostUserId, {
            visibility: 'public',
            minPlayers: 2,
            maxPlayers: 2,
            autoStartPlayers: 2,
            autoStartCountdownMs: 4_000,
            matchDurationMs: 10 * 60_000,
            turnTimeoutMs: 20_000,
            onTurnTimeout: 'random_attr',
            deckSources: [deck.id],
            packs: Math.min(4, limits.maxPacks),
            cardsPerPack: Math.min(8, limits.maxCardsPerPack),
            attributeCount: Math.min(4, limits.maxAttributes),
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
            .filter((summary) => summary.playerCount < summary.config.autoStartPlayers);
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

    /** The host's private rooms - the only place a private match is ever listed. */
    async listMine(userId: string): Promise<MatchSummaryWithRole[]> {
        const hosted = await this.prisma.match.findMany({
            where: { hostId: userId, config: { path: ['visibility'], equals: 'private' } },
            include: WITH_HOST_AND_COUNT,
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        return hosted.map((match) => ({ ...this.toSummary(match), role: 'admin' as const }));
    }

    /** The match the caller is currently seated in (lobby or playing), for "Continuar". */
    async findActive(userId: string): Promise<MatchSummary | null> {
        const match = await this.prisma.match.findFirst({
            where: {
                status: { in: ['LOBBY', 'IN_PROGRESS'] },
                players: { some: { userId, status: 'APPROVED' } },
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

        // Fail at creation, not when the host presses "Iniciar": the deck must be buildable.
        const deckProblem = validateDeckConfig(result.data);
        if (deckProblem) {
            throw new KarduxError('ERR_INVALID_CONFIG', deckProblem);
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
}
