import type { GuestJwtPayload, MatchSummary, MatchSummaryWithRole } from '@kardux/contracts';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
    CreateMatchRequestDto,
    MatchSummaryDto,
    MatchSummaryWithRoleListDto,
} from './match.dto.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MatchService } from './match.service.js';

@ApiTags('matches')
@Controller('matches')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MatchController {
    constructor(private readonly matchService: MatchService) {}

    @Post()
    @ApiOperation({
        summary: 'Create a private match',
        description:
            'Creates a private room in `LOBBY` status and returns its 6-character hex code. ' +
            'The caller becomes the host. Private rooms are never listed publicly - the host ' +
            'shares the code or the `/join/<code>` link. Every field is optional and falls ' +
            'back to the `MatchConfig` defaults; `visibility` is always forced to `private`. ' +
            'Rejected with `ERR_INVALID_CONFIG` when the chosen deck cannot cover the requested ' +
            'packs / cards per pack / attribute count, and with `ERR_GUEST_CANNOT_HOST` (403) ' +
            'for guest identities - guests play quick matches (`match:quick` socket event).',
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

    @Get('mine')
    @ApiOperation({
        summary: "The caller's private rooms",
        description:
            'Private rooms the caller hosts, newest first (up to 20). This is the only place ' +
            'a private match is ever listed.',
    })
    @ApiOkResponse({ type: MatchSummaryWithRoleListDto })
    async listMine(@CurrentUser() user: GuestJwtPayload): Promise<MatchSummaryWithRole[]> {
        return this.matchService.listMine(user.sub);
    }

    @Get('active')
    @ApiOperation({
        summary: "The caller's current match",
        description:
            'The lobby or in-progress match the caller is seated in, or `null` - lets the ' +
            'client offer "Continuar partida" after a reload or a closed tab.',
    })
    @ApiOkResponse({ type: MatchSummaryDto })
    async active(@CurrentUser() user: GuestJwtPayload): Promise<MatchSummary | null> {
        return this.matchService.findActive(user.sub);
    }

    @Get(':code')
    @ApiOperation({
        summary: 'Get a match by its join code',
        description:
            'Looks up an active (`LOBBY` or `IN_PROGRESS`) match by its 6-character code - ' +
            'what the join-by-code / share-link screen shows before connecting. ' +
            '`ERR_MATCH_NOT_FOUND` (404) otherwise.',
    })
    @ApiOkResponse({ type: MatchSummaryDto })
    async getByCode(@Param('code') code: string): Promise<MatchSummaryDto> {
        return this.matchService.getByCode(code);
    }
}
