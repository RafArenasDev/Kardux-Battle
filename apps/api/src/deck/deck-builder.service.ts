import type { Card, MatchConfig } from '@kardux/contracts';
import type { DeckDefinition, DeckEntity } from '@kardux/content';
import { getDeck, sharedAttributes, validateDeckConfig, deckFamilies } from '@kardux/content';
import { createRngState, shuffle } from '@kardux/engine';
import { Injectable } from '@nestjs/common';
import { KarduxError } from '../common/kardux-error.js';

/** A..Z - `cardsPerPack`'s schema max (26) is the alphabet's size, so a quartet letter never
 *  needs to wrap. */
const QUARTET_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

export interface BuildDeckOptions {
    seed: string;
}

type DeckBuildConfig = Pick<
    MatchConfig,
    'deckSources' | 'packs' | 'cardsPerPack' | 'attributeCount' | 'mixSources' | 'maxPlayers'
>;

/**
 * Builds the playable `Card[]` for a match from Kardux's own original decks
 * (`@kardux/content`: mythology, real animal facts, the public-domain French deck) - no
 * third-party characters or artwork, so nothing here can infringe copyright.
 *
 * Quartets are real: every card sharing a letter comes from the same family (CLAUDE.md rule
 * 1). The seeded RNG picks which `cardsPerPack` families play and which `packs` members of
 * each, so a match is fully reproducible from its seed. Pure and offline - no network calls.
 */
@Injectable()
export class DeckBuilder {
    build(config: DeckBuildConfig, options: BuildDeckOptions): Card[] {
        const problem = validateDeckConfig(config);
        if (problem) {
            throw new KarduxError('ERR_INVALID_CONFIG', problem);
        }

        const decks = config.deckSources
            .map((id) => getDeck(id))
            .filter((deck): deck is DeckDefinition => deck !== undefined);
        const attributeKeys = sharedAttributes(decks)
            .slice(0, config.attributeCount)
            .map((attribute) => attribute.key);

        const families: { deck: DeckDefinition; members: DeckEntity[] }[] = decks.flatMap(
            (deck) => deckFamilies(deck).map((members) => ({ deck, members })),
        );

        let rng = createRngState(`${options.seed}:deck`);
        const [chosenFamilies, afterFamilies] = shuffle(families, rng);
        rng = afterFamilies;

        const cards: Card[] = [];
        chosenFamilies.slice(0, config.cardsPerPack).forEach((family, letterIndex) => {
            const [members, afterMembers] = shuffle(family.members, rng);
            rng = afterMembers;

            members.slice(0, config.packs).forEach((entity, packIndex) => {
                const stats: Record<string, number> = {};
                for (const key of attributeKeys) stats[key] = entity.stats[key]!;

                cards.push({
                    code: `${packIndex + 1}${QUARTET_LETTERS[letterIndex]}`,
                    quartet: QUARTET_LETTERS[letterIndex]!,
                    name: entity.name,
                    imageUrl: entity.imageUrl,
                    source: family.deck.id,
                    stats,
                });
            });
        });

        return cards;
    }
}
