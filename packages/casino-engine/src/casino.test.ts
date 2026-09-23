import { describe, expect, it } from 'vitest';
import type { BlackjackState } from './blackjack.js';
import { createBlackjackTable, handValue, reduceBlackjack } from './blackjack.js';
import type { PlayingCard, Rank, Suit } from './cards.js';
import { makeCard } from './cards.js';
import { bestHand, compareHands, rankFive } from './hand-rank.js';
import type { HoldemState } from './holdem.js';
import { createHoldemTable, reduceHoldem, redactHoldem } from './holdem.js';

/** "AS KH 0D" -> cards. */
function cards(spec: string): PlayingCard[] {
    return spec.split(' ').map((code) => makeCard(code[0] as Rank, code[1] as Suit));
}

describe('poker hand ranking', () => {
    it('orders every category', () => {
        const order = [
            '2S 5H 9D JC KS', // high card
            '2S 2H 9D JC KS', // pair
            '2S 2H 9D 9C KS', // two pair
            '2S 2H 2D JC KS', // three of a kind
            'AS 2H 3D 4C 5S', // wheel straight
            '2H 5H 9H JH KH', // flush
            '2S 2H 2D KC KS', // full house
            '2S 2H 2D 2C KS', // four of a kind
            '5S 6S 7S 8S 9S', // straight flush
            '0S JS QS KS AS', // royal flush
        ].map((hand) => rankFive(cards(hand)));
        for (let i = 1; i < order.length; i++) {
            expect(compareHands(order[i]!, order[i - 1]!)).toBeGreaterThan(0);
        }
        expect(order[4]!.category).toBe('straight');
        expect(order[9]!.category).toBe('royal-flush');
    });

    it('uses the kicker and splits identical hands', () => {
        const aceKicker = rankFive(cards('QS QH AD 7C 3S'));
        const kingKicker = rankFive(cards('QD QC KD 7H 3H'));
        expect(compareHands(aceKicker, kingKicker)).toBeGreaterThan(0);

        const board = cards('AS KS QD 7H 2C');
        const a = bestHand([...cards('3D 4D'), ...board]);
        const b = bestHand([...cards('3C 4C'), ...board]);
        expect(compareHands(a, b)).toBe(0);
    });

    it('finds the best five of seven', () => {
        const rank = bestHand(cards('AH KH QH JH 2C 0H 3D'));
        expect(rank.category).toBe('royal-flush');
    });
});

describe('blackjack', () => {
    function seated(): BlackjackState {
        let state = createBlackjackTable('t1', 'bronze', 'seed');
        state = reduceBlackjack(
            state,
            { type: 'join', id: 'p1', nickname: 'P1', avatarSeed: 'a', chips: 1000 },
            0,
        ).state;
        return state;
    }

    function withShoe(state: BlackjackState, spec: string): BlackjackState {
        return { ...state, shoe: [...cards(spec), ...state.shoe] };
    }

    it('counts soft aces', () => {
        expect(handValue(cards('AS 6H'))).toEqual({ total: 17, soft: true });
        expect(handValue(cards('AS 6H 9D'))).toEqual({ total: 16, soft: false });
    });

    it('pays a natural 3:2', () => {
        // Deal order: player, dealer, player, dealer.
        const state = withShoe(seated(), 'AS 9H KD 7C');
        const result = reduceBlackjack(state, { type: 'bet', id: 'p1', amount: 100 }, 0);
        expect(result.state.phase).toBe('SETTLED');
        expect(result.state.seats[0]!.hands[0]!.outcome).toBe('blackjack');
        expect(result.state.seats[0]!.chips).toBe(1150);
    });

    it('doubles and lets the dealer draw to 17', () => {
        // Player 5+6=11, dealer 9+7=16, player doubles into a 10, dealer draws a 5 and busts... to 21.
        const state = withShoe(seated(), '5S 9H 6D 7C 0H 2D');
        const dealt = reduceBlackjack(state, { type: 'bet', id: 'p1', amount: 100 }, 0).state;
        expect(dealt.phase).toBe('PLAYING');
        const doubled = reduceBlackjack(dealt, { type: 'double', id: 'p1' }, 1).state;
        const hand = doubled.seats[0]!.hands[0]!;
        expect(hand.bet).toBe(200);
        expect(handValue(hand.cards).total).toBe(21);
        expect(handValue(doubled.dealer).total).toBeGreaterThanOrEqual(17);
        expect(hand.outcome).toBe('win');
        expect(doubled.seats[0]!.chips).toBe(1200);
    });

    it('rejects bets outside the table limits', () => {
        const result = reduceBlackjack(seated(), { type: 'bet', id: 'p1', amount: 5 }, 0);
        expect(result.events[0]).toMatchObject({ type: 'error', code: 'INVALID_BET' });
    });
});

describe("texas hold'em", () => {
    function table(players: [string, number][]): HoldemState {
        let state = createHoldemTable('h1', 'bronze', 'seed');
        for (const [id, buyIn] of players) {
            state = reduceHoldem(
                state,
                { type: 'join', id, nickname: id, avatarSeed: id, isBot: false, buyIn },
                0,
            ).state;
        }
        return reduceHoldem(state, { type: 'startHand' }, 0).state;
    }

    it('posts the blinds and hides other hole cards', () => {
        const state = table([
            ['a', 1000],
            ['b', 1000],
            ['c', 1000],
        ]);
        const blinds = state.seats.map((seat) => seat.streetBet).sort((x, y) => x - y);
        expect(blinds).toEqual([0, 5, 10]);
        const view = redactHoldem(state, 'a');
        expect(view.seats.find((seat) => seat.id === 'a')!.hole.every(Boolean)).toBe(true);
        expect(
            view.seats.find((seat) => seat.id === 'b')!.hole.every((card) => card === null),
        ).toBe(true);
        expect(view.pot).toBe(15);
    });

    it('awards the pot uncontested when everyone folds', () => {
        let state = table([
            ['a', 1000],
            ['b', 1000],
            ['c', 1000],
        ]);
        while (state.phase === 'PLAYING') {
            state = reduceHoldem(state, { type: 'fold', id: state.toActId! }, 1).state;
        }
        expect(state.phase).toBe('SHOWDOWN');
        expect(state.lastHand!.winners).toHaveLength(1);
        expect(state.lastHand!.revealed).toEqual({});
        expect(state.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(3000);
    });

    it('builds side pots when a short stack goes all-in', () => {
        let state = table([
            ['short', 100],
            ['b', 1000],
            ['c', 1000],
        ]);
        // Everyone commits everything: the short stack can only win its own pot.
        while (state.phase === 'PLAYING') {
            state = reduceHoldem(state, { type: 'allIn', id: state.toActId! }, 1).state;
        }
        expect(state.phase).toBe('SHOWDOWN');
        expect(state.board).toHaveLength(5);
        const total = state.seats.reduce((sum, seat) => sum + seat.stack, 0);
        expect(total).toBe(2100);
        const shortWin = state.lastHand!.winners.find((winner) => winner.id === 'short');
        if (shortWin) expect(shortWin.amount).toBeLessThanOrEqual(300);
    });
});
