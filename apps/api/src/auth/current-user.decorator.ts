import type { ExecutionContext } from '@nestjs/common';
import type { GuestJwtPayload } from '@kardux/contracts';
import { createParamDecorator } from '@nestjs/common';

interface RequestWithUser {
    user?: GuestJwtPayload;
}

/** Reads the payload `JwtAuthGuard` attached to the request - only valid on a route
 *  guarded by `JwtAuthGuard` (undefined otherwise, since nothing else sets `request.user`). */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
});
