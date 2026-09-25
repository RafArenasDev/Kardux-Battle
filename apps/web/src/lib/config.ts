/**
 * Where the API lives. In production the API serves this app itself, so it is the same origin.
 * In development Vite runs on its own port and the API on 3000 of the same host, so opening the
 * dev server from another device on the LAN (phone testing) just works. `VITE_API_BASE_URL`
 * overrides both.
 */
export const API_BASE_URL: string =
    import.meta.env.VITE_API_BASE_URL ??
    (import.meta.env.PROD
        ? window.location.origin
        : `${window.location.protocol}//${window.location.hostname}:3000`);

export const APP_VERSION = __APP_VERSION__;
