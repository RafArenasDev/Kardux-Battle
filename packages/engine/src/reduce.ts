import { ERROR_MESSAGES, TABLE_TIMING, matchConfigSchema } from '@kardux/contracts';
import type { Card, ErrorCode, MatchState, Player, RoundState } from '@kardux/contracts';
import type { EngineAction, EngineContext } from './actions.js';
import { dealDeck } from './deal.js';
import type { EngineEvent } from './events.js';
import { nextInt } from './rng.js';
import { computeTurnDeadline, finishByTimeout, resolveRound } from './round.js';
import { buildTurnOrder, findFirstTurnPlayerId, rotateToLeader } from './turn-order.js';

export interface ReduceResult {
    state: MatchState;
    events: EngineEvent[];
}

function fail(state: MatchState, code: ErrorCode): ReduceResult {
    return { state, events: [{ type: 'error', code, message: ERROR_MESSAGES[code].en }] };
}

const ACTIVE_PHASES = new Set(['AWAITING_ATTRIBUTE', 'AWAITING_CARDS', 'COUNTDOWN', 'DEALING']);

/**
 * The engine's single entry point: `(state, action, ctx) -> { state, events }`, deterministic
 * given the same inputs (ADR 0003 - no `Math.random()`/`Date.now()` anywhere below this
 * function or anything it calls). Every handler either returns a state with `version`
 * incremented by exactly 1 alongside the events that describe what changed, or returns the
 * *original* state unchanged (so `version` never bumps) alongside a single `error` event.
 */
export function reduce(state: MatchState, action: EngineAction, ctx: EngineContext): ReduceResult {
    if (
        state.endsAt !== null &&
        ctx.now >= state.endsAt &&
        state.phase !== 'FINISHED' &&
        state.phase !== 'LOBBY'
    ) {
        return finishByTimeout(state);
    }

    switch (action.type) {
        case 'player.join':
            return applyPlayerJoin(state, action);
        case 'player.leave':
            return applyPlayerLeave(state, action, ctx);
        case 'match.configure':
            return applyMatchConfigure(state, action);
        case 'match.start':
            return applyMatchStart(state, action, ctx);
        case 'match.beginCountdown':
            return applyBeginCountdown(state, action, ctx);
        case 'match.cancelCountdown':
            return applyCancelCountdown(state, action);
        case 'round.selectAttribute':
            return applySelectAttribute(state, action, ctx);
        case 'round.playCard':
            return applyPlayCard(state, action, ctx);
        case 'system.tick':
            return applyTick(state, ctx);
    }
}

function applyPlayerJoin(
    state: MatchState,
    action: Extract<EngineAction, { type: 'player.join' }>,
): ReduceResult {
    if (state.players.some((player) => player.id === action.playerId)) {
        return fail(state, 'ERR_VALIDATION');
    }

    // Joining only ever seats an active player - "spectator" exists solely for someone who ran
    // out of cards mid-match (rule 9), never for a newcomer arriving after the lobby closed.
    if (state.phase !== 'LOBBY') {
        return fail(state, 'ERR_MATCH_ALREADY_STARTED');
    }

    const activeCount = state.players.filter((player) => !player.isSpectator).length;

    if (activeCount >= state.config.maxPlayers) {
        return fail(state, 'ERR_MATCH_FULL');
    }

    const player: Player = {
        id: action.playerId,
        nickname: action.nickname,
        avatarSeed: action.avatarSeed,
        joinOrder: state.players.length,
        seat: state.players.length,
        isSpectator: false,
        isEliminated: false,
        eliminatedAt: null,
        cardCount: 0,
        hasLeft: false,
    };

    const nextState: MatchState = {
        ...state,
        version: state.version + 1,
        players: [...state.players, player],
        hostId: state.hostId ?? player.id,
    };

    return { state: nextState, events: [{ type: 'player.joined', player }] };
}

/**
 * Before the deal (`LOBBY`/`COUNTDOWN`), leaving removes the player outright, hands the host
 * role to the next-earliest joiner and stops a countdown the room no longer qualifies for.
 * Once a match is underway, leaving is a forfeit that ends the match (see `forfeit`).
 */
function applyPlayerLeave(
    state: MatchState,
    action: Extract<EngineAction, { type: 'player.leave' }>,
    ctx: EngineContext,
): ReduceResult {
    const player = state.players.find((candidate) => candidate.id === action.playerId);

    if (!player) {
        return fail(state, 'ERR_VALIDATION');
    }

    if (state.phase === 'LOBBY' || state.phase === 'COUNTDOWN') {
        const remainingPlayers = state.players.filter(
            (candidate) => candidate.id !== action.playerId,
        );
        const nextHostId =
            state.hostId === action.playerId
                ? (remainingPlayers.find((candidate) => !candidate.isSpectator)?.id ?? null)
                : state.hostId;
        const remainingActive = remainingPlayers.filter((candidate) => !candidate.isSpectator);
        // A countdown only runs while the room is full enough to auto-start.
        const stopCountdown =
            state.phase === 'COUNTDOWN' && remainingActive.length < state.config.autoStartPlayers;

        const nextState: MatchState = {
            ...state,
            version: state.version + 1,
            players: remainingPlayers,
            hostId: nextHostId,
            ...(stopCountdown
                ? { phase: 'LOBBY' as const, countdownEndsAt: null, pendingDeck: null }
                : {}),
        };

        return { state: nextState, events: [{ type: 'player.left', playerId: action.playerId }] };
    }

    if (player.isEliminated || player.isSpectator) {
        const nextState: MatchState = { ...state, version: state.version + 1 };

        return { state: nextState, events: [{ type: 'player.left', playerId: action.playerId }] };
    }

    return forfeit(state, action.playerId, ctx.now);
}

/**
 * Leaving a match in progress is a forfeit - there is no way to pause or resume. The leaver
 * finishes last with zero cards.
 * - In a duel the match ends on the spot: the rival keeps their cards plus the leaver's pile,
 *   the card the leaver had on the table and the tie pot, and wins.
 * - With three or more players the match goes on: the leaver's pile is dealt out evenly among
 *   the others (one card each in turn order, starting after the leaver), a card they had
 *   already laid down joins the pot, and the turn moves on if it was theirs.
 */
function forfeit(state: MatchState, leaverId: string, now: number): ReduceResult {
    const remaining = state.turnOrder.filter((id) => id !== leaverId);
    return remaining.length <= 1
        ? forfeitDuel(state, leaverId, remaining, now)
        : forfeitTable(state, leaverId, remaining, now);
}

function markLeaver(player: Player, now: number): Player {
    return {
        ...player,
        cardCount: 0,
        isEliminated: true,
        isSpectator: true,
        eliminatedAt: now,
        hasLeft: true,
    };
}

function forfeitDuel(
    state: MatchState,
    leaverId: string,
    remaining: readonly string[],
    now: number,
): ReduceResult {
    const piles: Record<string, Card[]> = { ...state.piles };
    const played = state.round?.playedCards ?? {};
    const rivalId = remaining[0];

    if (rivalId) {
        piles[rivalId] = [
            ...(piles[rivalId] ?? []),
            ...(played[rivalId] ? [played[rivalId]] : []),
            ...(piles[leaverId] ?? []),
            ...(played[leaverId] ? [played[leaverId]] : []),
            ...state.pot,
        ];
    }
    piles[leaverId] = [];

    const players = state.players.map((player) =>
        player.id === leaverId
            ? markLeaver(player, now)
            : player.id === rivalId
              ? { ...player, cardCount: piles[player.id]?.length ?? 0 }
              : player,
    );

    const finished = finishByTimeout({
        ...state,
        piles,
        players,
        pot: [],
        turnOrder: [...remaining],
        round: null,
    });

    return {
        state: finished.state,
        events: [{ type: 'player.left', playerId: leaverId }, ...finished.events],
    };
}

function forfeitTable(
    state: MatchState,
    leaverId: string,
    remaining: readonly string[],
    now: number,
): ReduceResult {
    const piles: Record<string, Card[]> = { ...state.piles };
    const leaverIndex = state.turnOrder.indexOf(leaverId);
    // Deal the leaver's pile starting with the player right after them.
    const dealOrder = [
        ...state.turnOrder.slice(leaverIndex + 1),
        ...state.turnOrder.slice(0, leaverIndex),
    ].filter((id) => id !== leaverId);
    (piles[leaverId] ?? []).forEach((card, index) => {
        const receiver = dealOrder[index % dealOrder.length]!;
        piles[receiver] = [...(piles[receiver] ?? []), card];
    });
    piles[leaverId] = [];

    const round = state.round;
    const leaverCard = round?.playedCards[leaverId];
    const pot = leaverCard ? [...state.pot, leaverCard] : state.pot;
    const nextRound: RoundState | null = round
        ? {
              ...round,
              playOrder: round.playOrder.filter((id) => id !== leaverId),
              playedCards: Object.fromEntries(
                  Object.entries(round.playedCards).filter(([id]) => id !== leaverId),
              ),
          }
        : null;

    const players = state.players.map((player) => {
        if (player.id === leaverId) return markLeaver(player, now);
        if (player.isSpectator) return player;
        const onTable = nextRound?.playedCards[player.id] ? 1 : 0;
        return { ...player, cardCount: (piles[player.id]?.length ?? 0) + onTable };
    });

    // Whoever held the turn keeps it; if it was the leaver, it passes to the next player.
    const turnHolder = state.turnOrder[state.currentTurnIndex];
    const currentTurnIndex =
        turnHolder && turnHolder !== leaverId
            ? remaining.indexOf(turnHolder)
            : remaining.indexOf(dealOrder[0]!);
    const leaderLeft = state.phase === 'AWAITING_ATTRIBUTE' && turnHolder === leaverId;

    const nextState: MatchState = {
        ...state,
        version: state.version + 1,
        piles,
        players,
        pot,
        turnOrder: [...remaining],
        currentTurnIndex: Math.max(0, currentTurnIndex),
        round: nextRound,
        turnOpensAt: leaderLeft ? now : state.turnOpensAt,
        turnDeadline: leaderLeft ? computeTurnDeadline(state.config, now) : state.turnDeadline,
    };
    const leftEvent: EngineEvent = { type: 'player.left', playerId: leaverId };

    // The leaver may have been the last one the round was waiting on.
    if (
        nextState.phase === 'AWAITING_CARDS' &&
        nextRound &&
        nextRound.playOrder.every((id) => nextRound.playedCards[id] !== undefined)
    ) {
        const resolved = resolveRound(nextState, now);
        return { state: resolved.state, events: [leftEvent, ...resolved.events] };
    }

    return { state: nextState, events: [leftEvent] };
}

function applyMatchConfigure(
    state: MatchState,
    action: Extract<EngineAction, { type: 'match.configure' }>,
): ReduceResult {
    if (state.phase !== 'LOBBY') {
        return fail(state, 'ERR_MATCH_ALREADY_STARTED');
    }

    if (action.playerId !== state.hostId) {
        return fail(state, 'ERR_NOT_HOST');
    }

    const merged = matchConfigSchema.safeParse({ ...state.config, ...action.patch });

    if (!merged.success) {
        return fail(state, 'ERR_INVALID_CONFIG');
    }

    const nextState: MatchState = { ...state, version: state.version + 1, config: merged.data };

    return { state: nextState, events: [] };
}

function activePlayerIds(state: MatchState): string[] {
    return state.players.filter((player) => !player.isSpectator).map((player) => player.id);
}

/** Shared by manual start and the moment a countdown elapses: shuffles + deals `deck`,
 *  resolves the first-turn player (docs/SPEC.md rule 5), and moves straight to
 *  `AWAITING_ATTRIBUTE` - `DEALING` is reported via the deal itself producing the new piles,
 *  not a phase the state stops in (see README.md). */
function beginMatch(state: MatchState, deck: readonly Card[], now: number): MatchState {
    const players = activePlayerIds(state);
    const turnOrder = buildTurnOrder(state.players.filter((player) => !player.isSpectator));
    const dealt = dealDeck(deck, players, state.rng, state.config.cardsPerPlayer);
    const dealtCount = Object.values(dealt.piles).reduce((sum, pile) => sum + pile.length, 0);
    const firstTurnPlayerId =
        (state.config.firstTurn === 'first_joined'
            ? turnOrder[0]
            : findFirstTurnPlayerId(dealt.piles, state.config.packs, state.config.cardsPerPack)) ??
        turnOrder[0]!;

    return {
        ...state,
        version: state.version + 1,
        phase: 'AWAITING_ATTRIBUTE',
        startedAt: now,
        endsAt: state.config.matchDurationMs > 0 ? now + state.config.matchDurationMs : null,
        countdownEndsAt: null,
        pendingDeck: null,
        rng: dealt.rng,
        piles: dealt.piles,
        undealtCount: deck.length - dealtCount,
        players: state.players.map((player) =>
            player.isSpectator
                ? player
                : { ...player, cardCount: dealt.piles[player.id]?.length ?? 0 },
        ),
        turnOrder,
        currentTurnIndex: Math.max(turnOrder.indexOf(firstTurnPlayerId), 0),
        roundIndex: 0,
        // The first turn opens once everyone has watched the cards being dealt.
        turnOpensAt: now + TABLE_TIMING.dealMs,
        turnDeadline: computeTurnDeadline(state.config, now + TABLE_TIMING.dealMs),
    };
}

function applyMatchStart(
    state: MatchState,
    action: Extract<EngineAction, { type: 'match.start' }>,
    ctx: EngineContext,
): ReduceResult {
    if (state.phase !== 'LOBBY') {
        return fail(state, 'ERR_MATCH_ALREADY_STARTED');
    }

    if (action.playerId !== state.hostId) {
        return fail(state, 'ERR_NOT_HOST');
    }

    const activeCount = activePlayerIds(state).length;

    if (activeCount < state.config.minPlayers) {
        return fail(state, 'ERR_NOT_ENOUGH_PLAYERS');
    }

    const nextState = beginMatch(state, action.deck, ctx.now);

    return { state: nextState, events: [{ type: 'match.started' }] };
}

function applyBeginCountdown(
    state: MatchState,
    action: Extract<EngineAction, { type: 'match.beginCountdown' }>,
    ctx: EngineContext,
): ReduceResult {
    if (state.phase !== 'LOBBY') {
        return fail(state, 'ERR_MATCH_ALREADY_STARTED');
    }

    const endsAt = ctx.now + state.config.autoStartCountdownMs;
    const nextState: MatchState = {
        ...state,
        version: state.version + 1,
        phase: 'COUNTDOWN',
        countdownEndsAt: endsAt,
        pendingDeck: action.deck,
    };

    return { state: nextState, events: [{ type: 'match.countdownStarted', endsAt }] };
}

function applyCancelCountdown(
    state: MatchState,
    action: Extract<EngineAction, { type: 'match.cancelCountdown' }>,
): ReduceResult {
    if (state.phase !== 'COUNTDOWN') {
        return fail(state, 'ERR_VALIDATION');
    }

    if (action.playerId !== state.hostId) {
        return fail(state, 'ERR_NOT_HOST');
    }

    const nextState: MatchState = {
        ...state,
        version: state.version + 1,
        phase: 'LOBBY',
        countdownEndsAt: null,
        pendingDeck: null,
    };

    return { state: nextState, events: [{ type: 'match.countdownCancelled' }] };
}

function startRound(
    state: MatchState,
    leaderId: string,
    attribute: string,
    now: number,
): MatchState {
    const playOrder = rotateToLeader(state.turnOrder, leaderId);
    const round: RoundState = {
        index: state.roundIndex,
        leaderId,
        attribute,
        playOrder,
        playedCards: {},
    };

    return {
        ...state,
        version: state.version + 1,
        phase: 'AWAITING_CARDS',
        roundIndex: state.roundIndex + 1,
        round,
        turnDeadline: computeTurnDeadline(state.config, now),
    };
}

function applySelectAttribute(
    state: MatchState,
    action: Extract<EngineAction, { type: 'round.selectAttribute' }>,
    ctx: EngineContext,
): ReduceResult {
    if (state.phase !== 'AWAITING_ATTRIBUTE') {
        return fail(state, 'ERR_VALIDATION');
    }

    const leaderId = state.turnOrder[state.currentTurnIndex];

    if (action.playerId !== leaderId) {
        return fail(state, 'ERR_NOT_YOUR_TURN');
    }

    const leaderTopCard = state.piles[leaderId!]?.[0];

    if (!leaderTopCard || !(action.attribute in leaderTopCard.stats)) {
        return fail(state, 'ERR_INVALID_ATTRIBUTE');
    }

    const nextState = startRound(state, leaderId!, action.attribute, ctx.now);

    return {
        state: nextState,
        events: [
            { type: 'round.attributeSelected', attribute: action.attribute },
            {
                type: 'round.started',
                round: {
                    index: nextState.round!.index,
                    leaderId: nextState.round!.leaderId,
                    attribute: nextState.round!.attribute,
                    playOrder: nextState.round!.playOrder,
                    playedBy: [],
                    revealedCards: {},
                },
            },
        ],
    };
}

function applyPlayCard(
    state: MatchState,
    action: Extract<EngineAction, { type: 'round.playCard' }>,
    ctx: EngineContext,
): ReduceResult {
    if (state.phase !== 'AWAITING_CARDS' || !state.round) {
        return fail(state, 'ERR_VALIDATION');
    }

    const round = state.round;
    const player = state.players.find((candidate) => candidate.id === action.playerId);

    if (!player) {
        return fail(state, 'ERR_VALIDATION');
    }

    if (player.isSpectator) {
        return fail(state, 'ERR_SPECTATOR_CANNOT_ACT');
    }

    if (!round.playOrder.includes(action.playerId)) {
        return fail(state, 'ERR_NOT_YOUR_TURN');
    }

    if (round.playedCards[action.playerId]) {
        return fail(state, 'ERR_ALREADY_PLAYED');
    }

    const pile = state.piles[action.playerId] ?? [];

    if (pile.length === 0) {
        return fail(state, 'ERR_VALIDATION');
    }

    const [playedCard, ...rest] = pile as [Card, ...Card[]];
    const newRound: RoundState = {
        ...round,
        playedCards: { ...round.playedCards, [action.playerId]: playedCard },
    };
    const stateAfterPlay: MatchState = {
        ...state,
        piles: { ...state.piles, [action.playerId]: rest },
        round: newRound,
    };

    const cardPlayedEvent: EngineEvent = { type: 'round.cardPlayed', playerId: action.playerId };
    const allPlayed = round.playOrder.every((id) => newRound.playedCards[id] !== undefined);

    if (!allPlayed) {
        const nextState: MatchState = {
            ...stateAfterPlay,
            version: state.version + 1,
            turnDeadline: computeTurnDeadline(state.config, ctx.now),
        };

        return { state: nextState, events: [cardPlayedEvent] };
    }

    const resolved = resolveRound(stateAfterPlay, ctx.now);

    return { state: resolved.state, events: [cardPlayedEvent, ...resolved.events] };
}

/**
 * Applies whichever `onTurnTimeout` policy the match is configured with when the *leader*
 * fails to pick an attribute in time. `skip` passes leadership to the next player in
 * `turnOrder` (a fresh deadline, same phase); `random_attr`/`highest_attr` pick an attribute
 * on the leader's behalf and start the round exactly as `round.selectAttribute` would.
 */
function applyLeaderTimeout(state: MatchState, ctx: EngineContext): ReduceResult {
    const leaderId = state.turnOrder[state.currentTurnIndex]!;

    if (state.config.onTurnTimeout === 'skip') {
        const nextIndex = (state.currentTurnIndex + 1) % state.turnOrder.length;
        const nextState: MatchState = {
            ...state,
            version: state.version + 1,
            currentTurnIndex: nextIndex,
            turnOpensAt: ctx.now,
            turnDeadline: computeTurnDeadline(state.config, ctx.now),
        };

        return { state: nextState, events: [] };
    }

    const leaderTopCard = state.piles[leaderId]?.[0];

    if (!leaderTopCard) {
        return { state, events: [] };
    }

    const attributeKeys = Object.keys(leaderTopCard.stats);
    let attribute: string;

    if (state.config.onTurnTimeout === 'highest_attr') {
        attribute = attributeKeys.reduce((best, key) =>
            leaderTopCard.stats[key]! > leaderTopCard.stats[best]! ? key : best,
        );

        const nextState = startRound(state, leaderId, attribute, ctx.now);

        return {
            state: nextState,
            events: [
                { type: 'round.attributeSelected', attribute },
                {
                    type: 'round.started',
                    round: {
                        index: nextState.round!.index,
                        leaderId: nextState.round!.leaderId,
                        attribute: nextState.round!.attribute,
                        playOrder: nextState.round!.playOrder,
                        playedBy: [],
                        revealedCards: {},
                    },
                },
            ],
        };
    }

    const [pick, nextRng] = nextInt(attributeKeys.length, state.rng);
    attribute = attributeKeys[pick]!;

    const nextState = startRound({ ...state, rng: nextRng }, leaderId, attribute, ctx.now);

    return {
        state: nextState,
        events: [
            { type: 'round.attributeSelected', attribute },
            {
                type: 'round.started',
                round: {
                    index: nextState.round!.index,
                    leaderId: nextState.round!.leaderId,
                    attribute: nextState.round!.attribute,
                    playOrder: nextState.round!.playOrder,
                    playedBy: [],
                    revealedCards: {},
                },
            },
        ],
    };
}

/** A player who hasn't played their card in time is auto-played for - there's no choice
 *  involved (they only ever have one card to play), so `onTurnTimeout`'s policies don't apply
 *  here the way they do to picking an attribute. */
function applyCardTimeout(state: MatchState, ctx: EngineContext): ReduceResult {
    const round = state.round!;
    const pendingPlayerId = round.playOrder.find((id) => round.playedCards[id] === undefined)!;

    return applyPlayCard(state, { type: 'round.playCard', playerId: pendingPlayerId }, ctx);
}

function applyTick(state: MatchState, ctx: EngineContext): ReduceResult {
    if (
        state.phase === 'COUNTDOWN' &&
        state.countdownEndsAt !== null &&
        ctx.now >= state.countdownEndsAt
    ) {
        const nextState = beginMatch(state, state.pendingDeck ?? [], ctx.now);

        return { state: nextState, events: [{ type: 'match.started' }] };
    }

    if (
        !ACTIVE_PHASES.has(state.phase) ||
        state.turnDeadline === null ||
        ctx.now < state.turnDeadline
    ) {
        return { state, events: [] };
    }

    if (state.phase === 'AWAITING_ATTRIBUTE') {
        return applyLeaderTimeout(state, ctx);
    }

    if (state.phase === 'AWAITING_CARDS') {
        return applyCardTimeout(state, ctx);
    }

    return { state, events: [] };
}
