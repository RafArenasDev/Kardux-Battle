import type { RngState } from '@kardux/contracts';
import { createRngState } from '@kardux/engine';
import type { PlayingCard } from './cards.js';
import { buildShoe, draw, rankValue } from './cards.js';
import type { CasinoError, TableTier } from './common.js';
import { TABLE_TIERS } from './common.js';

/** Blackjack against the house: 1-5 seats, 6-deck shoe, dealer stands on all 17s, a natural
 *  pays 3:2, doubling on any first two cards and one split per round. */
export interface BlackjackConfig {
    tier: TableTier;
    minBet: number;
    maxBet: number;
    decks: number;
    maxSeats: number;
    /** Window to place bets once the first bet lands. */
    betWindowMs: number;
    /** Time to act on a hand before it stands automatically. */
    actionTimeoutMs: number;
}

export function blackjackConfig(tier: TableTier): BlackjackConfig {
    return {
        tier,
        minBet: TABLE_TIERS[tier].minBet,
        maxBet: TABLE_TIERS[tier].maxBet,
        decks: 6,
        maxSeats: 5,
        betWindowMs: 12_000,
        actionTimeoutMs: 20_000,
    };
}

export type BlackjackOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BlackjackHand {
    cards: PlayingCard[];
    bet: number;
    doubled: boolean;
    fromSplit: boolean;
    stood: boolean;
    outcome: BlackjackOutcome | null;
    /** Chips returned to the seat at settlement (stake included). */
    payout: number;
}

export interface BlackjackSeat {
    id: string;
    nickname: string;
    avatarSeed: string;
    chips: number;
    /** Bet placed for the next round (0 = sitting this round out). */
    pendingBet: number;
    hands: BlackjackHand[];
    activeHand: number;
}

export type BlackjackPhase = 'BETTING' | 'PLAYING' | 'SETTLED';

export interface BlackjackState {
    kind: 'blackjack';
    tableId: string;
    config: BlackjackConfig;
    phase: BlackjackPhase;
    version: number;
    rng: RngState;
    shoe: PlayingCard[];
    seats: BlackjackSeat[];
    dealer: PlayingCard[];
    turnSeatId: string | null;
    deadline: number | null;
    roundIndex: number;
}

export type BlackjackAction =
    | { type: 'join'; id: string; nickname: string; avatarSeed: string; chips: number }
    | { type: 'leave'; id: string }
    | { type: 'bet'; id: string; amount: number }
    | { type: 'hit'; id: string }
    | { type: 'stand'; id: string }
    | { type: 'double'; id: string }
    | { type: 'split'; id: string }
    | { type: 'tick' }
    | { type: 'nextRound' };

export type BlackjackEvent =
    | { type: 'dealt' }
    | { type: 'settled'; results: { seatId: string; net: number }[] }
    | { type: 'error'; code: CasinoError; message: string };

export interface BlackjackResult {
    state: BlackjackState;
    events: BlackjackEvent[];
}

/** Best total of a hand, counting aces as 11 while it doesn't bust. */
export function handValue(cards: readonly PlayingCard[]): { total: number; soft: boolean } {
    let total = 0;
    let aces = 0;
    for (const card of cards) {
        const value = rankValue(card.rank);
        if (value === 14) {
            aces += 1;
            total += 11;
        } else {
            total += Math.min(value, 10);
        }
    }
    while (total > 21 && aces > 0) {
        total -= 10;
        aces -= 1;
    }
    return { total, soft: aces > 0 };
}

export function isBlackjack(cards: readonly PlayingCard[]): boolean {
    return cards.length === 2 && handValue(cards).total === 21;
}

export function createBlackjackTable(
    tableId: string,
    tier: TableTier,
    seed: string,
): BlackjackState {
    const config = blackjackConfig(tier);
    const [shoe, rng] = buildShoe(config.decks, createRngState(seed));
    return {
        kind: 'blackjack',
        tableId,
        config,
        phase: 'BETTING',
        version: 0,
        rng,
        shoe,
        seats: [],
        dealer: [],
        turnSeatId: null,
        deadline: null,
        roundIndex: 0,
    };
}

function fail(state: BlackjackState, code: CasinoError, message: string): BlackjackResult {
    return { state, events: [{ type: 'error', code, message }] };
}

function bump(state: BlackjackState, patch: Partial<BlackjackState>): BlackjackState {
    return { ...state, ...patch, version: state.version + 1 };
}

function updateSeat(
    seats: BlackjackSeat[],
    id: string,
    update: (seat: BlackjackSeat) => BlackjackSeat,
): BlackjackSeat[] {
    return seats.map((seat) => (seat.id === id ? update(seat) : seat));
}

export function reduceBlackjack(
    state: BlackjackState,
    action: BlackjackAction,
    now: number,
): BlackjackResult {
    switch (action.type) {
        case 'join':
            return join(state, action);
        case 'leave':
            return leave(state, action.id, now);
        case 'bet':
            return bet(state, action.id, action.amount, now);
        case 'hit':
        case 'stand':
        case 'double':
        case 'split':
            return act(state, action.type, action.id, now);
        case 'tick':
            return tick(state, now);
        case 'nextRound':
            return nextRound(state);
    }
}

function join(
    state: BlackjackState,
    action: Extract<BlackjackAction, { type: 'join' }>,
): BlackjackResult {
    if (state.seats.some((seat) => seat.id === action.id)) {
        return { state, events: [] };
    }
    if (state.seats.length >= state.config.maxSeats) {
        return fail(state, 'TABLE_FULL', 'The table is full.');
    }
    const seat: BlackjackSeat = {
        id: action.id,
        nickname: action.nickname,
        avatarSeed: action.avatarSeed,
        chips: action.chips,
        pendingBet: 0,
        hands: [],
        activeHand: 0,
    };
    return { state: bump(state, { seats: [...state.seats, seat] }), events: [] };
}

function leave(state: BlackjackState, id: string, now: number): BlackjackResult {
    const seat = state.seats.find((candidate) => candidate.id === id);
    if (!seat) return { state, events: [] };

    // Leaving mid-hand forfeits the hands in play (their stake is already off the stack).
    let next = bump(state, { seats: state.seats.filter((candidate) => candidate.id !== id) });
    if (state.phase === 'PLAYING' && state.turnSeatId === id) {
        next = advance({ ...next, turnSeatId: id }, now, true);
    }
    return { state: next, events: [] };
}

function bet(state: BlackjackState, id: string, amount: number, now: number): BlackjackResult {
    if (state.phase !== 'BETTING') return fail(state, 'NOT_NOW', 'Bets are closed.');
    const seat = state.seats.find((candidate) => candidate.id === id);
    if (!seat) return fail(state, 'NOT_SEATED', 'Take a seat first.');
    if (amount !== 0 && (amount < state.config.minBet || amount > state.config.maxBet)) {
        return fail(
            state,
            'INVALID_BET',
            `Bets go from ${state.config.minBet} to ${state.config.maxBet}.`,
        );
    }
    if (amount > seat.chips) return fail(state, 'NOT_ENOUGH_CHIPS', 'Not enough chips.');

    const seats = updateSeat(state.seats, id, (current) => ({ ...current, pendingBet: amount }));
    const deadline = state.deadline ?? now + state.config.betWindowMs;
    const next = bump(state, { seats, deadline });

    // Everyone seated has bet: no need to wait for the window.
    if (seats.every((candidate) => candidate.pendingBet > 0)) return deal(next, now);
    return { state: next, events: [] };
}

function deal(state: BlackjackState, now: number): BlackjackResult {
    const betting = state.seats.filter((seat) => seat.pendingBet > 0);
    if (betting.length === 0) {
        return { state: bump(state, { deadline: null }), events: [] };
    }

    let shoe = state.shoe;
    let rng = state.rng;
    // Reshuffle a fresh shoe once less than a deck remains.
    if (shoe.length < 52 + betting.length * 6) {
        [shoe, rng] = buildShoe(state.config.decks, rng);
    }

    const hands = new Map<string, PlayingCard[]>(betting.map((seat) => [seat.id, []]));
    const dealer: PlayingCard[] = [];
    for (let round = 0; round < 2; round++) {
        for (const seat of betting) {
            const [card, rest] = draw(shoe);
            hands.get(seat.id)!.push(card[0]!);
            shoe = rest;
        }
        const [card, rest] = draw(shoe);
        dealer.push(card[0]!);
        shoe = rest;
    }

    const seats = state.seats.map((seat): BlackjackSeat => {
        if (seat.pendingBet === 0) return { ...seat, hands: [], activeHand: 0 };
        const cards = hands.get(seat.id)!;
        return {
            ...seat,
            chips: seat.chips - seat.pendingBet,
            hands: [
                {
                    cards,
                    bet: seat.pendingBet,
                    doubled: false,
                    fromSplit: false,
                    stood: isBlackjack(cards),
                    outcome: null,
                    payout: 0,
                },
            ],
            activeHand: 0,
        };
    });

    let next = bump(state, {
        phase: 'PLAYING',
        shoe,
        rng,
        seats,
        dealer,
        turnSeatId: null,
        deadline: null,
        roundIndex: state.roundIndex + 1,
    });

    // Dealer natural: the round ends at once (everyone without a natural loses).
    if (isBlackjack(dealer)) {
        const settled = settle(next);
        return { state: settled.state, events: [{ type: 'dealt' }, ...settled.events] };
    }

    next = findNextTurn(next, now);
    if (next.turnSeatId === null) {
        const settled = playDealerAndSettle(next);
        return { state: settled.state, events: [{ type: 'dealt' }, ...settled.events] };
    }
    return { state: next, events: [{ type: 'dealt' }] };
}

/** First seat (in order) with an unfinished hand; arms the action timer. */
function findNextTurn(state: BlackjackState, now: number): BlackjackState {
    for (const seat of state.seats) {
        const index = seat.hands.findIndex((hand) => !hand.stood);
        if (index >= 0) {
            return {
                ...state,
                seats: updateSeat(state.seats, seat.id, (current) => ({
                    ...current,
                    activeHand: index,
                })),
                turnSeatId: seat.id,
                deadline: now + state.config.actionTimeoutMs,
            };
        }
    }
    return { ...state, turnSeatId: null, deadline: null };
}

function act(
    state: BlackjackState,
    move: 'hit' | 'stand' | 'double' | 'split',
    id: string,
    now: number,
): BlackjackResult {
    if (state.phase !== 'PLAYING') return fail(state, 'NOT_NOW', 'No hand in play.');
    if (state.turnSeatId !== id) return fail(state, 'NOT_YOUR_TURN', 'Not your turn.');

    const seat = state.seats.find((candidate) => candidate.id === id)!;
    const hand = seat.hands[seat.activeHand]!;
    let shoe = state.shoe;
    let hands = [...seat.hands];
    let chips = seat.chips;

    const drawOne = (): PlayingCard => {
        const [card, rest] = draw(shoe);
        shoe = rest;
        return card[0]!;
    };

    if (move === 'hit') {
        const cards = [...hand.cards, drawOne()];
        const total = handValue(cards).total;
        hands[seat.activeHand] = { ...hand, cards, stood: total >= 21 };
    } else if (move === 'stand') {
        hands[seat.activeHand] = { ...hand, stood: true };
    } else if (move === 'double') {
        if (hand.cards.length !== 2) return fail(state, 'NOT_ALLOWED', 'Double only on two cards.');
        if (chips < hand.bet) return fail(state, 'NOT_ENOUGH_CHIPS', 'Not enough chips to double.');
        chips -= hand.bet;
        hands[seat.activeHand] = {
            ...hand,
            cards: [...hand.cards, drawOne()],
            bet: hand.bet * 2,
            doubled: true,
            stood: true,
        };
    } else {
        const [first, second] = hand.cards;
        const canSplit =
            hands.length === 1 &&
            hand.cards.length === 2 &&
            first &&
            second &&
            Math.min(rankValue(first.rank), 10) === Math.min(rankValue(second.rank), 10);
        if (!canSplit) return fail(state, 'NOT_ALLOWED', 'Only a first pair can be split.');
        if (chips < hand.bet) return fail(state, 'NOT_ENOUGH_CHIPS', 'Not enough chips to split.');
        chips -= hand.bet;
        const aces = first.rank === 'A';
        const makeHand = (card: PlayingCard): BlackjackHand => ({
            cards: [card, drawOne()],
            bet: hand.bet,
            doubled: false,
            fromSplit: true,
            // Split aces take exactly one card each.
            stood: aces,
            outcome: null,
            payout: 0,
        });
        hands = [makeHand(first), makeHand(second)];
        hands = hands.map((current) =>
            handValue(current.cards).total === 21 ? { ...current, stood: true } : current,
        );
    }

    const seats = updateSeat(state.seats, id, (current) => ({ ...current, hands, chips }));
    return { state: advance(bump(state, { seats, shoe }), now, false), events: [] };
}

/** Moves the turn on after a hand finished (or the seat left); plays the dealer at the end. */
function advance(state: BlackjackState, now: number, seatLeft: boolean): BlackjackState {
    const seat = state.seats.find((candidate) => candidate.id === state.turnSeatId);
    if (!seatLeft && seat && !seat.hands[seat.activeHand]?.stood) {
        return { ...state, deadline: now + state.config.actionTimeoutMs };
    }
    const next = findNextTurn(state, now);
    if (next.turnSeatId !== null) return next;
    return playDealerAndSettle(next).state;
}

function playDealerAndSettle(state: BlackjackState): BlackjackResult {
    const live = state.seats.some((seat) =>
        seat.hands.some((hand) => handValue(hand.cards).total <= 21 && !isBlackjack(hand.cards)),
    );
    let dealer = state.dealer;
    let shoe = state.shoe;
    // The house draws to 17 only when someone can still beat it.
    while (live && handValue(dealer).total < 17) {
        const [card, rest] = draw(shoe);
        dealer = [...dealer, card[0]!];
        shoe = rest;
    }
    return settle({ ...state, dealer, shoe });
}

function settle(state: BlackjackState): BlackjackResult {
    const dealerTotal = handValue(state.dealer).total;
    const dealerNatural = isBlackjack(state.dealer);
    const results: { seatId: string; net: number }[] = [];

    const seats = state.seats.map((seat) => {
        let chips = seat.chips;
        let staked = 0;
        const hands = seat.hands.map((hand): BlackjackHand => {
            staked += hand.bet;
            const total = handValue(hand.cards).total;
            const natural = isBlackjack(hand.cards) && !hand.fromSplit;
            let outcome: BlackjackOutcome;
            let payout: number;
            if (total > 21) {
                outcome = 'bust';
                payout = 0;
            } else if (natural && !dealerNatural) {
                outcome = 'blackjack';
                payout = Math.floor(hand.bet * 2.5);
            } else if (dealerNatural && !natural) {
                outcome = 'lose';
                payout = 0;
            } else if (dealerTotal > 21 || total > dealerTotal) {
                outcome = 'win';
                payout = hand.bet * 2;
            } else if (total === dealerTotal) {
                outcome = 'push';
                payout = hand.bet;
            } else {
                outcome = 'lose';
                payout = 0;
            }
            chips += payout;
            return { ...hand, stood: true, outcome, payout };
        });
        if (hands.length > 0) {
            results.push({
                seatId: seat.id,
                net: hands.reduce((sum, hand) => sum + hand.payout, 0) - staked,
            });
        }
        return { ...seat, chips, hands, pendingBet: 0 };
    });

    return {
        state: bump(state, { phase: 'SETTLED', seats, turnSeatId: null, deadline: null }),
        events: [{ type: 'settled', results }],
    };
}

function tick(state: BlackjackState, now: number): BlackjackResult {
    if (state.deadline === null || now < state.deadline) return { state, events: [] };
    if (state.phase === 'BETTING') return deal(state, now);
    if (state.phase === 'PLAYING' && state.turnSeatId) {
        return act(state, 'stand', state.turnSeatId, now);
    }
    return { state, events: [] };
}

function nextRound(state: BlackjackState): BlackjackResult {
    if (state.phase !== 'SETTLED') return { state, events: [] };
    return {
        state: bump(state, {
            phase: 'BETTING',
            dealer: [],
            seats: state.seats.map((seat) => ({
                ...seat,
                hands: [],
                activeHand: 0,
                pendingBet: 0,
            })),
            deadline: null,
        }),
        events: [],
    };
}

/** What a player may see: the dealer's hole card stays hidden until the dealer plays. */
export interface BlackjackView extends Omit<BlackjackState, 'shoe' | 'rng' | 'dealer'> {
    dealer: (PlayingCard | null)[];
    dealerTotal: number | null;
    shoeRemaining: number;
    yourId: string;
}

export function redactBlackjack(state: BlackjackState, viewerId: string): BlackjackView {
    const hidden = state.phase === 'PLAYING';
    const { shoe, rng: _rng, dealer, ...rest } = state;
    return {
        ...rest,
        dealer: hidden ? dealer.map((card, index) => (index === 1 ? null : card)) : dealer,
        dealerTotal: hidden ? null : dealer.length > 0 ? handValue(dealer).total : null,
        shoeRemaining: shoe.length,
        yourId: viewerId,
    };
}
