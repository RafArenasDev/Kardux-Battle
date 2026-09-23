import type { ErrorCode } from '@kardux/contracts';

/**
 * Thrown anywhere in the API to signal one of `@kardux/contracts`'s typed error codes.
 * `KarduxExceptionFilter` is what turns this into an HTTP response with the matching status
 * and the bilingual `ErrorPayload` body (docs/SPEC.md: "error (código + mensaje i18n)").
 */
export class KarduxError extends Error {
    constructor(
        public readonly code: ErrorCode,
        message?: string,
        /** Optional generic extra context for this specific throw - see
         *  `@kardux/contracts`'s `errorPayloadSchema.data`. */
        public readonly data?: Record<string, unknown>,
    ) {
        super(message ?? code);
        this.name = 'KarduxError';
    }
}
