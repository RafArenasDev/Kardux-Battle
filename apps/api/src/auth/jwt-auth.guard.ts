import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { GuestJwtPayload } from '@kardux/contracts';
import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { JwtService } from '@nestjs/jwt';
import { KarduxError } from '../common/kardux-error.js';

/** Minimal shape of the request object this guard needs - avoids depending on
 *  `@types/express` (not installed) for a single header read. */
interface RequestWithAuthHeader {
    headers: { authorization?: string };
    user?: GuestJwtPayload;
}

/**
 * Verifies the `Authorization: Bearer <token>` header against the same `JwtService` that
 * signs guest tokens in `AuthService`, and attaches the decoded payload to `request.user`.
 * No Passport strategy: `JwtService.verifyAsync` alone is enough for a single, simple
 * bearer-token scheme, and skips adding `passport`/`passport-jwt` as dependencies.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwt: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithAuthHeader>();
        const header = request.headers.authorization;
        const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

        if (!token) {
            throw new KarduxError('ERR_UNAUTHORIZED', 'Missing bearer token.');
        }

        try {
            request.user = await this.jwt.verifyAsync<GuestJwtPayload>(token);
        } catch {
            throw new KarduxError('ERR_UNAUTHORIZED', 'Invalid or expired token.');
        }

        return true;
    }
}
