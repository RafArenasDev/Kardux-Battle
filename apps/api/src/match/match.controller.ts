import type { GuestJwtPayload } from '@kardux/contracts';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateMatchRequestDto, MatchSummaryDto, MatchSummaryListDto } from './match.dto.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MatchService } from './match.service.js';

@ApiTags('matches')
@Controller('matches')
export class MatchController {
    constructor(private readonly matchService: MatchService) {}

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Create a match',
        description:
            'Creates a new room in `LOBBY` status and returns its 6-character join code. ' +
            'The caller (from the bearer token) becomes the host. Every field is optional - ' +
            "anything left out falls back to the defaults in CLAUDE.md's `MatchConfig` " +
            '(2-12 players, 4 packs x 8 cards, etc.). Actual gameplay (dealing cards, turns) ' +
            'only starts once players connect to the Socket.IO `/game` namespace and the ' +
            'host issues `match:start` - this endpoint only reserves the room.',
    })
    @ApiBody({
        type: CreateMatchRequestDto,
        description: 'Partial MatchConfig - any field omitted uses its default.',
    })
    @ApiOkResponse({ type: MatchSummaryDto })
    async create(
        @CurrentUser() user: GuestJwtPayload,
        @Body() body: CreateMatchRequestDto,
    ): Promise<MatchSummaryDto> {
        return this.matchService.createMatch(user.sub, body);
    }

    @Get('public')
    @ApiOperation({
        summary: 'List public matches',
        description:
            'Open lobbies (`visibility: "public"`) still in `LOBBY` status, newest first ' +
            '(up to 50) - what a "join a random game" screen would call. No authentication ' +
            'required to browse.',
    })
    @ApiOkResponse({ type: MatchSummaryListDto })
    async listPublic(): Promise<MatchSummaryListDto> {
        return this.matchService.listPublic();
    }

    @Get(':code')
    @ApiOperation({
        summary: 'Get a match by its join code',
        description:
            'Looks up an active (`LOBBY` or `IN_PROGRESS`) match by its 6-character code - ' +
            'what a "join by code" screen calls before connecting to the socket, to show the ' +
            'room/host before committing. Returns `ERR_MATCH_NOT_FOUND` (404) if the code ' +
            "doesn't match any active match. No authentication required.",
    })
    @ApiOkResponse({ type: MatchSummaryDto })
    async getByCode(@Param('code') code: string): Promise<MatchSummaryDto> {
        return this.matchService.getByCode(code);
    }
}
