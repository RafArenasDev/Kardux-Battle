import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DeckBuilder } from './deck-builder.service.js';
import { DeckController } from './deck.controller.js';
import { DeckService } from './deck.service.js';
import { GithubSyncClient } from './github-sync.client.js';

@Module({
    imports: [AuthModule],
    controllers: [DeckController],
    providers: [DeckService, DeckBuilder, GithubSyncClient],
    exports: [DeckService, DeckBuilder],
})
export class DeckModule {}
