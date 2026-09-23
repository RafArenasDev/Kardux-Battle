import type { GuestAuthResponse } from '@kardux/contracts';

/**
 * `sessionStorage` only - never `localStorage` (docs/SPEC.md's "SESIONES MULTI-PESTAÑA"): a
 * duplicated tab must end up with its own identity, not silently inherit this one. Every
 * value here is scoped to this one tab's lifetime by the browser itself.
 */
const TOKEN_KEY = 'kardux.token';
const TAB_ID_KEY = 'kardux.tabId';
const USER_KEY = 'kardux.user';
const AUTH_METHOD_KEY = 'kardux.authMethod';

export type SessionUser = GuestAuthResponse['user'];

/** `guest`/`register`/`login` all return the identical `{token, user}` shape (see
 *  `auth.ts`'s comment on `guestAuthResponseSchema`) - nothing in the payload itself says
 *  which path minted it, so the frontend remembers which endpoint it called instead. This is
 *  what lets the UI show "regístrate para crear salas" instead of letting a guest's
 *  `POST /matches` 403 with `ERR_GUEST_CANNOT_HOST`. */
export type AuthMethod = 'guest' | 'account';

export function getTabId(): string {
    let tabId = sessionStorage.getItem(TAB_ID_KEY);
    if (!tabId) {
        tabId = crypto.randomUUID();
        sessionStorage.setItem(TAB_ID_KEY, tabId);
    }
    return tabId;
}

export function saveSession(auth: GuestAuthResponse, method: AuthMethod): void {
    sessionStorage.setItem(TOKEN_KEY, auth.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(auth.user));
    sessionStorage.setItem(AUTH_METHOD_KEY, method);
}

export function getToken(): string | null {
    return sessionStorage.getItem(TOKEN_KEY);
}

export function getUser(): SessionUser | null {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
}

export function isGuest(): boolean {
    return sessionStorage.getItem(AUTH_METHOD_KEY) === 'guest';
}

export function clearSession(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(AUTH_METHOD_KEY);
}

export function isAuthenticated(): boolean {
    return getToken() !== null;
}

const REDIRECT_KEY = 'kardux.redirect';

/** Where to go after signing in - set by a share link opened before authenticating. Only
 *  same-app paths are accepted, so this can never become an open redirect. */
export function setPostAuthRedirect(path: string): void {
    if (path.startsWith('/') && !path.startsWith('//')) {
        sessionStorage.setItem(REDIRECT_KEY, path);
    }
}

export function takePostAuthRedirect(): string | null {
    const path = sessionStorage.getItem(REDIRECT_KEY);
    sessionStorage.removeItem(REDIRECT_KEY);
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
}

export function updateStoredUser(user: SessionUser): void {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}
