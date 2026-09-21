import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

export interface HealthResponse {
    status: 'ok';
    uptimeSeconds: number;
    timestamp: string;
}

/**
 * `GET /health` from CLAUDE.md's REST endpoint list. Intentionally has no constructor
 * dependencies for now (nothing to check yet - no Prisma/Redis clients exist until the next
 * phase); once they do, this becomes a real liveness/readiness check instead of "the process
 * is running."
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
    @Get()
    @ApiOperation({
        summary: 'Liveness check',
        description:
            'Returns `200 OK` with the process uptime if the API is running - no parameters, ' +
            'no auth, no database/cache dependency. Use this for uptime monitoring or the ' +
            'keep-alive trigger; it does not confirm Postgres/Redis are reachable.',
    })
    @ApiOkResponse({ description: 'The API process is running.' })
    check(): HealthResponse {
        return {
            status: 'ok',
            uptimeSeconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString(),
        };
    }
}
