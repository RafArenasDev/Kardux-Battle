import { z } from 'zod';

/**
 * `POST /auth/guest` (CLAUDE.md: "JWT de invitado (nickname + tabId)"). There's no password,
 * no returning user - every call mints a brand new guest identity. `tabId` is generated
 * client-side (`crypto.randomUUID()`, CLAUDE.md's "SESIONES MULTI-PESTAÑA") and gets embedded
 * in the token itself, not just sent alongside it later: the gateway's socket handshake
 * (`auth: { token, tabId }`) can then cross-check the handshake's `tabId` against the one the
 * token was actually issued for, rejecting a token replayed from a different tab.
 */
export const guestAuthRequestSchema = z.object({
    nickname: z
        .string()
        .min(1)
        .max(24)
        .describe(
            'EN: Display name shown to other players (1-24 chars). ES: Nombre visible para los demás jugadores (1-24 caracteres).',
        ),
    avatarSeed: z
        .string()
        .min(1)
        .describe(
            "EN: Any non-empty string used to deterministically generate this player's avatar (e.g. an emoji, a random slug). ES: Cualquier texto no vacío usado para generar el avatar del jugador de forma determinista (por ejemplo, un emoji o un slug aleatorio).",
        ),
    tabId: z
        .string()
        .uuid()
        .describe(
            'EN: A UUID generated client-side once per browser tab (crypto.randomUUID()) - identifies this specific tab, not the player. ES: Un UUID generado en el navegador una vez por pestaña (crypto.randomUUID()) - identifica esa pestaña puntual, no al jugador.',
        ),
});

export type GuestAuthRequest = z.infer<typeof guestAuthRequestSchema>;

export const guestAuthUserSchema = z.object({
    id: z
        .string()
        .min(1)
        .describe('EN: The new guest user id. ES: El id del usuario invitado recién creado.'),
    nickname: z
        .string()
        .min(1)
        .describe('EN: Echoes the nickname that was sent. ES: Repite el nickname enviado.'),
    avatarSeed: z
        .string()
        .min(1)
        .describe('EN: Echoes the avatarSeed that was sent. ES: Repite el avatarSeed enviado.'),
    avatarUrl: z
        .string()
        .url()
        .describe(
            'EN: Ready-to-use avatar image URL (SVG), deterministically derived from avatarSeed via DiceBear (open source, no key needed) - render it directly in an <img>, no client-side generation required. ES: URL de la imagen del avatar (SVG), lista para usar, derivada de forma determinista de avatarSeed con DiceBear (open source, sin API key) - se puede renderizar directo en un <img>, sin generarla en el cliente.',
        ),
});

export const guestAuthResponseSchema = z.object({
    token: z
        .string()
        .min(1)
        .describe(
            'EN: Bearer JWT (12h by default) - store it in sessionStorage, never localStorage (see CLAUDE.md multi-tab rules), and send it as `Authorization: Bearer <token>` / in the Socket.IO handshake. ES: JWT de portador (12h por defecto) - guárdalo en sessionStorage, nunca en localStorage (ver las reglas multi-pestaña de CLAUDE.md), y envíalo como `Authorization: Bearer <token>` o en el handshake de Socket.IO.',
        ),
    user: guestAuthUserSchema,
});

export type GuestAuthResponse = z.infer<typeof guestAuthResponseSchema>;

/** Claims embedded in the guest JWT - `sub` is `User.id`, matching the JWT convention
 *  (RFC 7519) instead of a bespoke field name. */
export interface GuestJwtPayload {
    sub: string;
    tabId: string;
    nickname: string;
}
