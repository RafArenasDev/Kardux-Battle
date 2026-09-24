import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DeckModule } from '../deck/deck.module.js';
import { LeaderboardModule } from '../leaderboard/leaderboard.module.js';
import { MatchModule } from '../match/match.module.js';
import { GameGateway } from './game.gateway.js';
import { MatchLifecycleController } from './match-lifecycle.controller.js';
import { GameService } from './game.service.js';
import { MatchRuntimeService } from './match-runtime.service.js';

// `PrismaModule` is `@Global()` (see `prisma/prisma.module.ts`), so `PrismaService` is
// injectable here without importing it explicitly. `AuthModule` is imported for its exported
// `JwtModule` (`JwtService`) - the same guest JWT signing secret/verification `JwtAuthGuard`
// already uses for REST is reused by `GameGateway` to validate the Socket.IO handshake.
// `DeckModule` is imported for its exported `DeckBuilder` - `MatchRuntimeService` builds the
// real deck a match is dealt from it.
@Module({
    imports: [AuthModule, DeckModule, LeaderboardModule, MatchModule],
    controllers: [MatchLifecycleController],
    providers: [GameGateway, GameService, MatchRuntimeService],
    exports: [GameService, MatchRuntimeService],
})
export class GameModule {}
