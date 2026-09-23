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
import { getToken } from './session';

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
    query?: Record<string, string | undefined>;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, auth = true, query } = options;

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
        throw new ApiError(
            { code: 'ERR_VALIDATION', message: 'No hay conexión con el servidor.' },
            0,
        );
    }

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const text = isJson ? await response.text() : '';
    // `null` bodies (e.g. GET /matches/active with no match) come back as an empty 200.
    const data: unknown = text ? JSON.parse(text) : isJson ? null : undefined;

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

export function getActiveMatch(): Promise<MatchSummary | null> {
    return request('/matches/active');
}

export function getLeaderboard(): Promise<LeaderboardResponse> {
    return request('/leaderboard', { query: { limit: '8' } });
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
