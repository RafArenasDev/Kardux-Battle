import type {
    CheckUsernameResponse,
    CreateMatchRequest,
    DeckSourceDescriptor,
    ErrorPayload,
    GuestAuthResponse,
    LoginRequest,
    MatchSummary,
    MatchSummaryWithRole,
    RegisterRequest,
} from '@kardux/contracts';
import { getToken } from './session';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

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

    const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : undefined;

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

export function listPublicMatches(): Promise<MatchSummary[]> {
    return request('/matches/public');
}

export function listMyMatches(): Promise<MatchSummaryWithRole[]> {
    return request('/matches/mine');
}

export function getMatchByCode(code: string): Promise<MatchSummary> {
    return request(`/matches/${code}`);
}
