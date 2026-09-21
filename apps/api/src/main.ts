import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app-config.js';
import { parseCorsOrigins } from './config/app-config.js';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    app.useLogger(app.get(Logger));

    const config = app.get(ConfigService<AppConfig, true>);

    app.use(helmet());
    app.enableCors({ origin: parseCorsOrigins(config.get('CORS_ORIGINS', { infer: true })) });

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
                    'REST + Socket.IO gateway for Kardux Battle. Every schema here comes straight ' +
                        'from @kardux/contracts - see ADR 0005.',
                )
                .setVersion('0.1.0')
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
