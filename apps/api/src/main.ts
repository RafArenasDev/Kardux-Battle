import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app-config.js';
import { parseCorsOrigins } from './config/app-config.js';
import { KarduxExceptionFilter } from './common/kardux-exception.filter.js';
import { KarduxIoAdapter } from './common/kardux-io.adapter.js';
import { mountWebApp } from './common/web-app.js';
import { setupApiDocs } from './docs/api-docs.js';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
    // Render (and any reverse proxy) terminates TLS in front of us: trust it for client IPs,
    // which the rate limiter keys on.
    app.set('trust proxy', 1);
    app.useLogger(app.get(Logger));

    const config = app.get(ConfigService<AppConfig, true>);

    // The API also serves the web app, so its own public URL (set by Render) is always allowed.
    const allowedOrigins = [
        ...parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true })),
        ...(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL] : []),
    ];

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    // Pokémon artwork comes from PokéAPI's sprite repository; avatars and card
                    // art are inline SVG data URIs.
                    'img-src': ["'self'", 'data:', 'https://raw.githubusercontent.com'],
                    'connect-src': ["'self'", 'wss:', 'https://raw.githubusercontent.com'],
                    'worker-src': ["'self'"],
                    'manifest-src': ["'self'"],
                },
            },
        }),
    );
    app.enableCors({ origin: allowedOrigins });
    app.useWebSocketAdapter(new KarduxIoAdapter(app, allowedOrigins));
    // Request bodies are validated against the shared Zod schemas (ADR 0002).
    app.useGlobalPipes(new ZodValidationPipe());
    // Turns any thrown `KarduxError` into an HTTP response with the matching status and the
    // bilingual `ErrorPayload` body (docs/SPEC.md: "error (código + mensaje i18n)").
    app.useGlobalFilters(new KarduxExceptionFilter());

    setupApiDocs(app);
    const servesWeb = mountWebApp(app);

    const port = config.get('PORT', { infer: true });
    await app.listen(port);
    app.get(Logger).log(`Kardux Battle API listening on http://localhost:${port}`);
    app.get(Logger).log(`API docs at http://localhost:${port}/api/docs`);
    if (servesWeb) app.get(Logger).log('Serving the web app from the same origin.');
}

void bootstrap();
