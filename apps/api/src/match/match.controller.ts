import type { GuestJwtPayload, MatchSummaryWithRole } from '@kardux/contracts';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
    CreateMatchRequestDto,
    MatchSummaryDto,
    MatchSummaryListDto,
    MatchSummaryWithRoleListDto,
} from './match.dto.js';
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
            'host issues `match:start` - this endpoint only reserves the room. Requires a ' +
            '**registered** caller (`POST /auth/register` or `POST /auth/login` first) - a ' +
            'pure guest identity can join any match but cannot host one, otherwise the room ' +
            "would only be as durable as the host's 12h guest JWT. Fails with " +
            '`ERR_GUEST_CANNOT_HOST` (403) if the caller never registered.',
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
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'List public matches',
        description:
            'Open lobbies (`visibility: "public"`) still in `LOBBY` status, newest first ' +
            '(up to 50) - what a "join a random game" screen would call. Requires a bearer ' +
            'token like every other endpoint - "public" describes the lobby\'s visibility ' +
            'setting, not anonymous access to the API.',
    })
    @ApiOkResponse({ type: MatchSummaryListDto })
    async listPublic(): Promise<MatchSummaryListDto> {
        return this.matchService.listPublic();
    }

    @Get('mine')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: "List the caller's matches",
        description:
            'Every match the authenticated caller (from the bearer token) is involved in - ' +
            'either as the host or as a player whose join request has already been approved ' +
            '(`MatchPlayer.status: "APPROVED"`) - each tagged with `role`: `"admin"` if the ' +
            'caller is the host, `"player"` otherwise. A match still waiting on the host\'s ' +
            "`match:respondJoin` decision (`PENDING`) doesn't show up here yet. Newest first.",
    })
    @ApiOkResponse({ type: MatchSummaryWithRoleListDto })
    async listMine(@CurrentUser() user: GuestJwtPayload): Promise<MatchSummaryWithRole[]> {
        return this.matchService.listMine(user.sub);
    }

    @Get(':code')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'Get a match by its join code',
        description:
            'Looks up an active (`LOBBY` or `IN_PROGRESS`) match by its 6-character code - ' +
            'what a "join by code" screen calls before connecting to the socket, to show the ' +
            'room/host before committing. Returns `ERR_MATCH_NOT_FOUND` (404) if the code ' +
            "doesn't match any active match. Requires a bearer token.",
    })
    @ApiOkResponse({ type: MatchSummaryDto })
    async getByCode(@Param('code') code: string): Promise<MatchSummaryDto> {
        return this.matchService.getByCode(code);
    }
}
