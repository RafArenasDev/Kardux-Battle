import type { CreateMatchRequest, MatchConfig, MatchSummary } from '@kardux/contracts';
import type { Match, User } from '@prisma/client';
import { randomInt, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { matchConfigSchema } from '@kardux/contracts';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';
import { buildAvatarUrl } from '../common/avatar.js';
import { KarduxError } from '../common/kardux-error.js';

const CODE_ALPHABET = '0123456789ABCDEF';
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 10;

type MatchWithHost = Match & { host: User };

@Injectable()
export class MatchService {
    constructor(private readonly prisma: PrismaService) {}

    /**
     * Persists a new `LOBBY` room. Only the config + room metadata are stored here - the
     * live engine state (`@kardux/engine`'s `MatchState`: piles, turn order, RNG, ...) only
     * starts existing once `MatchRuntimeService` boots this match for real play, which
     * happens at the gateway layer (next phase), not on this REST call.
     */
    async createMatch(hostUserId: string, request: CreateMatchRequest): Promise<MatchSummary> {
        const config = this.parseConfig(request);
        const code = await this.generateUniqueCode();
        const seed = config.seed ?? randomUUID();

        const match = await this.prisma.match.create({
            data: {
                code,
                config,
                seed,
                hostId: hostUserId,
            },
            include: { host: true },
        });

        return this.toSummary(match);
    }

    async getByCode(code: string): Promise<MatchSummary> {
        const match = await this.prisma.match.findFirst({
            where: { code: code.toUpperCase(), status: { in: ['LOBBY', 'IN_PROGRESS'] } },
            include: { host: true },
        });

        if (!match) {
            throw new KarduxError('ERR_MATCH_NOT_FOUND');
        }

        return this.toSummary(match);
    }

    /** `GET /matches/public`: open lobbies (`visibility: 'public'`) still accepting
     *  players, newest first. `config` is a JSONB column, so `visibility` is filtered via
     *  Prisma's Postgres JSON path filter rather than a real relational column. */
    async listPublic(): Promise<MatchSummary[]> {
        const matches = await this.prisma.match.findMany({
            where: {
                status: 'LOBBY',
                config: { path: ['visibility'], equals: 'public' },
            },
            include: { host: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        return matches.map((match) => this.toSummary(match));
    }

    private parseConfig(request: CreateMatchRequest): MatchConfig {
        const result = matchConfigSchema.safeParse(request);

        if (!result.success) {
            throw new KarduxError('ERR_INVALID_CONFIG', result.error.issues[0]?.message);
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
            createdAt: match.createdAt.toISOString(),
        };
    }
}
