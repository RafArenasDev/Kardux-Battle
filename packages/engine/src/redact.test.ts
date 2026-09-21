import { describe, expect, it } from 'vitest';
import { redactFor } from './redact.js';
import { card, player, state } from './test-helpers.js';

describe('redactFor', () => {
    it("only exposes the viewer's own top card", () => {
        const aliceCard = card('1A', 'A', { power: 10 });
        const bobCard = card('1B', 'B', { power: 20 });
        const full = state({
            phase: 'AWAITING_ATTRIBUTE',
            piles: { alice: [aliceCard], bob: [bobCard] },
        });

        const redactedForAlice = redactFor('alice', full);
        const redactedForBob = redactFor('bob', full);

        expect(redactedForAlice.yourTopCard).toEqual(aliceCard);
        expect(redactedForBob.yourTopCard).toEqual(bobCard);
        expect(JSON.stringify(redactedForAlice)).not.toContain('1B');
        expect(JSON.stringify(redactedForBob)).not.toContain('1A');
    });

    it('never leaks the piles field itself', () => {
        const full = state({
            piles: { alice: [card('1A', 'A', { power: 1 })] },
        });

        const redacted = redactFor('alice', full);

        expect(redacted).not.toHaveProperty('piles');
    });

    it('reports null for a spectator with no cards', () => {
        const full = state({
            players: [player('alice', { isSpectator: true, cardCount: 0 })],
            piles: { alice: [] },
        });

        expect(redactFor('alice', full).yourTopCard).toBeNull();
    });

    it("reports potSize (a count) but never the pot's actual cards", () => {
        const full = state({
            pot: [card('1A', 'A', { power: 1 }), card('2A', 'A', { power: 2 })],
            piles: { alice: [card('3A', 'A', { power: 3 })] },
        });

        const redacted = redactFor('alice', full);

        expect(redacted.potSize).toBe(2);
        expect(redacted).not.toHaveProperty('pot');
    });

    it('shows who has played this round but not their cards while the round is unresolved', () => {
        const full = state({
            phase: 'AWAITING_CARDS',
            piles: { alice: [card('1A', 'A', { power: 1 })], bob: [card('1B', 'B', { power: 9 })] },
            round: {
                index: 0,
                leaderId: 'alice',
                attribute: 'power',
                playOrder: ['alice', 'bob'],
                playedCards: { alice: card('0A', 'A', { power: 5 }) },
            },
        });

        const redacted = redactFor('bob', full);

        expect(redacted.round?.playedBy).toEqual(['alice']);
        expect(redacted.round?.revealedCards).toEqual({});
    });
});
