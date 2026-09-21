import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MatchController } from './match.controller.js';
import { MatchService } from './match.service.js';

@Module({
    imports: [AuthModule],
    controllers: [MatchController],
    providers: [MatchService],
    exports: [MatchService],
})
export class MatchModule {}
