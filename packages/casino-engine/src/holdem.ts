import type { RngState } from '@kardux/contracts';
import { createRngState } from '@kardux/engine';
import type { PlayingCard } from './cards.js';
import { buildShoe, draw, rankValue } from './cards.js';
import type { CasinoError, TableTier } from './common.js';
import { TABLE_TIERS } from './common.js';
import type { HandCategory, HandRank } from './hand-rank.js';
import { bestHand, compareHands } from './hand-rank.js';

/** No-limit Texas Hold'em: blinds, pre-flop / flop / turn / river betting, side pots and split
 *  pots, win uncontested without showing or at showdown with the best five of seven cards. */
export interface HoldemConfig {
    tier: TableTier;
    smallBlind: number;
    bigBlind: number;
    minBuyIn: number;
    maxBuyIn: number;
    maxSeats: number;
    actionTimeoutMs: number;
}

export function holdemConfig(tier: TableTier): HoldemConfig {
    const stakes = TABLE_TIERS[tier];
    return {
        tier,
        smallBlind: stakes.smallBlind,
        bigBlind: stakes.bigBlind,
        minBuyIn: stakes.minBuyIn,
        maxBuyIn: stakes.maxBuyIn,
        maxSeats: 6,
        actionTimeoutMs: 20_000,
    };
}

export type HoldemStreet = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER';
export type HoldemPhase = 'WAITING' | 'PLAYING' | 'SHOWDOWN';
export type HoldemMove = 'fold' | 'check' | 'call' | 'raise' | 'allIn' | 'blind';

export interface HoldemSeat {
    id: string;
    nickname: string;
    avatarSeed: string;
    isBot: boolean;
    stack: number;
    hole: PlayingCard[];
    /** Chips put in during the current street. */
    streetBet: number;
    /** Chips put in during the whole hand (drives side pots). */
    handBet: number;
    inHand: boolean;
    folded: boolean;
    allIn: boolean;
    acted: boolean;
    lastAction: HoldemMove | null;
}

export interface HoldemWinner {
    id: string;
    amount: number;
    category: HandCategory | null;
}

export interface HoldemHandResult {
    winners: HoldemWinner[];
    /** Hole cards shown at showdown (empty when the hand was won uncontested). */
    revealed: Record<string, PlayingCard[]>;
    bestCards: Record<string, PlayingCard[]>;
    pot: number;
}

export interface HoldemState {
    kind: 'holdem';
    tableId: string;
    config: HoldemConfig;
    phase: HoldemPhase;
    street: HoldemStreet | null;
    version: number;
    rng: RngState;
    deck: PlayingCard[];
    board: PlayingCard[];
    seats: HoldemSeat[];
    dealerIndex: number;
    toActId: string | null;
    currentBet: number;
    minRaise: number;
    deadline: number | null;
    handIndex: number;
    lastHand: HoldemHandResult | null;
}

export type HoldemAction =
    | {
          type: 'join';
          id: string;
          nickname: string;
          avatarSeed: string;
          isBot: boolean;
          buyIn: number;
      }
    | { type: 'leave'; id: string }
    | { type: 'startHand' }
    | { type: 'fold'; id: string }
    | { type: 'check'; id: string }
    | { type: 'call'; id: string }
    | { type: 'raise'; id: string; to: number }
    | { type: 'allIn'; id: string }
    | { type: 'tick' };

export type HoldemEvent =
    | { type: 'handStarted' }
    | { type: 'street'; street: HoldemStreet }
    | { type: 'handEnded'; result: HoldemHandResult }
    | { type: 'error'; code: CasinoError; message: string };

export interface HoldemResult {
    state: HoldemState;
    events: HoldemEvent[];
}

export function createHoldemTable(tableId: string, tier: TableTier, seed: string): HoldemState {
    return {
        kind: 'holdem',
        tableId,
        config: holdemConfig(tier),
        phase: 'WAITING',
        street: null,
        version: 0,
        rng: createRngState(seed),
        deck: [],
        board: [],
        seats: [],
        dealerIndex: -1,
        toActId: null,
        currentBet: 0,
        minRaise: 0,
        deadline: null,
        handIndex: 0,
        lastHand: null,
    };
}

function fail(state: HoldemState, code: CasinoError, message: string): HoldemResult {
    return { state, events: [{ type: 'error', code, message }] };
}

function bump(state: HoldemState, patch: Partial<HoldemState>): HoldemState {
    return { ...state, ...patch, version: state.version + 1 };
}

/** Seats that can still win the pot. */
function contenders(state: HoldemState): HoldemSeat[] {
    return state.seats.filter((seat) => seat.inHand && !seat.folded);
}

/** Next seat index after `from` (clockwise) matching `predicate`, or -1. */
function nextIndex(
    state: HoldemState,
    from: number,
    predicate: (seat: HoldemSeat) => boolean,
): number {
    const n = state.seats.length;
    for (let step = 1; step <= n; step++) {
        const index = (from + step) % n;
        if (predicate(state.seats[index]!)) return index;
    }
    return -1;
}

const canAct = (seat: HoldemSeat): boolean => seat.inHand && !seat.folded && !seat.allIn;

export function reduceHoldem(state: HoldemState, action: HoldemAction, now: number): HoldemResult {
    switch (action.type) {
        case 'join':
            return join(state, action);
        case 'leave':
            return leave(state, action.id, now);
        case 'startHand':
            return startHand(state, now);
        case 'fold':
        case 'check':
        case 'call':
        case 'allIn':
            return act(state, action.id, action.type, 0, now);
        case 'raise':
            return act(state, action.id, 'raise', action.to, now);
        case 'tick':
            return tick(state, now);
    }
}

function join(state: HoldemState, action: Extract<HoldemAction, { type: 'join' }>): HoldemResult {
    if (state.seats.some((seat) => seat.id === action.id)) return { state, events: [] };
    if (state.seats.length >= state.config.maxSeats) {
        return fail(state, 'TABLE_FULL', 'The table is full.');
    }
    const seat: HoldemSeat = {
        id: action.id,
        nickname: action.nickname,
        avatarSeed: action.avatarSeed,
        isBot: action.isBot,
        stack: action.buyIn,
        hole: [],
        streetBet: 0,
        handBet: 0,
        inHand: false,
        folded: false,
        allIn: false,
        acted: false,
        lastAction: null,
    };
    return { state: bump(state, { seats: [...state.seats, seat] }), events: [] };
}

function leave(state: HoldemState, id: string, now: number): HoldemResult {
    const index = state.seats.findIndex((seat) => seat.id === id);
    if (index < 0) return { state, events: [] };
    const seat = state.seats[index]!;

    // Leaving during a hand folds it first; chips already in the pot stay there.
    if (state.phase === 'PLAYING' && seat.inHand && !seat.folded) {
        const folded = act({ ...state, toActId: id }, id, 'fold', 0, now, true);
        return leave(folded.state, id, now);
    }

    const seats = state.seats.filter((candidate) => candidate.id !== id);
    const dealerIndex = index <= state.dealerIndex ? state.dealerIndex - 1 : state.dealerIndex;
    return { state: bump(state, { seats, dealerIndex }), events: [] };
}

function startHand(state: HoldemState, now: number): HoldemResult {
    if (state.phase === 'PLAYING') return { state, events: [] };
    const funded = state.seats.filter((seat) => seat.stack > 0);
    if (funded.length < 2) {
        return { state: bump(state, { phase: 'WAITING', street: null }), events: [] };
    }

    let [deck, rng] = buildShoe(1, state.rng);
    let seats = state.seats.map((seat): HoldemSeat => ({
        ...seat,
        hole: [],
        streetBet: 0,
        handBet: 0,
        inHand: seat.stack > 0,
        folded: false,
        allIn: false,
        acted: false,
        lastAction: null,
    }));
    let next: HoldemState = { ...state, seats };

    const dealerIndex = nextIndex(next, state.dealerIndex, (seat) => seat.inHand);
    const headsUp = funded.length === 2;
    const sbIndex = headsUp ? dealerIndex : nextIndex(next, dealerIndex, (seat) => seat.inHand);
    const bbIndex = nextIndex(next, sbIndex, (seat) => seat.inHand);

    // Two hole cards each, one at a time starting left of the dealer.
    for (let round = 0; round < 2; round++) {
        let index = dealerIndex;
        for (let dealt = 0; dealt < funded.length; dealt++) {
            index = nextIndex(next, index, (seat) => seat.inHand);
            const [card, rest] = draw(deck);
            deck = rest;
            seats = seats.map((seat, i) =>
                i === index ? { ...seat, hole: [...seat.hole, card[0]!] } : seat,
            );
            next = { ...next, seats };
        }
    }

    const post = (index: number, amount: number): void => {
        seats = seats.map((seat, i) => {
            if (i !== index) return seat;
            const paid = Math.min(amount, seat.stack);
            return {
                ...seat,
                stack: seat.stack - paid,
                streetBet: paid,
                handBet: paid,
                allIn: seat.stack - paid === 0,
                lastAction: 'blind',
            };
        });
    };
    post(sbIndex, state.config.smallBlind);
    post(bbIndex, state.config.bigBlind);
    next = { ...next, seats };

    const firstToAct = nextIndex(next, bbIndex, canAct);
    next = bump(next, {
        phase: 'PLAYING',
        street: 'PREFLOP',
        rng,
        deck,
        board: [],
        dealerIndex,
        currentBet: state.config.bigBlind,
        minRaise: state.config.bigBlind,
        toActId: firstToAct >= 0 ? seats[firstToAct]!.id : null,
        deadline: now + state.config.actionTimeoutMs,
        handIndex: state.handIndex + 1,
        lastHand: null,
    });

    const settled = afterAction(next, now);
    return { state: settled.state, events: [{ type: 'handStarted' }, ...settled.events] };
}

function act(
    state: HoldemState,
    id: string,
    move: Exclude<HoldemMove, 'blind'>,
    raiseTo: number,
    now: number,
    force = false,
): HoldemResult {
    if (state.phase !== 'PLAYING') return fail(state, 'NOT_NOW', 'No hand in play.');
    if (!force && state.toActId !== id) return fail(state, 'NOT_YOUR_TURN', 'Not your turn.');

    const seat = state.seats.find((candidate) => candidate.id === id);
    if (!seat || !seat.inHand || seat.folded)
        return fail(state, 'NOT_SEATED', 'You are not in this hand.');

    const toCall = state.currentBet - seat.streetBet;
    let { currentBet, minRaise } = state;
    let reopen = false;
    let updated: HoldemSeat = { ...seat, acted: true, lastAction: move };

    const put = (amount: number): void => {
        const paid = Math.min(amount, updated.stack);
        updated = {
            ...updated,
            stack: updated.stack - paid,
            streetBet: updated.streetBet + paid,
            handBet: updated.handBet + paid,
            allIn: updated.stack - paid === 0,
        };
    };

    switch (move) {
        case 'fold':
            updated = { ...updated, folded: true };
            break;
        case 'check':
            if (toCall > 0) return fail(state, 'NOT_ALLOWED', 'You must call, raise or fold.');
            break;
        case 'call':
            if (toCall <= 0) return fail(state, 'NOT_ALLOWED', 'Nothing to call - check instead.');
            put(toCall);
            break;
        case 'raise': {
            const required = state.currentBet + state.minRaise;
            if (raiseTo < required)
                return fail(state, 'INVALID_BET', `Raise to at least ${required}.`);
            if (raiseTo - seat.streetBet > seat.stack) {
                return fail(state, 'NOT_ENOUGH_CHIPS', 'Not enough chips - go all-in instead.');
            }
            put(raiseTo - seat.streetBet);
            minRaise = raiseTo - state.currentBet;
            currentBet = raiseTo;
            reopen = true;
            break;
        }
        case 'allIn': {
            put(seat.stack);
            if (updated.streetBet > state.currentBet) {
                const raisedBy = updated.streetBet - state.currentBet;
                if (raisedBy >= state.minRaise) minRaise = raisedBy;
                currentBet = updated.streetBet;
                reopen = true;
            }
            break;
        }
    }

    const seats = state.seats.map((candidate) => {
        if (candidate.id === id) return updated;
        // A raise gives everyone still able to act another decision.
        return reopen && canAct(candidate) ? { ...candidate, acted: false } : candidate;
    });

    return afterAction(bump(state, { seats, currentBet, minRaise }), now);
}

/** Decides what happens after any action: uncontested win, next street, or next player. */
function afterAction(state: HoldemState, now: number): HoldemResult {
    const alive = contenders(state);
    if (alive.length === 1) return awardUncontested(state, alive[0]!);

    const actors = state.seats.filter(canAct);
    const roundDone = actors.every((seat) => seat.acted && seat.streetBet === state.currentBet);
    const onlyOneCanBet =
        actors.length <= 1 && actors.every((seat) => seat.streetBet >= state.currentBet);

    if (roundDone || onlyOneCanBet) return nextStreet(state, now);

    const fromIndex = state.seats.findIndex((seat) => seat.id === state.toActId);
    const index = nextIndex(
        state,
        fromIndex,
        (seat) => canAct(seat) && (!seat.acted || seat.streetBet < state.currentBet),
    );
    return {
        state: {
            ...state,
            toActId: index >= 0 ? state.seats[index]!.id : null,
            deadline: now + state.config.actionTimeoutMs,
        },
        events: [],
    };
}

function nextStreet(state: HoldemState, now: number): HoldemResult {
    const events: HoldemEvent[] = [];
    let current: HoldemState = state;

    // With at most one player able to bet, deal the rest of the board straight to showdown.
    do {
        if (current.street === 'RIVER') return showdown(current, events);

        let deck = current.deck.slice(1); // burn
        const count = current.street === 'PREFLOP' ? 3 : 1;
        const [cards, rest] = draw(deck, count);
        deck = rest;
        const street: HoldemStreet =
            current.street === 'PREFLOP' ? 'FLOP' : current.street === 'FLOP' ? 'TURN' : 'RIVER';
        events.push({ type: 'street', street });

        current = bump(current, {
            deck,
            board: [...current.board, ...cards],
            street,
            currentBet: 0,
            minRaise: current.config.bigBlind,
            seats: current.seats.map((seat) => ({
                ...seat,
                streetBet: 0,
                acted: false,
                lastAction: seat.folded ? seat.lastAction : null,
            })),
        });
    } while (current.seats.filter(canAct).length <= 1);

    const first = nextIndex(current, current.dealerIndex, canAct);
    return {
        state: {
            ...current,
            toActId: first >= 0 ? current.seats[first]!.id : null,
            deadline: now + current.config.actionTimeoutMs,
        },
        events,
    };
}

function awardUncontested(state: HoldemState, winner: HoldemSeat): HoldemResult {
    const pot = state.seats.reduce((sum, seat) => sum + seat.handBet, 0);
    const result: HoldemHandResult = {
        winners: [{ id: winner.id, amount: pot, category: null }],
        revealed: {},
        bestCards: {},
        pot,
    };
    return finishHand(state, result, [], { [winner.id]: pot });
}

/** Side pots built from each player's total contribution; each pot split between the best
 *  eligible hands (odd chips go to the first winner left of the dealer). */
function showdown(state: HoldemState, events: HoldemEvent[]): HoldemResult {
    const alive = contenders(state);
    const ranks = new Map<string, HandRank>(
        alive.map((seat) => [seat.id, bestHand([...seat.hole, ...state.board])]),
    );
    const levels = [
        ...new Set(state.seats.filter((seat) => seat.handBet > 0).map((seat) => seat.handBet)),
    ].sort((a, b) => a - b);

    const payouts: Record<string, number> = {};
    let previous = 0;
    for (const level of levels) {
        const amount = state.seats.reduce(
            (sum, seat) => sum + Math.max(0, Math.min(seat.handBet, level) - previous),
            0,
        );
        previous = level;
        const eligible = alive.filter((seat) => seat.handBet >= level);
        if (eligible.length === 0 || amount === 0) continue;

        let best: HoldemSeat[] = [];
        for (const seat of eligible) {
            const cmp =
                best.length === 0 ? 1 : compareHands(ranks.get(seat.id)!, ranks.get(best[0]!.id)!);
            if (cmp > 0) best = [seat];
            else if (cmp === 0) best.push(seat);
        }
        const share = Math.floor(amount / best.length);
        best.forEach((seat, index) => {
            payouts[seat.id] =
                (payouts[seat.id] ?? 0) + share + (index === 0 ? amount - share * best.length : 0);
        });
    }

    const pot = state.seats.reduce((sum, seat) => sum + seat.handBet, 0);
    const result: HoldemHandResult = {
        winners: Object.entries(payouts).map(([id, amount]) => ({
            id,
            amount,
            category: ranks.get(id)?.category ?? null,
        })),
        revealed: Object.fromEntries(alive.map((seat) => [seat.id, seat.hole])),
        bestCards: Object.fromEntries([...ranks.entries()].map(([id, rank]) => [id, rank.cards])),
        pot,
    };
    return finishHand(state, result, events, payouts);
}

function finishHand(
    state: HoldemState,
    result: HoldemHandResult,
    events: HoldemEvent[],
    payouts: Record<string, number>,
): HoldemResult {
    const seats = state.seats.map((seat) => ({
        ...seat,
        stack: seat.stack + (payouts[seat.id] ?? 0),
        streetBet: 0,
    }));
    return {
        state: bump(state, {
            phase: 'SHOWDOWN',
            seats,
            toActId: null,
            deadline: null,
            currentBet: 0,
            lastHand: result,
        }),
        events: [...events, { type: 'handEnded', result }],
    };
}

function tick(state: HoldemState, now: number): HoldemResult {
    if (state.phase !== 'PLAYING' || !state.toActId || state.deadline === null)
        return { state, events: [] };
    if (now < state.deadline) return { state, events: [] };
    const seat = state.seats.find((candidate) => candidate.id === state.toActId)!;
    return act(state, seat.id, seat.streetBet >= state.currentBet ? 'check' : 'fold', 0, now);
}

/** What a player may see: only their own hole cards, and everybody's once shown down. */
export interface HoldemView extends Omit<HoldemState, 'deck' | 'rng' | 'seats'> {
    seats: (Omit<HoldemSeat, 'hole'> & { hole: (PlayingCard | null)[] })[];
    pot: number;
    yourId: string;
}

export function redactHoldem(state: HoldemState, viewerId: string): HoldemView {
    const { deck: _deck, rng: _rng, seats, ...rest } = state;
    const revealed = state.phase === 'SHOWDOWN' ? (state.lastHand?.revealed ?? {}) : {};
    return {
        ...rest,
        seats: seats.map((seat) => ({
            ...seat,
            hole: seat.id === viewerId || revealed[seat.id] ? seat.hole : seat.hole.map(() => null),
        })),
        pot: seats.reduce((sum, seat) => sum + seat.handBet, 0),
        yourId: viewerId,
    };
}

/**
 * The table bot. Estimates hand strength (pre-flop: pairs, high cards, suited connectors;
 * post-flop: the made hand) and plays a tight-aggressive strategy with a little bluffing.
 * `random` is injected so the engine itself stays deterministic.
 */
export function holdemBotAction(state: HoldemState, botId: string, random: number): HoldemAction {
    const seat = state.seats.find((candidate) => candidate.id === botId)!;
    const toCall = state.currentBet - seat.streetBet;
    const pot = state.seats.reduce((sum, candidate) => sum + candidate.handBet, 0);
    const strength =
        state.board.length === 0
            ? preflopStrength(seat.hole)
            : postflopStrength(seat.hole, state.board);
    const bluff = random < 0.07;

    if ((strength > 0.78 || bluff) && seat.stack > toCall) {
        const target =
            state.currentBet + Math.max(state.minRaise, Math.round(pot * (0.5 + random * 0.5)));
        if (target - seat.streetBet >= seat.stack) return { type: 'allIn', id: botId };
        return { type: 'raise', id: botId, to: target };
    }
    if (toCall === 0) return { type: 'check', id: botId };
    const potOdds = toCall / Math.max(1, pot + toCall);
    if (strength > 0.4 || strength > potOdds + 0.15 || toCall <= state.config.bigBlind) {
        return toCall >= seat.stack ? { type: 'allIn', id: botId } : { type: 'call', id: botId };
    }
    return { type: 'fold', id: botId };
}

function preflopStrength(hole: PlayingCard[]): number {
    const [a, b] = hole.map((card) => rankValue(card.rank)).sort((x, y) => y - x) as [
        number,
        number,
    ];
    let score = (a + b - 4) / 24; // 0..1 from 2-2 to A-A by raw rank
    if (a === b) score = 0.55 + (a / 14) * 0.45;
    if (hole[0]!.suit === hole[1]!.suit) score += 0.06;
    if (a - b === 1) score += 0.04;
    return Math.min(1, score);
}

const CATEGORY_STRENGTH: Record<HandCategory, number> = {
    'high-card': 0.15,
    pair: 0.45,
    'two-pair': 0.68,
    'three-of-a-kind': 0.8,
    straight: 0.86,
    flush: 0.9,
    'full-house': 0.95,
    'four-of-a-kind': 0.98,
    'straight-flush': 0.99,
    'royal-flush': 1,
};

function postflopStrength(hole: PlayingCard[], board: PlayingCard[]): number {
    const cards = [...hole, ...board];
    if (cards.length < 5) return preflopStrength(hole);
    const rank = bestHand(cards);
    // A made hand that only lives on the board is worth much less to us.
    const boardRank = board.length >= 5 ? bestHand(board) : null;
    const shared = boardRank && compareHands(rank, boardRank) === 0;
    return CATEGORY_STRENGTH[rank.category] * (shared ? 0.5 : 1);
}
