import type { DeckSourceDescriptor } from '@kardux/contracts';
import type { DeckEntity, DeckInfo } from '@kardux/content';
import { DECK_CATALOG, NAIPES_DECK, deckFamilies, getDeck } from '@kardux/content';
import { Injectable } from '@nestjs/common';
import { disabledDeckIds } from '../config/app-config.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CardPoolService } from './card-pool.service.js';

/** The lobby's deck catalog: API-backed decks report `ready` once their pool is synced;
 *  bundled decks are always ready. */
@Injectable()
export class DeckService {
    constructor(private readonly cardPool: CardPoolService) {}

    async listSources(): Promise<DeckSourceDescriptor[]> {
        const disabled = disabledDeckIds();
        return Promise.all(
            DECK_CATALOG.filter((info) => !disabled.has(info.id)).map((info) =>
                this.describe(info),
            ),
        );
    }

    private async describe(info: DeckInfo): Promise<DeckSourceDescriptor> {
        const families = await this.familiesOf(info);
        const cardCount = families.reduce((sum, members) => sum + members.length, 0);

        return {
            id: info.id,
            label: info.label,
            tagline: info.tagline,
            description: info.description,
            credits: info.credits ?? null,
            autoCompare: info.autoCompare,
            accent: info.accent,
            attributes: info.attributes.map(({ key, label, unit, higherIsBetter }) => ({
                key,
                label,
                higherIsBetter,
                ...(unit ? { unit } : {}),
            })),
            requiresApiKey: false,
            ready: cardCount > 0,
            cardCount,
            maxPacks: info.limits.maxPacks,
            maxCardsPerPack: info.limits.maxCardsPerPack,
            preview: this.pickPreview(families),
        };
    }

    private async familiesOf(info: DeckInfo): Promise<DeckEntity[][]> {
        if (info.id === 'pokeapi' || info.id === 'paises') {
            return this.cardPool.getFamilies(info.id);
        }
        if (info.id === 'deckofcards') {
            const synced = await this.cardPool.getFamilies('deckofcards');
            return synced.length > 0 ? synced : deckFamilies(NAIPES_DECK);
        }
        const deck = getDeck(info.id);
        return deck ? deckFamilies(deck) : [];
    }

    /** One card from each of the first four families - a varied, stable sample. */
    private pickPreview(families: DeckEntity[][]): DeckSourceDescriptor['preview'] {
        return families
            .slice(0, 4)
            .map((members) => members[Math.floor(members.length / 2)] ?? members[0])
            .filter((entity): entity is DeckEntity => entity !== undefined)
            .map((entity) => ({ name: entity.name, imageUrl: entity.imageUrl }));
    }
}
