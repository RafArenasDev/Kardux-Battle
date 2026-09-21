import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/app-config.module.js';
import type { AppConfig } from './config/app-config.js';
import { HealthModule } from './health/health.module.js';

@Module({
    imports: [
        AppConfigModule,
        LoggerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<AppConfig, true>) => {
                const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

                // CLAUDE.md: "Logs estructurados (Pino) con matchId en cada línea" - matchId gets
                // added to the request-scoped logger by the gateway once matches exist; for now
                // every line at least carries the request id nestjs-pino already attaches.
                return {
                    pinoHttp: isProduction
                        ? { level: 'info' }
                        : {
                              level: 'debug',
                              transport: { target: 'pino-pretty', options: { singleLine: true } },
                          },
                };
            },
        }),
        ThrottlerModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<AppConfig, true>) => [
                {
                    ttl: config.get('RATE_LIMIT_TTL_MS', { infer: true }),
                    limit: config.get('RATE_LIMIT_MAX', { infer: true }),
                },
            ],
        }),
        HealthModule,
    ],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
