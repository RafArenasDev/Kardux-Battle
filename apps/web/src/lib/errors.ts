import type { ErrorCode, ErrorPayload } from '@kardux/contracts';
import type { LocalizedText } from '@kardux/content';
import { ApiError } from './api';
import { currentLocale, pick } from './i18n';

/** Player-facing copy per error code; the server's message is technical English. */
const MESSAGES: Record<ErrorCode, LocalizedText> = {
    ERR_VALIDATION: {
        es: 'Revisa los datos e inténtalo de nuevo.',
        en: 'Check the details and try again.',
    },
    ERR_UNAUTHORIZED: {
        es: 'Tu sesión expiró. Vuelve a entrar.',
        en: 'Your session expired. Sign in again.',
    },
    ERR_MATCH_NOT_FOUND: {
        es: 'No encontramos esa partida. Revisa el código.',
        en: 'We could not find that match. Check the code.',
    },
    ERR_MATCH_FULL: { es: 'La sala está llena.', en: 'The room is full.' },
    ERR_MATCH_ALREADY_STARTED: { es: 'La partida ya comenzó.', en: 'The match already started.' },
    ERR_NOT_HOST: { es: 'Solo el anfitrión puede hacer eso.', en: 'Only the host can do that.' },
    ERR_NOT_YOUR_TURN: { es: 'Todavía no es tu turno.', en: 'It is not your turn yet.' },
    ERR_NOT_ENOUGH_PLAYERS: {
        es: 'Faltan jugadores para empezar.',
        en: 'More players are needed to start.',
    },
    ERR_INVALID_CONFIG: {
        es: 'Esa configuración no es válida para este mazo.',
        en: 'That setup is not valid for this deck.',
    },
    ERR_INVALID_ATTRIBUTE: {
        es: 'Ese atributo no existe en tu carta.',
        en: 'That attribute is not on your card.',
    },
    ERR_ALREADY_PLAYED: {
        es: 'Ya jugaste tu carta en esta ronda.',
        en: 'You already played this round.',
    },
    ERR_SPECTATOR_CANNOT_ACT: {
        es: 'Estás mirando como espectador.',
        en: 'You are watching as a spectator.',
    },
    ERR_RATE_LIMITED: { es: 'Vas muy rápido, espera un momento.', en: 'Too fast, wait a moment.' },
    ERR_GUEST_CANNOT_HOST: {
        es: 'Crea una cuenta para abrir salas privadas.',
        en: 'Create an account to open private rooms.',
    },
    ERR_TABLE_FULL: {
        es: 'La mesa está llena, prueba otra.',
        en: 'The table is full, try another one.',
    },
    ERR_NOT_ENOUGH_CHIPS: {
        es: 'No tienes fichas suficientes.',
        en: 'You do not have enough chips.',
    },
    ERR_INVALID_BET: {
        es: 'Esa apuesta no es válida en esta mesa.',
        en: 'That bet is not valid at this table.',
    },
    ERR_NOT_ALLOWED: {
        es: 'Esa jugada no está permitida ahora.',
        en: 'That move is not allowed right now.',
    },
};

const OFFLINE: LocalizedText = {
    es: 'Sin conexión con el servidor. Revisa tu internet o inténtalo en unos segundos.',
    en: 'Cannot reach the server. Check your internet or try again in a few seconds.',
};

const UNEXPECTED: LocalizedText = {
    es: 'No se pudo completar la acción. Inténtalo de nuevo.',
    en: 'That could not be completed. Please try again.',
};

const SERVER_DOWN: LocalizedText = {
    es: 'El servidor tuvo un problema. Inténtalo de nuevo en un momento.',
    en: 'The server had a problem. Try again in a moment.',
};

/** Turns anything thrown by the API/socket into a clear, localized sentence. */
export function errorMessage(error: unknown): string {
    const locale = currentLocale();

    if (error instanceof ApiError) {
        if (error.status === 0) return pick(OFFLINE, locale);
        if (error.status >= 500) return pick(SERVER_DOWN, locale);
    }

    const payload: ErrorPayload | undefined =
        error instanceof ApiError ? error.payload : isErrorPayload(error) ? error : undefined;

    if (!payload) {
        if (error instanceof TypeError) return pick(OFFLINE, locale);
        // Unexpected client-side failure: keep the detail in the console, not on screen.
        console.error(error);
        return pick(UNEXPECTED, locale);
    }

    // Deck-limit problems carry their own bilingual explanation.
    const localized = payload.data?.localized as LocalizedText | undefined;
    if (localized && typeof localized === 'object' && 'es' in localized)
        return pick(localized, locale);

    const known = MESSAGES[payload.code as ErrorCode];
    return pick(known ?? UNEXPECTED, locale);
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
