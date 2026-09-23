import type { Card, DeckSourceId, MatchConfig } from '@kardux/contracts';
import type { DeckEntity, DeckInfo } from '@kardux/content';
import {
    NAIPES_DECK,
    deckFamilies,
    getDeck,
    getDeckInfo,
    sharedAttributes,
    validateDeckConfig,
} from '@kardux/content';
import { createRngState, shuffle } from '@kardux/engine';
import { Injectable } from '@nestjs/common';
import { KarduxError } from '../common/kardux-error.js';
// Value import required: Nest's DI resolves constructor params via `design:paramtypes`
// reflection metadata, which `import type` erases at compile time.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CardPoolService } from './card-pool.service.js';

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

interface SourcedFamily {
    source: DeckSourceId;
    members: DeckEntity[];
}

/**
 * Builds the playable `Card[]` for a match. API-backed decks (Pokémon, poker) come from the
 * `CardPoolEntry` mirror (`CardPoolService`, synced once at boot); bundled decks from
 * `@kardux/content`. Nothing here touches the network.
 *
 * Quartets are real: every card sharing a letter comes from the same family (a Pokémon type,
 * a card rank, a creature kind). The seeded RNG picks which families play and which members of
 * each, so a match is fully reproducible from its seed.
 */
@Injectable()
export class DeckBuilder {
    constructor(private readonly cardPool: CardPoolService) {}

    async build(config: DeckBuildConfig, options: BuildDeckOptions): Promise<Card[]> {
        const problem = validateDeckConfig(config);
        if (problem) {
            throw new KarduxError('ERR_INVALID_CONFIG', problem);
        }

        const infos = config.deckSources
            .map((id) => getDeckInfo(id))
            .filter((info): info is DeckInfo => info !== undefined);
        const attributeKeys = sharedAttributes(infos)
            .slice(0, config.attributeCount)
            .map((attribute) => attribute.key);

        const families: SourcedFamily[] = [];
        for (const source of config.deckSources) {
            for (const members of await this.familiesFor(source)) {
                if (members.length >= config.packs) families.push({ source, members });
            }
        }

        if (families.length < config.cardsPerPack) {
            throw new KarduxError(
                'ERR_INVALID_CONFIG',
                families.length === 0
                    ? 'Este mazo todavía se está descargando. Intenta de nuevo en unos segundos.'
                    : `Solo hay ${families.length} familias con ${config.packs} cartas; baja las cartas por paquete.`,
            );
        }

        let rng = createRngState(`${options.seed}:deck`);
        const [chosenFamilies, afterFamilies] = shuffle(families, rng);
        rng = afterFamilies;

        const cards: Card[] = [];
        chosenFamilies.slice(0, config.cardsPerPack).forEach((family, letterIndex) => {
            const [members, afterMembers] = shuffle(family.members, rng);
            rng = afterMembers;

            members.slice(0, config.packs).forEach((entity, packIndex) => {
                const stats: Record<string, number> = {};
                for (const key of attributeKeys) stats[key] = entity.stats[key] ?? 0;

                cards.push({
                    code: `${packIndex + 1}${QUARTET_LETTERS[letterIndex]}`,
                    quartet: QUARTET_LETTERS[letterIndex]!,
                    name: entity.name,
                    imageUrl: entity.imageUrl,
                    source: family.source,
                    stats,
                });
            });
        });

        return cards;
    }

    private async familiesFor(source: DeckSourceId): Promise<DeckEntity[][]> {
        if (source === 'pokeapi') {
            return this.cardPool.getFamilies('pokeapi');
        }

        if (source === 'deckofcards') {
            const synced = await this.cardPool.getFamilies('deckofcards');
            // Offline fallback: the bundled French deck has the exact same attributes.
            return synced.length > 0 ? synced : deckFamilies(NAIPES_DECK);
        }

        const bundled = getDeck(source);
        return bundled ? deckFamilies(bundled) : [];
    }
}
