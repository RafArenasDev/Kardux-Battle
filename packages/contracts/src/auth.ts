import { z } from 'zod';

/**
 * Authentication contracts. Guests and registered accounts are two separate paths that never
 * merge: a guest is anonymous and short-lived, an account has its own username/password.
 *
 * Every token is bound to the browser tab that requested it (`tabId`): the socket handshake
 * cross-checks it, so a token copied into another tab is rejected.
 */

const tabIdSchema = z
    .string()
    .uuid()
    .describe('UUID generated in the browser once per tab (crypto.randomUUID()).');

export const guestAuthRequestSchema = z.object({ tabId: tabIdSchema });

export type GuestAuthRequest = z.infer<typeof guestAuthRequestSchema>;

export const guestAuthUserSchema = z.object({
    id: z.string().min(1).describe('Player id.'),
    nickname: z
        .string()
        .min(1)
        .describe('Public name: generated for guests, equal to the username for accounts.'),
    avatarSeed: z.string().min(1).describe('Avatar as "icon:color" from the avatar catalog.'),
    avatarUrl: z.string().url().describe('Ready-to-use avatar image URL.'),
});

export const guestAuthResponseSchema = z.object({
    token: z
        .string()
        .min(1)
        .describe(
            'Bearer JWT for this tab (12 h by default). Send it as `Authorization: Bearer <token>` ' +
                'and in the Socket.IO handshake.',
        ),
    rememberToken: z
        .string()
        .min(1)
        .optional()
        .describe(
            'Only when `remember` was requested on login/register: a 30-day token for ' +
                '`POST /auth/resume`, to stay signed in on this device.',
        ),
    user: guestAuthUserSchema,
});

export type GuestAuthResponse = z.infer<typeof guestAuthResponseSchema>;

export const usernameSchema = z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric/underscore only.')
    .describe('Login name: 3-24 letters, numbers or underscore.');

const rememberSchema = z
    .boolean()
    .optional()
    .describe('Keep this device signed in for 30 days (returns `rememberToken`).');

export const registerRequestSchema = z.object({
    username: usernameSchema,
    password: z
        .string()
        .min(8)
        .max(128)
        .describe('At least 8 characters. Stored only as a bcrypt hash.'),
    tabId: tabIdSchema,
    avatarSeed: z
        .string()
        .regex(/^[a-z-]+:[a-z]+$/, 'Avatar must be an "icon:color" pair from the catalog.')
        .optional()
        .describe('Chosen avatar as "icon:color". A random one is assigned when omitted.'),
    remember: rememberSchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const checkUsernameQuerySchema = z.object({ username: usernameSchema });

export type CheckUsernameQuery = z.infer<typeof checkUsernameQuerySchema>;

export const checkUsernameResponseSchema = z.object({
    available: z.boolean().describe('Whether this exact username can still be registered.'),
    suggestions: z
        .array(usernameSchema)
        .describe('2-3 free alternatives, only when the name is taken.'),
});

export type CheckUsernameResponse = z.infer<typeof checkUsernameResponseSchema>;

export const loginRequestSchema = z.object({
    username: usernameSchema,
    password: z.string().min(1).max(128).describe('The account password.'),
    tabId: tabIdSchema,
    remember: rememberSchema,
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** `POST /auth/resume`: trade a remember token for a fresh session in a new tab. */
export const resumeRequestSchema = z.object({
    rememberToken: z.string().min(1).describe('The `rememberToken` from a previous sign-in.'),
    tabId: tabIdSchema,
});

export type ResumeRequest = z.infer<typeof resumeRequestSchema>;

/** Claims of a session JWT - `sub` is the player id (RFC 7519). */
export interface GuestJwtPayload {
    sub: string;
    tabId: string;
    nickname: string;
}

/** Claims of a remember token. `typ` keeps it from ever passing as a session token. */
export interface RememberJwtPayload {
    sub: string;
    typ: 'remember';
}
