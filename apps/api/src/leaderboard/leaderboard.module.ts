import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LeaderboardController } from './leaderboard.controller.js';
import { LeaderboardService } from './leaderboard.service.js';

// `PrismaModule` is `@Global()` (see `prisma/prisma.module.ts`), so `PrismaService` is
// injectable here without importing it explicitly.
@Module({
    imports: [AuthModule],
    controllers: [LeaderboardController],
    providers: [LeaderboardService],
    exports: [LeaderboardService],
})
export class LeaderboardModule {}
