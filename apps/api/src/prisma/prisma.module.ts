import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** Global so `AuthModule`/`MatchModule`/`LeaderboardModule`/etc. can all inject
 *  `PrismaService` without each re-importing this module. */
@Global()
@Module({
    providers: [PrismaService],
    exports: [PrismaService],
})
export class PrismaModule {}
