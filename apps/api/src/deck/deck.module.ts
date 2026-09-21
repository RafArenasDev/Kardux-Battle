import { Module } from '@nestjs/common';
import { DeckController } from './deck.controller.js';
import { DeckService } from './deck.service.js';

@Module({
    controllers: [DeckController],
    providers: [DeckService],
    exports: [DeckService],
})
export class DeckModule {}
