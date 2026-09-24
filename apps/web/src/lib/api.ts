import type {
    CheckUsernameResponse,
    CreateMatchRequest,
    DeckSourceDescriptor,
    ErrorPayload,
    GuestAuthResponse,
    LeaderboardResponse,
    LoginRequest,
    MatchSummary,
    MatchSummaryWithRole,
    RegisterRequest,
} from '@kardux/contracts';
import { forgetDevice, getRememberToken, getTabId, getToken, saveSession } from './session';

import { API_BASE_URL as BASE_URL } from './config';

export class ApiError extends Error {
    constructor(
        public readonly payload: ErrorPayload,
        public readonly status: number,
    ) {
        super(payload.message);
        this.name = 'ApiError';
    }
}

interface RequestOptions {
    method?: string;
    body?: unknown;
    auth?: boolean;
    /** Retry once after silently resuming a remembered session on a 401. */
    retry?: boolean;
    query?: Record<string, string | undefined>;
}

/** Only one resume in flight: parallel 401s all wait for the same fresh session. */
let resuming: Promise<boolean> | null = null;

/** Trades the device's remember token for a new session in this tab. */
export function resumeRememberedSession(): Promise<boolean> {
    const rememberToken = getRememberToken();
    if (!rememberToken) return Promise.resolve(false);
    resuming ??= request<GuestAuthResponse>('/auth/resume', {
        method: 'POST',
        body: { rememberToken, tabId: getTabId() },
        auth: false,
        retry: false,
    })
        .then((auth) => {
            saveSession(auth, 'account');
            return true;
        })
        .catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 401) forgetDevice();
            return false;
        })
        .finally(() => {
            resuming = null;
        });
    return resuming;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, auth = true, retry = true, query } = options;

    const url = new URL(path, BASE_URL);
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value !== undefined) url.searchParams.set(key, value);
        }
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth) {
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
        response = await fetch(url, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new ApiError({ code: 'ERR_VALIDATION', message: 'Cannot reach the server.' }, 0);
    }

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const text = isJson ? await response.text() : '';
    // `null` bodies (e.g. GET /matches/active with no match) come back as an empty 200.
    const data: unknown = text ? JSON.parse(text) : isJson ? null : undefined;

    // The 12 h session expired but the device is remembered: renew it and try once more.
    if (response.status === 401 && auth && retry && (await resumeRememberedSession())) {
        return request<T>(path, { ...options, retry: false });
    }

    if (!response.ok) {
        throw new ApiError(
            (data as ErrorPayload) ?? { code: 'ERR_VALIDATION', message: response.statusText },
            response.status,
        );
    }

    return data as T;
}

// ---- Auth (no bearer required) ----

export function createGuest(tabId: string): Promise<GuestAuthResponse> {
    return request('/auth/guest', { method: 'POST', body: { tabId }, auth: false });
}

export function register(payload: RegisterRequest): Promise<GuestAuthResponse> {
    return request('/auth/register', { method: 'POST', body: payload, auth: false });
}

export function login(payload: LoginRequest): Promise<GuestAuthResponse> {
    return request('/auth/login', { method: 'POST', body: payload, auth: false });
}

export function checkUsername(username: string): Promise<CheckUsernameResponse> {
    return request('/auth/check-username', { auth: false, query: { username } });
}

// ---- Decks ----

export function listDeckSources(): Promise<DeckSourceDescriptor[]> {
    return request('/decks/sources');
}

// ---- Matches ----

export function createMatch(payload: CreateMatchRequest): Promise<MatchSummary> {
    return request('/matches', { method: 'POST', body: payload });
}

export function getLeaderboard(limit = 20): Promise<LeaderboardResponse> {
    return request('/leaderboard', { query: { limit: String(limit) } });
}

export function listMyMatches(): Promise<MatchSummaryWithRole[]> {
    return request('/matches/mine');
}

/** Host: deletes the match for good. Anyone else seated: leaves it. */
export function deleteMatch(matchId: string): Promise<void> {
    return request(`/matches/${matchId}`, { method: 'DELETE' });
}

export function getMatchByCode(code: string): Promise<MatchSummary> {
    return request(`/matches/${code}`);
}
