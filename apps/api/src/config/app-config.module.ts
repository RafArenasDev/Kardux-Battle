import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadAppConfig } from './app-config.js';

/** Loads and validates `.env` once (via Zod, see `app-config.ts`) and makes it available
 *  application-wide through Nest's own `ConfigService` - no separate config abstraction to
 *  learn, just a typed `validate` step instead of `@nestjs/config`'s usual class-validator
 *  DTO (this project validates everything with Zod, per ADR 0002). */
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validate: (env) => loadAppConfig(env),
        }),
    ],
})
export class AppConfigModule {}
