import type { GuestAuthRequest, GuestAuthResponse, GuestJwtPayload } from '@kardux/contracts';
import { Injectable } from '@nestjs/common';
// Value imports required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JwtService } from '@nestjs/jwt';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';
import { buildAvatarUrl } from '../common/avatar.js';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwt: JwtService,
    ) {}

    /**
     * Always creates a brand-new guest `User` row - there is no "log back in" for a guest
     * identity (CLAUDE.md: nickname + tabId only, no password). A reconnecting tab restores its
     * session with the JWT it already has (`match:rejoin`), not by calling this again.
     */
    async createGuest(request: GuestAuthRequest): Promise<GuestAuthResponse> {
        const user = await this.prisma.user.create({
            data: {
                nickname: request.nickname,
                avatarSeed: request.avatarSeed,
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
}
