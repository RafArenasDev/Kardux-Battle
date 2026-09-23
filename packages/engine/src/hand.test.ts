import { describe, expect, it } from 'vitest';
import { redactFor } from './redact.js';
import { reduce } from './reduce.js';
import { card, config, state } from './test-helpers.js';

/** Hand matches (the classic deck): players choose which of their first `handSize` cards to
 *  play; the only attribute is the rank, and equal ranks tie. */
function handMatch() {
    return state({
        config: config({ handSize: 3, attributeCount: 1, deckSources: ['deckofcards'] }),
        phase: 'AWAITING_CARDS',
        piles: {
            a: [
                card('1A', 'A', { valor: 5 }),
                card('2A', 'A', { valor: 14 }),
                card('3A', 'A', { valor: 9 }),
                card('4A', 'A', { valor: 2 }),
            ],
            b: [
                card('1B', 'B', { valor: 13 }),
                card('2B', 'B', { valor: 3 }),
                card('3B', 'B', { valor: 14 }),
            ],
        },
        round: {
            index: 0,
            leaderId: 'a',
            attribute: 'valor',
            playOrder: ['a', 'b'],
            playedCards: {},
        },
    });
}

describe('hand matches', () => {
    it('only shows the recipient their own hand', () => {
        const view = redactFor('a', handMatch());
        expect(view.yourHand.map((c) => c.code)).toEqual(['1A', '2A', '3A']);
    });

    it('plays the chosen card instead of the top card', () => {
        const result = reduce(
            handMatch(),
            { type: 'round.playCard', playerId: 'a', cardCode: '2A' },
            { now: 0 },
        );
        expect(result.state.round?.playedCards.a?.code).toBe('2A');
        expect(result.state.piles.a?.map((c) => c.code)).toEqual(['1A', '3A', '4A']);
    });

    it('rejects a card outside the hand', () => {
        const result = reduce(
            handMatch(),
            { type: 'round.playCard', playerId: 'a', cardCode: '4A' },
            { now: 0 },
        );
        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_VALIDATION' });
    });

    it('lets the higher rank win and equal ranks tie', () => {
        let current = reduce(
            handMatch(),
            { type: 'round.playCard', playerId: 'a', cardCode: '2A' },
            { now: 0 },
        ).state;
        const tie = reduce(
            current,
            { type: 'round.playCard', playerId: 'b', cardCode: '3B' },
            { now: 0 },
        );
        expect(tie.events.some((event) => event.type === 'round.tie')).toBe(true);

        current = reduce(
            handMatch(),
            { type: 'round.playCard', playerId: 'a', cardCode: '2A' },
            { now: 0 },
        ).state;
        const win = reduce(
            current,
            { type: 'round.playCard', playerId: 'b', cardCode: '1B' },
            { now: 0 },
        );
        const resolved = win.events.find((event) => event.type === 'round.resolved');
        expect(resolved?.type === 'round.resolved' && resolved.result.winnerId).toBe('a');
    });
});
