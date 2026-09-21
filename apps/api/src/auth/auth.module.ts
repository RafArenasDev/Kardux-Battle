import type { AppConfig } from '../config/app-config.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

// Captured in a variable so it can be re-exported below - a module importing only
// `AuthModule` (e.g. `MatchModule`, for `JwtAuthGuard`) otherwise can't resolve `JwtService`
// as one of that guard's own constructor dependencies (Nest resolves a guard's dependencies
// through the importing module's graph, not the module that originally provided the guard).
const jwtModule = JwtModule.registerAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
            // `expiresIn` is typed as `number | StringValue` (the `ms` package's branded
            // literal type, e.g. "12h"), not plain `string` - our Zod schema only guarantees a
            // non-empty string, so the cast is required. The actual value ("12h" by default,
            // JWT_GUEST_TTL in .env) is a real duration string either way.
            expiresIn: config.get('JWT_GUEST_TTL', { infer: true }) as NonNullable<
                JwtSignOptions['expiresIn']
            >,
        },
    }),
});

@Module({
    imports: [jwtModule],
    controllers: [AuthController],
    providers: [AuthService, JwtAuthGuard],
    exports: [AuthService, JwtAuthGuard, jwtModule],
})
export class AuthModule {}
