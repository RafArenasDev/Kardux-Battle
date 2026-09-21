import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
    @ApiOperation({
        summary: 'List available deck sources',
        description:
            'Returns the static catalog of deck sources a match can be configured with ' +
            "(CLAUDE.md's `MatchConfig.deckSources`), each with its label, comparable " +
            'attributes, whether it needs an API key, and whether it can actually build a ' +
            "deck today (`ready`). This is metadata only - it never calls a source's " +
            'external API; only `local` is `ready: true` right now, the rest are reserved ' +
            'identifiers for providers landing in a later phase. No authentication required.',
    })
    @ApiOkResponse({ type: DeckSourceListDto })
    listSources(): DeckSourceListDto {
        return this.deckService.listSources();
    }
}
