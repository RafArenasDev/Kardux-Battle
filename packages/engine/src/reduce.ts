import { ERROR_MESSAGES, matchConfigSchema } from '@kardux/contracts';
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

    const isSpectator = state.phase !== 'LOBBY';

    if (isSpectator && !state.config.allowSpectators) {
        return fail(state, 'ERR_MATCH_ALREADY_STARTED');
    }

    if (!isSpectator) {
        const activeCount = state.players.filter((player) => !player.isSpectator).length;

        if (activeCount >= state.config.maxPlayers) {
            return fail(state, 'ERR_MATCH_FULL');
        }
    }

    const player: Player = {
        id: action.playerId,
        nickname: action.nickname,
        avatarSeed: action.avatarSeed,
        joinOrder: state.players.length,
        seat: state.players.length,
        isSpectator,
        isEliminated: false,
        eliminatedAt: null,
        cardCount: 0,
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
 * In `LOBBY`, leaving removes the player outright (and hands the host role to the
 * next-earliest joiner, if the host left). Once a match is underway, a voluntary leave is
 * treated the same as running out of cards (docs/SPEC.md only defines elimination for the
 * "ran out of cards" case; it's silent on a deliberate mid-match leave) - they become a
 * spectator and drop out of the turn order. Their pile at that moment is removed from
 * circulation rather than redistributed: docs/SPEC.md has no rule for "who inherits a
 * voluntary leaver's cards," and inventing a redistribution rule would be a bigger, unasked-
 * for design decision than simply not awarding cards nobody currently played for.
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

    if (state.phase === 'LOBBY') {
        const remainingPlayers = state.players.filter(
            (candidate) => candidate.id !== action.playerId,
        );
        const nextHostId =
            state.hostId === action.playerId
                ? (remainingPlayers.find((candidate) => !candidate.isSpectator)?.id ?? null)
                : state.hostId;

        const nextState: MatchState = {
            ...state,
            version: state.version + 1,
            players: remainingPlayers,
            hostId: nextHostId,
        };

        return { state: nextState, events: [{ type: 'player.left', playerId: action.playerId }] };
    }

    if (player.isEliminated || player.isSpectator) {
        const nextState: MatchState = { ...state, version: state.version + 1 };

        return { state: nextState, events: [{ type: 'player.left', playerId: action.playerId }] };
    }

    const { piles, players, turnOrder } = eliminate(state, [action.playerId], ctx.now);
    const remainingActive = turnOrder;

    if (remainingActive.length <= 1) {
        return finishByTimeout({
            ...state,
            piles,
            players,
            turnOrder: remainingActive,
            round: null,
        });
    }

    const wasLeader =
        state.round?.leaderId === action.playerId ||
        (!state.round && state.turnOrder[state.currentTurnIndex] === action.playerId);
    const newCurrentTurnIndex = wasLeader
        ? remainingActive.indexOf(remainingActive[0]!)
        : Math.min(state.currentTurnIndex, remainingActive.length - 1);

    const nextState: MatchState = {
        ...state,
        version: state.version + 1,
        piles,
        players,
        turnOrder: remainingActive,
        currentTurnIndex: newCurrentTurnIndex,
        round: wasLeader ? null : state.round,
        phase: wasLeader ? 'AWAITING_ATTRIBUTE' : state.phase,
        turnDeadline: wasLeader ? computeTurnDeadline(state.config, ctx.now) : state.turnDeadline,
    };

    return { state: nextState, events: [{ type: 'player.left', playerId: action.playerId }] };
}

/** Shared elimination bookkeeping: marks players eliminated/spectator, zeroes their card
 *  count, drops them from `turnOrder`. Does not decide what happens to the round in progress
 *  - callers (`applyPlayerLeave`, `round.ts`'s `resolveRound`) handle that themselves, since
 *  the right response differs (a round losing its leader vs. a round losing a non-leader). */
function eliminate(
    state: MatchState,
    playerIds: readonly string[],
    now: number,
): Pick<MatchState, 'piles' | 'players' | 'turnOrder'> {
    const idSet = new Set(playerIds);
    const piles = { ...state.piles };

    for (const id of idSet) {
        piles[id] = [];
    }

    const players = state.players.map((player) =>
        idSet.has(player.id)
            ? {
                  ...player,
                  isEliminated: true,
                  isSpectator: true,
                  eliminatedAt: now,
                  cardCount: 0,
              }
            : player,
    );

    const turnOrder = state.turnOrder.filter((id) => !idSet.has(id));

    return { piles, players, turnOrder };
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
    const dealt = dealDeck(deck, players, state.rng);
    const firstTurnPlayerId =
        findFirstTurnPlayerId(dealt.piles, state.config.packs, state.config.cardsPerPack) ??
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
        players: state.players.map((player) =>
            player.isSpectator
                ? player
                : { ...player, cardCount: dealt.piles[player.id]?.length ?? 0 },
        ),
        turnOrder,
        currentTurnIndex: Math.max(turnOrder.indexOf(firstTurnPlayerId), 0),
        roundIndex: 0,
        turnDeadline: computeTurnDeadline(state.config, now),
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

    // Hand matches: the player may pick any card among the first `handSize` of their pile.
    const handSize = state.config.handSize ?? 0;
    let playedIndex = 0;
    if (action.cardCode !== undefined && handSize > 0) {
        playedIndex = pile.findIndex((card) => card.code === action.cardCode);
        if (playedIndex < 0 || playedIndex >= handSize) {
            return fail(state, 'ERR_VALIDATION');
        }
    }

    const playedCard = pile[playedIndex]!;
    const rest = pile.filter((_, index) => index !== playedIndex);
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
