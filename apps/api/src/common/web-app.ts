import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/** Paths the API owns. Everything else is a page of the web app. */
const API_PREFIXES = [
    '/auth',
    '/matches',
    '/decks',
    '/leaderboard',
    '/health',
    '/api',
    '/socket.io',
];

/** `apps/web/dist`, resolved from this file both in `src` (tsx) and in `dist` (compiled). */
function defaultWebDist(): string {
    const here = dirname(fileURLToPath(import.meta.url));
    return resolve(here, '..', '..', '..', 'web', 'dist');
}

/**
 * In production one Render service serves both the API and the built PWA: same origin, so no
 * CORS round trips and a single instance to keep awake on the free tier. Static files are
 * served with long-lived caching for hashed assets; any other GET that is not an API route
 * (`/home`, `/match/:id`, ...) gets `index.html`, so client-side routes survive a reload.
 *
 * Returns whether the web app was found and mounted (it is absent in local development, where
 * Vite serves it on its own port).
 */
export function mountWebApp(app: NestExpressApplication, webDist = defaultWebDist()): boolean {
    const indexHtml = join(webDist, 'index.html');
    if (!existsSync(indexHtml)) return false;

    app.useStaticAssets(webDist, {
        index: false,
        setHeaders: (response, path) => {
            const hashed = /[\\/]assets[\\/]/.test(path);
            const neverCache = /(sw\.js|workbox-.*\.js|manifest\.webmanifest|index\.html)$/.test(
                path,
            );
            response.setHeader(
                'Cache-Control',
                neverCache
                    ? 'no-cache'
                    : hashed
                      ? 'public, max-age=31536000, immutable'
                      : 'public, max-age=86400',
            );
        },
    });

    app.use((request: Request, response: Response, next: NextFunction) => {
        const isApi = API_PREFIXES.some(
            (prefix) => request.path === prefix || request.path.startsWith(`${prefix}/`),
        );
        const readsPage = request.method === 'GET' || request.method === 'HEAD';
        if (!readsPage || isApi || !request.accepts('html')) {
            next();
            return;
        }
        response.setHeader('Cache-Control', 'no-cache');
        response.sendFile(indexHtml);
    });

    return true;
}
