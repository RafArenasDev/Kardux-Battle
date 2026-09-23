import type {
    CheckUsernameResponse,
    GuestAuthRequest,
    GuestAuthResponse,
    GuestJwtPayload,
    LoginRequest,
    RegisterRequest,
} from '@kardux/contracts';
import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
// Value imports required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JwtService } from '@nestjs/jwt';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';
import { buildAvatarUrl } from '../common/avatar.js';
import { isCatalogAvatarSeed, randomAvatarSeed } from '@kardux/content';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { KarduxError } from '../common/kardux-error.js';

const PASSWORD_HASH_ROUNDS = 10;
const PRISMA_UNIQUE_CONSTRAINT_ERROR = 'P2002';
const USERNAME_MAX_LENGTH = 24;
const USERNAME_SUGGESTION_COUNT = 3;

/** "Jugador4821"-style - docs/SPEC.md's guest identity has no nickname the client picks
 * . */
function generateGuestNickname(): string {
    return `Jugador${randomInt(1000, 10_000)}`;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwt: JwtService,
    ) {}

    /**
     * Always creates a brand-new, fully anonymous guest `Player` row - `nickname`/`avatarSeed`
     * are generated server-side, the client only supplies `tabId`. There is no "log back in"
     * for a guest identity: a reconnecting tab restores its session with the JWT it already
     * has (`match:rejoin`), not by calling this again. Guests can join matches but not host
     * one (`MatchService.createMatch` - `ERR_GUEST_CANNOT_HOST`) and have no path to "become"
     * a registered account - `POST /auth/register` is a completely separate identity.
     */
    async createGuest(request: GuestAuthRequest): Promise<GuestAuthResponse> {
        const user = await this.prisma.player.create({
            data: {
                nickname: generateGuestNickname(),
                avatarSeed: randomAvatarSeed(() => randomInt(1_000_000) / 1_000_000),
            },
        });

        const payload: GuestJwtPayload = {
            sub: user.id,
            tabId: request.tabId,
            nickname: user.nickname,
        };

        const token = await this.jwt.signAsync(payload);

        return {
            token,
            user: {
                id: user.id,
                nickname: user.nickname,
                avatarSeed: user.avatarSeed,
                avatarUrl: buildAvatarUrl(user.avatarSeed),
            },
        };
    }

    /**
     * `POST /auth/register` - always public, always creates a brand-new `Player` from scratch
     * (guest and registered accounts never merge - there is no
     * "claim my guest identity" path). `nickname`/`avatarSeed` default to `username` since the
     * client doesn't send them separately. Fails with `ERR_VALIDATION` (+ `data.suggestions`,
     * 2-3 available alternatives) if the username is already taken.
     */
    async registerAccount(request: RegisterRequest): Promise<GuestAuthResponse> {
        const existing = await this.prisma.player.findUnique({
            where: { username: request.username },
        });
        if (existing) {
            throw new KarduxError('ERR_VALIDATION', 'That username is already taken.', {
                suggestions: await this.generateUsernameSuggestions(request.username),
            });
        }

        if (request.avatarSeed !== undefined && !isCatalogAvatarSeed(request.avatarSeed)) {
            throw new KarduxError('ERR_VALIDATION', 'Pick an avatar from the catalog.');
        }

        const passwordHash = await bcrypt.hash(request.password, PASSWORD_HASH_ROUNDS);
        const user = await this.withUniqueUsernameCheck(request.username, () =>
            this.prisma.player.create({
                data: {
                    nickname: request.username,
                    avatarSeed:
                        request.avatarSeed ??
                        randomAvatarSeed(() => randomInt(1_000_000) / 1_000_000),
                    username: request.username,
                    passwordHash,
                },
            }),
        );

        const payload: GuestJwtPayload = {
            sub: user.id,
            tabId: request.tabId,
            nickname: user.nickname,
        };

        const token = await this.jwt.signAsync(payload);

        return {
            token,
            user: {
                id: user.id,
                nickname: user.nickname,
                avatarSeed: user.avatarSeed,
                avatarUrl: buildAvatarUrl(user.avatarSeed),
            },
        };
    }

    /** `GET /auth/check-username` - same availability check `registerAccount` does, exposed
     *  standalone so a signup form can validate live while the user types. */
    async checkUsername(username: string): Promise<CheckUsernameResponse> {
        const existing = await this.prisma.player.findUnique({ where: { username } });
        if (!existing) {
            return { available: true, suggestions: [] };
        }

        return { available: false, suggestions: await this.generateUsernameSuggestions(username) };
    }

    /**
     * Entry point for a returning account - mints a fresh JWT for the SAME `Player.id` the
     * account was registered under, so every match that account hosted/joined before is
     * visible again via `GET /matches/mine` once the client stores the new token.
     */
    async login(request: LoginRequest): Promise<GuestAuthResponse> {
        const user = await this.prisma.player.findUnique({
            where: { username: request.username },
        });

        const isValid =
            user?.passwordHash != null &&
            (await bcrypt.compare(request.password, user.passwordHash));

        if (!isValid || !user) {
            throw new KarduxError('ERR_UNAUTHORIZED', 'Invalid username or password.');
        }

        const payload: GuestJwtPayload = {
            sub: user.id,
            tabId: request.tabId,
            nickname: user.nickname,
        };

        const token = await this.jwt.signAsync(payload);

        return {
            token,
            user: {
                id: user.id,
                nickname: user.nickname,
                avatarSeed: user.avatarSeed,
                avatarUrl: buildAvatarUrl(user.avatarSeed),
            },
        };
    }

    /** Appends a random 4-digit suffix to `username` and keeps only the candidates that
     *  aren't taken yet, in one query - truncates `username` first so the suggestion never
     *  exceeds `usernameSchema`'s 24-char max. */
    private async generateUsernameSuggestions(username: string): Promise<string[]> {
        const base = username.slice(0, USERNAME_MAX_LENGTH - 4);
        const candidates = Array.from(
            { length: USERNAME_SUGGESTION_COUNT * 4 },
            () => `${base}${randomInt(1000, 10_000)}`,
        );

        const taken = await this.prisma.player.findMany({
            where: { username: { in: candidates } },
            select: { username: true },
        });
        const takenUsernames = new Set(taken.map((row) => row.username));

        return candidates
            .filter((candidate) => !takenUsernames.has(candidate))
            .slice(0, USERNAME_SUGGESTION_COUNT);
    }

    /** Defensive fallback for the rare race where two requests for the same new username land
     *  between `registerAccount`'s own availability check and this `create` - the proactive
     *  check above handles the common case, this just makes sure a `P2002` never surfaces as
     *  an unhandled 500. */
    private async withUniqueUsernameCheck<T>(
        username: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR
            ) {
                throw new KarduxError('ERR_VALIDATION', 'That username is already taken.', {
                    suggestions: await this.generateUsernameSuggestions(username),
                });
            }
            throw error;
        }
    }
}
