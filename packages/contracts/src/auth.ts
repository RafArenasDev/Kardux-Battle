import { z } from 'zod';

/**
 * `POST /auth/guest` (CLAUDE.md: "JWT de invitado (nickname + tabId)"). No password, no
 * returning user - every call mints a brand new, fully anonymous guest identity: `nickname`
 * and `avatarSeed` are generated server-side (2026-09-22 decision - a guest doesn't pick
 * either), the client only sends `tabId`, generated client-side
 * (`crypto.randomUUID()`, CLAUDE.md's "SESIONES MULTI-PESTAÑA") and embedded in the token
 * itself, not just sent alongside it later: the gateway's socket handshake
 * (`auth: { token, tabId }`) can then cross-check the handshake's `tabId` against the one the
 * token was actually issued for, rejecting a token replayed from a different tab.
 *
 * Guest and a registered account (`registerRequestSchema` below) are two COMPLETELY SEPARATE
 * paths that never merge - a guest can join matches (never host, see `ERR_GUEST_CANNOT_HOST`)
 * but has no way to turn into a registered account; registering always creates a brand-new
 * `User` with its own `username`/password, never "claims" a guest identity.
 */
export const guestAuthRequestSchema = z.object({
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
        .describe(
            'EN: Display name shown to other players - server-generated for a guest, equal to `username` for a registered account. ES: Nombre visible para los demás jugadores - generado por el servidor para un invitado, igual a `username` en una cuenta registrada.',
        ),
    avatarSeed: z
        .string()
        .min(1)
        .describe(
            'EN: Seed used to deterministically generate this avatar - random for a guest, equal to `username` for a registered account. ES: Semilla usada para generar el avatar de forma determinista - aleatoria para un invitado, igual a `username` en una cuenta registrada.',
        ),
    avatarUrl: z
        .string()
        .url()
        .describe(
            'EN: Ready-to-use avatar image URL (SVG), deterministically derived from avatarSeed via DiceBear (open source, no key needed) - render it directly in an <img>, no client-side generation required. ES: URL de la imagen del avatar (SVG), lista para usar, derivada de forma determinista de avatarSeed con DiceBear (open source, sin API key) - se puede renderizar directo en un <img>, sin generarla en el cliente.',
        ),
});

/** Shape returned by every auth entry point (`guest`, `register`, `login`) - a client never
 *  needs to branch on which one it called, it always gets back `{token, user}` ready to store
 *  in `sessionStorage`. Kept as `guestAuthResponseSchema` (the original name) since
 *  `auth.dto.ts`'s `GuestAuthResponseDto` already imports it by that name. */
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

/**
 * `POST /auth/register` - always public, no bearer token involved at all (2026-09-22, final
 * decision: guest and registered accounts are two separate paths, register never touches an
 * existing guest identity). Always creates a brand-new `User` from scratch with its own
 * `username`/`passwordHash` - `nickname` defaults to `username` (the client doesn't send one
 * separately). Issues a fresh JWT bound to `tabId`, same `{token, user}` shape as
 * `guest`/`login`.
 */
export const usernameSchema = z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric/underscore only.')
    .describe(
        'EN: Login handle, 3-24 chars, letters/numbers/underscore only - separate from the public `nickname`. ES: Usuario de acceso, 3-24 caracteres, solo letras/números/guion bajo - distinto del `nickname` público.',
    );

export const registerRequestSchema = z.object({
    username: usernameSchema,
    password: z
        .string()
        .min(8)
        .describe(
            'EN: Plaintext password, min 8 chars - hashed server-side, never stored or echoed back. ES: Contraseña en texto plano, mínimo 8 caracteres - se hashea en el servidor, nunca se guarda ni se devuelve.',
        ),
    tabId: z
        .string()
        .uuid()
        .describe(
            'EN: A UUID generated client-side once per browser tab (crypto.randomUUID()) - the fresh token this issues is bound to it, same as `guest`/`login`. ES: Un UUID generado en el navegador una vez por pestaña (crypto.randomUUID()) - el token nuevo que esto emite queda ligado a él, igual que `guest`/`login`.',
        ),
    avatarSeed: z
        .string()
        .regex(/^[a-z-]+:[a-z]+$/, 'Avatar must be an "icon:color" pair from the catalog.')
        .optional()
        .describe(
            'EN: The avatar the player picked, as "icon:color" from the avatar catalog (GET the catalog from @kardux/content). A random one is assigned when omitted.',
        ),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** `GET /auth/check-username` - lets a signup form validate live, before the user submits the
 *  full `POST /auth/register` body. Reuses the same suggestion logic `POST /auth/register`
 *  itself falls back to when the requested username turns out to be taken. */
export const checkUsernameQuerySchema = z.object({ username: usernameSchema });

export type CheckUsernameQuery = z.infer<typeof checkUsernameQuerySchema>;

export const checkUsernameResponseSchema = z.object({
    available: z
        .boolean()
        .describe(
            'EN: Whether this exact username can still be registered. ES: Si este nombre de usuario exacto todavía se puede registrar.',
        ),
    suggestions: z
        .array(usernameSchema)
        .describe(
            'EN: 2-3 available alternatives (only populated when `available` is false). ES: 2-3 alternativas disponibles (solo se llena cuando `available` es false).',
        ),
});

export type CheckUsernameResponse = z.infer<typeof checkUsernameResponseSchema>;

/** `POST /auth/login` - a fresh entry point like `guest`, not a continuation of an existing
 *  tab's session, so it needs its own `tabId` the same way `guestAuthRequestSchema` does. */
export const loginRequestSchema = z.object({
    username: registerRequestSchema.shape.username,
    password: z
        .string()
        .min(1)
        .describe('EN: The account password. ES: La contraseña de la cuenta.'),
    tabId: z
        .string()
        .uuid()
        .describe(
            'EN: A UUID generated client-side once per browser tab (crypto.randomUUID()). ES: Un UUID generado en el navegador una vez por pestaña (crypto.randomUUID()).',
        ),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Claims embedded in the guest JWT - `sub` is `User.id`, matching the JWT convention
 *  (RFC 7519) instead of a bespoke field name. Identical for a guest, a freshly-registered
 *  account, or a logged-in returning account - the token never encodes which path minted it. */
export interface GuestJwtPayload {
    sub: string;
    tabId: string;
    nickname: string;
}
