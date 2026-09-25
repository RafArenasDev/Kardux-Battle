import { z } from 'zod';

/**
 * Every environment variable the API needs, validated once at boot - fail fast with a clear
 * message instead of a confusing runtime error three requests in. Mirrors `.env.example`
 * field for field; a new variable gets added here at the same time it's added there.
 *
 * `DB_*`/`REDIS_URL` are validated here even though nothing consumes them yet (Prisma/Redis
 * modules land in the next phase) - cheap to validate now, and it means `.env` only needs to
 * be right once instead of being re-checked module by module later.
 */
const envSchema = z.object({
    DB_USERNAME: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive(),
    DB_NAME: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    DATABASE_PROVIDER: z.enum(['postgresql', 'sqlite']),

    REDIS_URL: z.string().min(1),

    JWT_SECRET: z.string().min(16, 'JWT_SECRET should be a real random secret, not a placeholder.'),
    JWT_GUEST_TTL: z.string().min(1),

    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    CORS_ORIGINS: z.string().min(1),

    RATE_LIMIT_TTL_MS: z.coerce.number().int().positive(),
    RATE_LIMIT_MAX: z.coerce.number().int().positive(),

    // --- Free-tier data retention (see RetentionService) ---
    RETENTION_FINISHED_DAYS: z.coerce.number().int().positive().default(7),
    RETENTION_EVENTS_DAYS: z.coerce.number().int().positive().default(2),
    /** Size (MB) at which the retention job also clears all match history (1 GB free tier). */
    RETENTION_MAX_DB_MB: z.coerce.number().int().positive().default(700),

    // --- Deck kill switch: comma-separated deck ids hidden from players (e.g. "pokeapi") ---
    DISABLED_DECKS: z.string().default(''),
});

export type AppConfig = z.infer<typeof envSchema>;

/** Called once from `main.ts` (and from tests that need a valid config without a real
 *  `.env`). Throws a readable Zod error listing every missing/invalid variable at once,
 *  rather than failing on whichever one happens to be read first. */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
    return envSchema.parse(env);
}

/** Splits `CORS_ORIGINS` ("http://localhost:5173,http://localhost:1420") into the array
 *  Nest's CORS option expects. */
export function parseCorsOrigins(value: string): string[] {
    return value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
}

/** Deck ids switched off by the operator (`DISABLED_DECKS`), e.g. to pull a deck instantly
 *  from a public deployment without a code change. */
export function disabledDeckIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
    return new Set(
        (env.DISABLED_DECKS ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id.length > 0),
    );
}
