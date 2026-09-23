import type { ErrorCode, ErrorPayload } from '@kardux/contracts';
import { ApiError } from './api';

const MESSAGES: Record<ErrorCode, string> = {
    ERR_VALIDATION: 'Revisa los datos e inténtalo de nuevo.',
    ERR_UNAUTHORIZED: 'Tu sesión no es válida. Vuelve a entrar.',
    ERR_MATCH_NOT_FOUND: 'No encontramos esa partida. Revisa el código.',
    ERR_MATCH_FULL: 'La sala está llena.',
    ERR_MATCH_ALREADY_STARTED: 'La partida ya comenzó.',
    ERR_NOT_HOST: 'Solo el anfitrión puede hacer eso.',
    ERR_NOT_YOUR_TURN: 'Todavía no es tu turno.',
    ERR_NOT_ENOUGH_PLAYERS: 'Faltan jugadores para empezar.',
    ERR_INVALID_CONFIG: 'Esa configuración no es válida para este mazo.',
    ERR_INVALID_ATTRIBUTE: 'Ese atributo no existe en tu carta.',
    ERR_ALREADY_PLAYED: 'Ya jugaste tu carta en esta ronda.',
    ERR_SPECTATOR_CANNOT_ACT: 'Estás mirando como espectador.',
    ERR_RATE_LIMITED: 'Vas muy rápido, espera un momento.',
    ERR_GUEST_CANNOT_HOST: 'Crea una cuenta para abrir salas privadas.',
};

/** Server messages are English/technical; show the friendly Spanish text unless the server
 *  already wrote a Spanish, user-facing explanation (deck limits, interrupted matches). */
export function errorMessage(error: unknown): string {
    const payload: ErrorPayload | undefined =
        error instanceof ApiError ? error.payload : isErrorPayload(error) ? error : undefined;

    if (!payload) {
        return error instanceof Error ? error.message : 'Algo salió mal.';
    }

    if (/[áéíóúñ¿¡]|Este mazo|partida/i.test(payload.message ?? '')) {
        return payload.message;
    }

    return MESSAGES[payload.code] ?? payload.message ?? 'Algo salió mal.';
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
