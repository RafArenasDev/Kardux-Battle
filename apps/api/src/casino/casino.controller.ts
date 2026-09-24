import type { CasinoWallet, GuestJwtPayload } from '@kardux/contracts';
import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CasinoRuntimeService } from './casino-runtime.service.js';

/** Virtual chips (no real-money value). Table play itself runs over the `/casino` socket. */
@ApiTags('casino')
@Controller('casino')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CasinoController {
    constructor(private readonly runtime: CasinoRuntimeService) {}

    @Get('wallet')
    @ApiOperation({ summary: 'Chip balance' })
    @ApiOkResponse({ schema: { example: { coins: 5000, canRefill: false } } })
    wallet(@CurrentUser() user: GuestJwtPayload): Promise<CasinoWallet> {
        return this.runtime.wallet(user.sub);
    }

    @Post('wallet/refill')
    @HttpCode(200)
    @ApiOperation({ summary: 'Claim a free refill' })
    @ApiOkResponse({ schema: { example: { coins: 2150, canRefill: false } } })
    refill(@CurrentUser() user: GuestJwtPayload): Promise<CasinoWallet> {
        return this.runtime.refill(user.sub);
    }
}
