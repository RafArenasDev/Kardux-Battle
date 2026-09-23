import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
// Value import required: `LeaderboardQueryDto` is only ever used in a parameter type
// position below, but Nest/`nestjs-zod` still need it as a value so `emitDecoratorMetadata`
// records it in `design:paramtypes` - the same reflection metadata the DI gotcha relies on.
// An `import type` here would erase that and silently fall back to unvalidated `Object`.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LeaderboardQueryDto, LeaderboardResponseDto } from './leaderboard.dto.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LeaderboardService } from './leaderboard.service.js';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
    constructor(private readonly leaderboardService: LeaderboardService) {}

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Get the global leaderboard',
        description:
            'Returns the persisted global ranking, ordered by Elo (K=32, 1200 base) and ' +
            'keyset-paginated over `(elo desc, id desc)`. Only the `global` scope is ' +
            'implemented today: the schema has no per-card-source stats, no time-bucketed ' +
            'stats, and no friends graph yet, so the `scope`/`period`/friends filters from ' +
            "docs/SPEC.md's design are intentionally left out until those columns/tables are " +
            'designed and approved separately. Requires a bearer token (any guest works - ' +
            'this data has no per-user visibility rule, it just should never be callable ' +
            'anonymously).',
    })
    @ApiQuery({
        name: 'cursor',
        required: false,
        type: String,
        description:
            'Opaque cursor returned as `nextCursor` by a previous call. Omit to fetch the ' +
            'first page.',
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
        description: 'Page size, between 1 and 50. Defaults to 20.',
    })
    @ApiOkResponse({ type: LeaderboardResponseDto })
    async getGlobal(@Query() query: LeaderboardQueryDto): Promise<LeaderboardResponseDto> {
        return this.leaderboardService.getGlobal(query);
    }
}
