import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app-config.js';
import { parseCorsOrigins } from './config/app-config.js';
import { KarduxExceptionFilter } from './common/kardux-exception.filter.js';
import { KarduxIoAdapter } from './common/kardux-io.adapter.js';
import { setupApiDocs } from './docs/api-docs.js';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.useLogger(app.get(Logger));

    const config = app.get(ConfigService<AppConfig, true>);

    const allowedOrigins = parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true }));

    app.use(helmet());
    app.enableCors({ origin: allowedOrigins });
    app.useWebSocketAdapter(new KarduxIoAdapter(app, allowedOrigins));
    // Request bodies are validated against the shared Zod schemas (ADR 0002).
    app.useGlobalPipes(new ZodValidationPipe());
    // Turns any thrown `KarduxError` into an HTTP response with the matching status and the
    // bilingual `ErrorPayload` body (docs/SPEC.md: "error (código + mensaje i18n)").
    app.useGlobalFilters(new KarduxExceptionFilter());

    setupApiDocs(app);

    const port = config.get('PORT', { infer: true });
    await app.listen(port);
    app.get(Logger).log(`Kardux Battle API listening on http://localhost:${port}`);
    app.get(Logger).log(`API docs at http://localhost:${port}/api/docs`);
}

void bootstrap();
