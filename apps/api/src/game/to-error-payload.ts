import type { ErrorPayload } from '@kardux/contracts';
import { ERROR_MESSAGES } from '@kardux/contracts';
import { Logger } from '@nestjs/common';
import { ZodError } from 'zod';
import { KarduxError } from '../common/kardux-error.js';

const logger = new Logger('GameErrorMapping');

/** Shared by `GameGateway` and `MatchRuntimeService`: turns anything thrown while handling a
 *  socket action into the typed `ErrorPayload` CLAUDE.md's socket contract promises
 *  (`error (código + mensaje i18n)`) - never lets a raw exception reach a client. */
export function toErrorPayload(error: unknown): ErrorPayload {
    if (error instanceof KarduxError) {
        return {
            code: error.code,
            message: error.message !== error.code ? error.message : ERROR_MESSAGES[error.code].en,
            ...(error.data ? { data: error.data } : {}),
        };
    }

    if (error instanceof ZodError) {
        return {
            code: 'ERR_VALIDATION',
            message: error.issues[0]?.message ?? ERROR_MESSAGES.ERR_VALIDATION.en,
        };
    }

    logger.error(error);

    return { code: 'ERR_VALIDATION', message: ERROR_MESSAGES.ERR_VALIDATION.en };
}
