import type { DeckSourceDescriptor } from '@kardux/contracts';
import { DECKS, deckFamilies, deckLimits } from '@kardux/content';
import { Injectable } from '@nestjs/common';

/** The lobby's deck catalog, straight from `@kardux/content` - every deck is original and
 *  bundled with the app, so every entry is always `ready`. */
@Injectable()
export class DeckService {
    listSources(): DeckSourceDescriptor[] {
        return DECKS.map((deck) => {
            const families = deckFamilies(deck);
            const limits = deckLimits(deck);

            return {
                id: deck.id,
                label: deck.label,
                tagline: deck.tagline,
                description: deck.description,
                accent: deck.accent,
                attributes: deck.attributes.map(({ key, label, unit, higherIsBetter }) => ({
                    key,
                    label,
                    higherIsBetter,
                    ...(unit ? { unit } : {}),
                })),
                requiresApiKey: false,
                ready: true,
                cardCount: families.reduce((sum, members) => sum + members.length, 0),
                maxPacks: limits.maxPacks,
                maxCardsPerPack: limits.maxCardsPerPack,
                preview: families.slice(0, 4).map(([first]) => ({
                    name: first!.name,
                    imageUrl: first!.imageUrl,
                })),
            };
        });
    }
}
