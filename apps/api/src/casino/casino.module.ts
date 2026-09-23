import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CasinoController } from './casino.controller.js';
import { CasinoGateway } from './casino.gateway.js';
import { CasinoRuntimeService } from './casino-runtime.service.js';

// `AuthModule` provides `JwtService` for the socket handshake; `PrismaModule` is global.
@Module({
    imports: [AuthModule],
    controllers: [CasinoController],
    providers: [CasinoGateway, CasinoRuntimeService],
})
export class CasinoModule {}
