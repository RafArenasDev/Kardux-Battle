import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc, ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app-config.js';
import { parseCorsOrigins } from './config/app-config.js';
import { KarduxExceptionFilter } from './common/kardux-exception.filter.js';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.useLogger(app.get(Logger));

    const config = app.get(ConfigService<AppConfig, true>);

    app.use(helmet());
    app.enableCors({ origin: parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true })) });
    // Every request/response body is validated against the same Zod schemas @kardux/contracts
    // exports (ADR 0002) - no class-validator decorators anywhere in this codebase.
    app.useGlobalPipes(new ZodValidationPipe());
    // Turns any thrown `KarduxError` into an HTTP response with the matching status and the
    // bilingual `ErrorPayload` body (CLAUDE.md: "error (código + mensaje i18n)").
    app.useGlobalFilters(new KarduxExceptionFilter());

    // cleanupOpenApiDoc fixes up the schemas nestjs-zod's createZodDto classes produce -
    // without it, a Zod-backed DTO renders as `{}` in the generated document (ADR 0005: docs
    // come straight from the same Zod schemas used for validation, never a hand-duplicated
    // `@ApiProperty()` class).
    const swaggerDocument = cleanupOpenApiDoc(
        SwaggerModule.createDocument(
            app,
            new DocumentBuilder()
                .setTitle('Kardux Battle API')
                .setDescription(
                    'REST + Socket.IO gateway for Kardux Battle. Every request/response schema ' +
                        "shown here comes straight from `@kardux/contracts`'s Zod schemas - the " +
                        "same ones the API validates against - so this doc can't drift from " +
                        'what actually works. Every endpoint below has a full description and, ' +
                        'for endpoints that take a body, a description per field - use ' +
                        '"Try it out" to send a real request straight from this page.',
                )
                .setVersion('0.1.0')
                .addTag('health', 'Liveness/readiness.')
                .addTag('auth', 'Guest identities (no accounts, no passwords).')
                .addTag(
                    'matches',
                    'Create/find match rooms (lobby only - live play is Socket.IO, not REST).',
                )
                .addTag('decks', 'Card deck sources catalog.')
                .addTag('leaderboard', 'Global, persisted player rankings.')
                .addBearerAuth()
                .build(),
        ),
    );
    SwaggerModule.setup('api/docs', app, swaggerDocument);

    const port = config.get('PORT', { infer: true });
    await app.listen(port);
    app.get(Logger).log(`Kardux Battle API listening on http://localhost:${port}`);
    app.get(Logger).log(`API docs at http://localhost:${port}/api/docs`);
}

void bootstrap();
