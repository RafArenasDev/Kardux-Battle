import { z } from 'zod';

/**
 * Every typed error the gateway/engine can produce, per CLAUDE.md's "error (código +
 * mensaje i18n)". Keep this list append-only in practice - removing or renaming a code is a
 * breaking change for any client that switches on it.
 */
export const ERROR_CODES = [
    'ERR_VALIDATION',
    'ERR_UNAUTHORIZED',
    'ERR_MATCH_NOT_FOUND',
    'ERR_MATCH_FULL',
    'ERR_MATCH_ALREADY_STARTED',
    'ERR_NOT_HOST',
    'ERR_NOT_YOUR_TURN',
    'ERR_NOT_ENOUGH_PLAYERS',
    'ERR_INVALID_CONFIG',
    'ERR_INVALID_ATTRIBUTE',
    'ERR_ALREADY_PLAYED',
    'ERR_SPECTATOR_CANNOT_ACT',
    'ERR_RATE_LIMITED',
    'ERR_GUEST_CANNOT_HOST',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

export const errorPayloadSchema = z.object({
    code: errorCodeSchema,
    /** Human-readable, already-localized fallback for clients that don't bother looking up
     *  `code` in their own i18n bundle. */
    message: z.string().min(1),
    /** Generic, optional, per-throw extra context a specific error needs beyond its static
     *  `code`/`message` - e.g. `ERR_VALIDATION` on a taken username attaches
     *  `{ suggestions: string[] }`. Absent on every error that has nothing extra to say. */
    data: z.record(z.string(), z.unknown()).optional(),
});

export type ErrorPayload = z.infer<typeof errorPayloadSchema>;

/** Default es/en copy for every code - the API uses this to fill `ErrorPayload.message`;
 *  a frontend that has its own i18n bundle can still switch on `code` directly instead. */
export const ERROR_MESSAGES: Record<ErrorCode, { es: string; en: string }> = {
    ERR_VALIDATION: {
        es: 'Los datos enviados no son válidos.',
        en: 'The submitted data is invalid.',
    },
    ERR_UNAUTHORIZED: {
        es: 'Tu sesión no es válida o expiró.',
        en: 'Your session is invalid or has expired.',
    },
    ERR_MATCH_NOT_FOUND: {
        es: 'No existe ninguna partida con ese código.',
        en: 'No match exists with that code.',
    },
    ERR_MATCH_FULL: {
        es: 'La partida ya alcanzó el máximo de jugadores.',
        en: 'The match has already reached its maximum number of players.',
    },
    ERR_MATCH_ALREADY_STARTED: {
        es: 'La partida ya empezó.',
        en: 'The match has already started.',
    },
    ERR_NOT_HOST: {
        es: 'Solo el anfitrión puede hacer eso.',
        en: 'Only the host can do that.',
    },
    ERR_NOT_YOUR_TURN: {
        es: 'No es tu turno.',
        en: "It's not your turn.",
    },
    ERR_NOT_ENOUGH_PLAYERS: {
        es: 'Hacen falta más jugadores para empezar.',
        en: 'More players are needed to start.',
    },
    ERR_INVALID_CONFIG: {
        es: 'Esa configuración de partida no es válida.',
        en: 'That match configuration is invalid.',
    },
    ERR_INVALID_ATTRIBUTE: {
        es: 'Ese atributo no existe en este mazo.',
        en: 'That attribute does not exist in this deck.',
    },
    ERR_ALREADY_PLAYED: {
        es: 'Ya jugaste tu carta esta ronda.',
        en: 'You already played your card this round.',
    },
    ERR_SPECTATOR_CANNOT_ACT: {
        es: 'Los espectadores no pueden jugar.',
        en: 'Spectators cannot play.',
    },
    ERR_RATE_LIMITED: {
        es: 'Estás enviando acciones demasiado rápido.',
        en: "You're sending actions too fast.",
    },
    ERR_GUEST_CANNOT_HOST: {
        es: 'Debes registrarte (usuario y contraseña) para crear una sala. Los invitados solo pueden unirse a partidas ya creadas.',
        en: 'You must register (username and password) to create a room. Guests can only join matches that already exist.',
    },
};
