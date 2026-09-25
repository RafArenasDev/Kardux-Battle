import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiServiceUnavailableResponse,
    ApiTags,
} from '@nestjs/swagger';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MatchRuntimeService } from '../game/match-runtime.service.js';

export interface HealthResponse {
    status: 'ok';
    database: 'up';
    /** Redis keeps live matches across restarts; the game still works while it reconnects. */
    cache: 'up' | 'down' | 'disabled';
    uptimeSeconds: number;
    timestamp: string;
}

/**
 * `GET /health`: the process is up and the database answers (503 otherwise), plus whether the
 * Redis cache answers a `PING`. The uptime monitor that keeps the free Render instance awake
 * calls this every few minutes, so each ping also exercises the database and the cache.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly runtime: MatchRuntimeService,
    ) {}

    @Get()
    @ApiOperation({ summary: 'Liveness and database check' })
    @ApiOkResponse({ description: 'The API is running and the database answers.' })
    @ApiServiceUnavailableResponse({ description: 'The database is not reachable.' })
    async check(): Promise<HealthResponse> {
        try {
            await this.prisma.$queryRaw`SELECT 1`;
        } catch {
            throw new ServiceUnavailableException('Database unreachable');
        }
        return {
            status: 'ok',
            database: 'up',
            cache: await this.runtime.cacheStatus(),
            uptimeSeconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
        };
    }
}
