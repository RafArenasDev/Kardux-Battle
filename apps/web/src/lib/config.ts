/** Where the API lives. Defaults to the same host the page was served from on port 3000, so
 *  opening the dev server from another device on the LAN (phone testing) just works. */
export const API_BASE_URL: string =
    import.meta.env.VITE_API_BASE_URL ??
    `${window.location.protocol}//${window.location.hostname}:3000`;

export const APP_VERSION = __APP_VERSION__;
