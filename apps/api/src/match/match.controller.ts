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
    @ApiOperation({ summary: 'Create a private match' })
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
    @ApiOperation({ summary: "The caller's private rooms" })
    @ApiOkResponse({ type: MatchSummaryWithRoleListDto })
    async listMine(@CurrentUser() user: GuestJwtPayload): Promise<MatchSummaryWithRole[]> {
        return this.matchService.listMine(user.sub);
    }

    @Get('active')
    @ApiOperation({ summary: "The caller's current match" })
    @ApiOkResponse({ type: MatchSummaryDto })
    async active(@CurrentUser() user: GuestJwtPayload): Promise<MatchSummary | null> {
        return this.matchService.findActive(user.sub);
    }

    @Get(':code')
    @ApiOperation({ summary: 'Get a match by its join code' })
    @ApiOkResponse({ type: MatchSummaryDto })
    async getByCode(@Param('code') code: string): Promise<MatchSummaryDto> {
        return this.matchService.getByCode(code);
    }
}
