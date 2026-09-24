import type { ErrorCode, ErrorPayload } from '@kardux/contracts';
import { ERROR_CODES } from '@kardux/contracts';
import type { LocalizedText } from '@kardux/content';
import i18n from '../i18n';
import { ApiError } from './api';
import { pick } from './i18n';

function isKnownCode(code: string): code is ErrorCode {
    return (ERROR_CODES as readonly string[]).includes(code);
}

/** Turns anything thrown by the API/socket into a clear sentence in the player's language. */
export function errorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 0) return i18n.t('errors.offline');
        if (error.status >= 500) return i18n.t('errors.serverDown');
    }

    const payload: ErrorPayload | undefined =
        error instanceof ApiError ? error.payload : isErrorPayload(error) ? error : undefined;

    if (!payload) {
        if (error instanceof TypeError) return i18n.t('errors.offline');
        // Unexpected client-side failure: keep the detail in the console, not on screen.
        console.error(error);
        return i18n.t('errors.unexpected');
    }

    // Deck-limit problems carry their own bilingual explanation from `@kardux/content`.
    const localized = payload.data?.localized as LocalizedText | undefined;
    if (localized && typeof localized === 'object' && 'es' in localized) return pick(localized);

    return isKnownCode(payload.code)
        ? i18n.t(`errors.codes.${payload.code}`)
        : i18n.t('errors.unexpected');
}

export function isErrorPayload(value: unknown): value is ErrorPayload {
    return (
        typeof value === 'object' &&
        value !== null &&
        'code' in value &&
        typeof (value as { code: unknown }).code === 'string' &&
        (value as { code: string }).code.startsWith('ERR_')
    );
}
