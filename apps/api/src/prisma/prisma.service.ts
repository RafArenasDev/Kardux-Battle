import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper giving `PrismaClient` a Nest lifecycle: connects once at startup (so the first
 * real request isn't the one paying for the connection handshake) and disconnects cleanly on
 * shutdown. Every other module injects this instead of constructing its own `PrismaClient`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    async onModuleInit(): Promise<void> {
        await this.$connect();
        this.logger.log('Connected to the database.');
    }

    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
    }
}
