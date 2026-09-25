import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
// Value imports required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { AppConfig } from '../config/app-config.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Keeps the database inside a free tier (Aiven: 1 GB) by pruning what nobody needs anymore:
 * finished matches after `RETENTION_FINISHED_DAYS`, lobbies/games abandoned for a day, the
 * append-only event log after `RETENTION_EVENTS_DAYS`, and guest identities that never played -
 * plus a size guard that clears all history if the database nears `RETENTION_MAX_DB_MB`.
 * Registered accounts and the leaderboard are never touched. Runs hourly and shortly after
 * boot; every step is a bounded `deleteMany`, cheap enough for a 0.1-CPU instance.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap {
    private readonly logger = new Logger(RetentionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService<AppConfig, true>,
    ) {}

    onApplicationBootstrap(): void {
        setTimeout(() => void this.prune(), 30_000).unref();
    }

    @Cron(CronExpression.EVERY_HOUR)
    async prune(): Promise<void> {
        const now = Date.now();
        const finishedBefore = new Date(
            now - this.config.get('RETENTION_FINISHED_DAYS', { infer: true }) * DAY,
        );
        const eventsBefore = new Date(
            now - this.config.get('RETENTION_EVENTS_DAYS', { infer: true }) * DAY,
        );
        const staleBefore = new Date(now - DAY);
        const guestsBefore = new Date(now - 3 * DAY);

        try {
            const events = await this.prisma.matchEvent.deleteMany({
                where: { createdAt: { lt: eventsBefore } },
            });
            const matches = await this.prisma.match.deleteMany({
                where: {
                    OR: [
                        { status: 'FINISHED', createdAt: { lt: finishedBefore } },
                        {
                            status: { in: ['LOBBY', 'IN_PROGRESS'] },
                            createdAt: { lt: staleBefore },
                        },
                    ],
                },
            });
            const guests = await this.prisma.player.deleteMany({
                where: {
                    username: null,
                    createdAt: { lt: guestsBefore },
                    hostedMatches: { none: {} },
                    matchPlayers: { none: {} },
                    leaderboardStat: { is: null },
                },
            });

            if (events.count + matches.count + guests.count > 0) {
                this.logger.log(
                    `Retention: removed ${matches.count} match(es), ${events.count} event(s), ${guests.count} idle guest(s).`,
                );
            }

            await this.guardDatabaseSize();
        } catch (error) {
            this.logger.error(`Retention run failed: ${(error as Error).message}`);
        }
    }

    /**
     * Safety net for the free tier's storage cap: when the database grows past
     * `RETENTION_MAX_DB_MB`, drop everything that is only history - the whole event log and
     * every finished match (their rounds and deck snapshots cascade). Accounts, the ranking and
     * the card pool are never touched, and live matches are left alone.
     */
    private async guardDatabaseSize(): Promise<void> {
        const limitMb = this.config.get('RETENTION_MAX_DB_MB', { infer: true });
        const [row] = await this.prisma.$queryRaw<{ bytes: bigint }[]>`
            SELECT pg_database_size(current_database()) AS bytes`;
        const sizeMb = Number(row?.bytes ?? 0n) / (1024 * 1024);
        if (sizeMb < limitMb) return;

        const events = await this.prisma.matchEvent.deleteMany({});
        const matches = await this.prisma.match.deleteMany({ where: { status: 'FINISHED' } });
        this.logger.warn(
            `Database at ${sizeMb.toFixed(0)} MB (limit ${limitMb} MB): removed ${matches.count} finished match(es) and ${events.count} event(s).`,
        );
    }
}
