import type { GuestJwtPayload } from '@kardux/contracts';
import { Controller, Delete, HttpCode, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { KarduxError } from '../common/kardux-error.js';
// Value imports required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { GameService } from './game.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { MatchRuntimeService } from './match-runtime.service.js';

/** Lives in `GameModule` (not `MatchModule`) because ending a match has to reach the live
 *  runtime: close the socket room, stop its timers and drop its Redis snapshot. */
@ApiTags('matches')
@Controller('matches')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MatchLifecycleController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly gameService: GameService,
        private readonly runtime: MatchRuntimeService,
    ) {}

    @Delete(':matchId')
    @HttpCode(204)
    @ApiOperation({ summary: 'Delete or leave a match' })
    @ApiNoContentResponse()
    async remove(
        @CurrentUser() user: GuestJwtPayload,
        @Param('matchId') matchId: string,
    ): Promise<void> {
        const match = await this.prisma.match.findUnique({ where: { id: matchId } });
        if (!match) throw new KarduxError('ERR_MATCH_NOT_FOUND');

        if (match.hostId === user.sub) {
            this.runtime.closeRoom(matchId);
            await this.runtime.dispose(matchId);
            await this.prisma.match.delete({ where: { id: matchId } });
            return;
        }

        const seated = await this.prisma.matchPlayer.findUnique({
            where: { matchId_userId: { matchId, userId: user.sub } },
        });
        if (!seated) throw new KarduxError('ERR_MATCH_NOT_FOUND');

        await this.runtime.playerLeave(matchId, `${user.sub}:${user.tabId}`);
        await this.gameService.leave(matchId, user.sub);
    }
}
