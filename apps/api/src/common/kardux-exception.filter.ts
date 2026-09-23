import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ErrorCode } from '@kardux/contracts';
import { Catch, HttpStatus } from '@nestjs/common';
import { ERROR_MESSAGES } from '@kardux/contracts';
import { KarduxError } from './kardux-error.js';

/** Just the two response methods this filter needs - avoids depending on `@types/express`
 *  (not installed; Nest's own express typings aren't re-exported) for a single handler. */
interface MinimalHttpResponse {
    status(code: number): this;
    json(body: unknown): void;
}

/** One HTTP status per typed error code - docs/SPEC.md's socket layer sends these same codes
 *  as `error` events; the REST layer maps them to the closest HTTP semantics instead. */
const ERROR_HTTP_STATUS: Record<ErrorCode, HttpStatus> = {
    ERR_VALIDATION: HttpStatus.BAD_REQUEST,
    ERR_UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
    ERR_MATCH_NOT_FOUND: HttpStatus.NOT_FOUND,
    ERR_MATCH_FULL: HttpStatus.CONFLICT,
    ERR_MATCH_ALREADY_STARTED: HttpStatus.CONFLICT,
    ERR_NOT_HOST: HttpStatus.FORBIDDEN,
    ERR_NOT_YOUR_TURN: HttpStatus.FORBIDDEN,
    ERR_NOT_ENOUGH_PLAYERS: HttpStatus.CONFLICT,
    ERR_INVALID_CONFIG: HttpStatus.BAD_REQUEST,
    ERR_INVALID_ATTRIBUTE: HttpStatus.BAD_REQUEST,
    ERR_ALREADY_PLAYED: HttpStatus.CONFLICT,
    ERR_SPECTATOR_CANNOT_ACT: HttpStatus.FORBIDDEN,
    ERR_RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
    ERR_GUEST_CANNOT_HOST: HttpStatus.FORBIDDEN,
};

@Catch(KarduxError)
export class KarduxExceptionFilter implements ExceptionFilter {
    catch(exception: KarduxError, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<MinimalHttpResponse>();
        const status = ERROR_HTTP_STATUS[exception.code];
        const copy = ERROR_MESSAGES[exception.code];

        response.status(status).json({
            code: exception.code,
            message: exception.message !== exception.code ? exception.message : copy.en,
            messageEs: copy.es,
            ...(exception.data ? { data: exception.data } : {}),
        });
    }
}
