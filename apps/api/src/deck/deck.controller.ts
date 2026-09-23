import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DeckSourceListDto } from './deck.dto.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { DeckService } from './deck.service.js';

@ApiTags('decks')
@Controller('decks')
export class DeckController {
    constructor(private readonly deckService: DeckService) {}

    @Get('sources')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({
        summary: 'List available deck sources',
        description:
            'Every playable deck: original, copyright-free content bundled with the game ' +
            '(mythic creatures, real animal facts, the classic French deck). Each entry carries ' +
            'its attributes, a 4-card preview with generated vector art, and the pack / ' +
            'cards-per-pack limits the create-match form must respect.',
    })
    @ApiOkResponse({ type: DeckSourceListDto })
    listSources(): DeckSourceListDto {
        return this.deckService.listSources();
    }
}
