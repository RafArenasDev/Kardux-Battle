import { describe, expect, it } from 'vitest';
import { createMatch } from './create-match.js';
import { reduce } from './reduce.js';
import { card, config, player, state } from './test-helpers.js';

const ctx = (now = 0) => ({ now });

describe('player.join', () => {
    it('adds the player and makes the first joiner the host', () => {
        const initial = createMatch(config(), { matchId: 'm1', code: 'ABC123', now: 0 });

        const { state: afterAlice, events } = reduce(
            initial,
            { type: 'player.join', playerId: 'alice', nickname: 'Alice', avatarSeed: 'a' },
            ctx(),
        );

        expect(afterAlice.players).toHaveLength(1);
        expect(afterAlice.hostId).toBe('alice');
        expect(afterAlice.version).toBe(1);
        expect(events).toEqual([{ type: 'player.joined', player: afterAlice.players[0] }]);
    });

    it('rejects a duplicate playerId', () => {
        const withAlice = state({ players: [player('alice')], piles: {} });

        const result = reduce(
            withAlice,
            { type: 'player.join', playerId: 'alice', nickname: 'Alice again', avatarSeed: 'a' },
            ctx(),
        );

        expect(result.state.version).toBe(withAlice.version);
        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_VALIDATION' });
    });

    it('rejects joining once maxPlayers active players are already in', () => {
        const lobby = state({
            config: config({ minPlayers: 2, maxPlayers: 2, autoStartPlayers: 2 }),
            players: [player('alice', { joinOrder: 0 }), player('bob', { joinOrder: 1 })],
        });

        const result = reduce(
            lobby,
            { type: 'player.join', playerId: 'carol', nickname: 'Carol', avatarSeed: 'c' },
            ctx(),
        );

        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_MATCH_FULL' });
    });

    it('joins as a spectator once the match is underway, if allowSpectators is enabled', () => {
        const ongoing = state({
            phase: 'AWAITING_ATTRIBUTE',
            config: config({ allowSpectators: true }),
            players: [player('alice')],
        });

        const { state: next } = reduce(
            ongoing,
            { type: 'player.join', playerId: 'zed', nickname: 'Zed', avatarSeed: 'z' },
            ctx(),
        );

        const zed = next.players.find((p) => p.id === 'zed');

        expect(zed?.isSpectator).toBe(true);
        expect(next.turnOrder).not.toContain('zed');
    });

    it('rejects joining mid-match when allowSpectators is disabled', () => {
        const ongoing = state({
            phase: 'AWAITING_ATTRIBUTE',
            config: config({ allowSpectators: false }),
            players: [player('alice')],
        });

        const result = reduce(
            ongoing,
            { type: 'player.join', playerId: 'zed', nickname: 'Zed', avatarSeed: 'z' },
            ctx(),
        );

        expect(result.events[0]).toMatchObject({
            type: 'error',
            code: 'ERR_MATCH_ALREADY_STARTED',
        });
    });
});

describe('match.configure', () => {
    it('lets the host change the config while in LOBBY', () => {
        const lobby = state({ players: [player('alice')], hostId: 'alice' });

        const { state: next } = reduce(
            lobby,
            { type: 'match.configure', playerId: 'alice', patch: { matchDurationMs: 1_000 } },
            ctx(),
        );

        expect(next.config.matchDurationMs).toBe(1_000);
    });

    it('rejects a non-host', () => {
        const lobby = state({
            players: [player('alice'), player('bob', { joinOrder: 1 })],
            hostId: 'alice',
        });

        const result = reduce(
            lobby,
            { type: 'match.configure', playerId: 'bob', patch: { matchDurationMs: 1_000 } },
            ctx(),
        );

        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_NOT_HOST' });
    });

    it('rejects a patch that makes the merged config invalid', () => {
        const lobby = state({ players: [player('alice')], hostId: 'alice' });

        const result = reduce(
            lobby,
            {
                type: 'match.configure',
                playerId: 'alice',
                patch: { minPlayers: 10, maxPlayers: 2 },
            },
            ctx(),
        );

        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_INVALID_CONFIG' });
    });

    it('rejects configuring once the match has left LOBBY', () => {
        const ongoing = state({
            phase: 'AWAITING_ATTRIBUTE',
            players: [player('alice')],
            hostId: 'alice',
        });

        const result = reduce(
            ongoing,
            { type: 'match.configure', playerId: 'alice', patch: {} },
            ctx(),
        );

        expect(result.events[0]).toMatchObject({
            type: 'error',
            code: 'ERR_MATCH_ALREADY_STARTED',
        });
    });
});

describe('match.start', () => {
    const deck = [
        card('1A', 'A', { power: 10 }),
        card('2A', 'A', { power: 40 }),
        card('1B', 'B', { power: 20 }),
        card('2B', 'B', { power: 30 }),
    ];

    it('deals the deck and moves to AWAITING_ATTRIBUTE', () => {
        const lobby = state({
            config: config({
                minPlayers: 2,
                maxPlayers: 2,
                autoStartPlayers: 2,
                packs: 2,
                cardsPerPack: 2,
            }),
            players: [player('alice', { joinOrder: 0 }), player('bob', { joinOrder: 1 })],
            hostId: 'alice',
        });

        const { state: next, events } = reduce(
            lobby,
            { type: 'match.start', playerId: 'alice', deck },
            ctx(1_000),
        );

        expect(next.phase).toBe('AWAITING_ATTRIBUTE');
        expect(next.startedAt).toBe(1_000);
        expect(Object.values(next.piles).flat()).toHaveLength(4);
        expect(next.piles.alice).toHaveLength(2);
        expect(next.piles.bob).toHaveLength(2);
        expect(next.turnOrder).toEqual(['alice', 'bob']);
        expect(events).toEqual([{ type: 'match.started' }]);
    });

    it('starts whoever holds 1A (rule 5)', () => {
        const lobby = state({
            config: config({
                minPlayers: 2,
                maxPlayers: 2,
                autoStartPlayers: 2,
                packs: 2,
                cardsPerPack: 2,
            }),
            players: [player('alice', { joinOrder: 0 }), player('bob', { joinOrder: 1 })],
            hostId: 'alice',
        });

        const { state: next } = reduce(
            lobby,
            { type: 'match.start', playerId: 'alice', deck },
            ctx(),
        );

        const leaderId = next.turnOrder[next.currentTurnIndex];
        expect(next.piles[leaderId!]!.some((c) => c.code === '1A')).toBe(true);
    });

    it('rejects starting below minPlayers', () => {
        const lobby = state({
            config: config({ minPlayers: 2 }),
            players: [player('alice')],
            hostId: 'alice',
        });

        const result = reduce(lobby, { type: 'match.start', playerId: 'alice', deck }, ctx());

        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_NOT_ENOUGH_PLAYERS' });
    });

    it('rejects a non-host starting the match', () => {
        const lobby = state({
            config: config({ minPlayers: 2 }),
            players: [player('alice', { joinOrder: 0 }), player('bob', { joinOrder: 1 })],
            hostId: 'alice',
        });

        const result = reduce(lobby, { type: 'match.start', playerId: 'bob', deck }, ctx());

        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_NOT_HOST' });
    });

    it('sets endsAt from matchDurationMs, or null when unlimited', () => {
        const withLimit = state({
            config: config({ minPlayers: 2, matchDurationMs: 5_000 }),
            players: [player('alice', { joinOrder: 0 }), player('bob', { joinOrder: 1 })],
            hostId: 'alice',
        });
        const withoutLimit = state({
            config: config({ minPlayers: 2, matchDurationMs: 0 }),
            players: [player('alice', { joinOrder: 0 }), player('bob', { joinOrder: 1 })],
            hostId: 'alice',
        });

        const { state: limited } = reduce(
            withLimit,
            { type: 'match.start', playerId: 'alice', deck },
            ctx(1_000),
        );
        const { state: unlimited } = reduce(
            withoutLimit,
            { type: 'match.start', playerId: 'alice', deck },
            ctx(1_000),
        );

        expect(limited.endsAt).toBe(6_000);
        expect(unlimited.endsAt).toBeNull();
    });
});

describe('round.selectAttribute + round.playCard: a clear win', () => {
    function readyState() {
        return state({
            phase: 'AWAITING_ATTRIBUTE',
            players: [
                player('alice', { joinOrder: 0, cardCount: 1 }),
                player('bob', { joinOrder: 1, cardCount: 1 }),
            ],
            piles: {
                alice: [card('1A', 'A', { power: 100 })],
                bob: [card('1B', 'B', { power: 10 })],
            },
            turnOrder: ['alice', 'bob'],
            currentTurnIndex: 0,
            hostId: 'alice',
        });
    }

    it('only the leader may select an attribute', () => {
        const ready = readyState();
        const result = reduce(
            ready,
            { type: 'round.selectAttribute', playerId: 'bob', attribute: 'power' },
            ctx(),
        );

        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_NOT_YOUR_TURN' });
    });

    it('rejects an attribute the leader’s own card does not have', () => {
        const ready = readyState();
        const result = reduce(
            ready,
            { type: 'round.selectAttribute', playerId: 'alice', attribute: 'speed' },
            ctx(),
        );

        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_INVALID_ATTRIBUTE' });
    });

    it('moves to AWAITING_CARDS once the leader picks a valid attribute', () => {
        const ready = readyState();
        const { state: next, events } = reduce(
            ready,
            { type: 'round.selectAttribute', playerId: 'alice', attribute: 'power' },
            ctx(),
        );

        expect(next.phase).toBe('AWAITING_CARDS');
        expect(next.round).toMatchObject({
            leaderId: 'alice',
            attribute: 'power',
            playOrder: ['alice', 'bob'],
        });
        expect(events.map((e) => e.type)).toEqual(['round.attributeSelected', 'round.started']);
    });

    it('resolves the round once everyone has played, awarding every card to the winner', () => {
        const afterSelect = reduce(
            readyState(),
            { type: 'round.selectAttribute', playerId: 'alice', attribute: 'power' },
            ctx(),
        ).state;

        const afterAlicePlays = reduce(
            afterSelect,
            { type: 'round.playCard', playerId: 'alice' },
            ctx(),
        );
        expect(afterAlicePlays.state.phase).toBe('AWAITING_CARDS');
        expect(afterAlicePlays.events).toEqual([{ type: 'round.cardPlayed', playerId: 'alice' }]);

        const { state: resolved, events } = reduce(
            afterAlicePlays.state,
            { type: 'round.playCard', playerId: 'bob' },
            ctx(),
        );

        expect(resolved.phase).toBe('FINISHED');
        expect(resolved.winnerId).toBe('alice');
        expect(resolved.isDraw).toBe(false);
        expect(resolved.piles.alice).toHaveLength(2);
        expect(resolved.piles.bob).toHaveLength(0);
        expect(resolved.players.find((p) => p.id === 'bob')?.isEliminated).toBe(true);
        expect(events.map((e) => e.type)).toEqual([
            'round.cardPlayed',
            'round.revealed',
            'round.resolved',
            'match.finished',
        ]);
    });

    it('rejects a spectator trying to play', () => {
        const afterSelect = reduce(
            readyState(),
            { type: 'round.selectAttribute', playerId: 'alice', attribute: 'power' },
            ctx(),
        ).state;
        const asSpectator: typeof afterSelect = {
            ...afterSelect,
            players: afterSelect.players.map((p) =>
                p.id === 'bob' ? { ...p, isSpectator: true } : p,
            ),
        };

        const result = reduce(asSpectator, { type: 'round.playCard', playerId: 'bob' }, ctx());

        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_SPECTATOR_CANNOT_ACT' });
    });

    it('rejects playing twice in the same round', () => {
        const afterSelect = reduce(
            readyState(),
            { type: 'round.selectAttribute', playerId: 'alice', attribute: 'power' },
            ctx(),
        ).state;
        const afterFirstPlay = reduce(
            afterSelect,
            { type: 'round.playCard', playerId: 'alice' },
            ctx(),
        ).state;

        const result = reduce(afterFirstPlay, { type: 'round.playCard', playerId: 'alice' }, ctx());

        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_ALREADY_PLAYED' });
    });
});

describe('ties, including a chained triple tie', () => {
    it('a two-way tie leaves the pot for the next round, same leader', () => {
        const ready = state({
            phase: 'AWAITING_ATTRIBUTE',
            players: [
                player('alice', { joinOrder: 0, cardCount: 1 }),
                player('bob', { joinOrder: 1, cardCount: 1 }),
            ],
            piles: {
                alice: [card('1A', 'A', { power: 50 })],
                bob: [card('1B', 'B', { power: 50 })],
            },
            turnOrder: ['alice', 'bob'],
            currentTurnIndex: 0,
            hostId: 'alice',
        });

        const afterSelect = reduce(
            ready,
            { type: 'round.selectAttribute', playerId: 'alice', attribute: 'power' },
            ctx(),
        ).state;
        const afterAlice = reduce(
            afterSelect,
            { type: 'round.playCard', playerId: 'alice' },
            ctx(),
        ).state;
        const { state: resolved, events } = reduce(
            afterAlice,
            { type: 'round.playCard', playerId: 'bob' },
            ctx(),
        );

        expect(resolved.phase).toBe('AWAITING_ATTRIBUTE');
        expect(resolved.pot).toHaveLength(2);
        expect(resolved.turnOrder[resolved.currentTurnIndex]).toBe('alice');
        expect(resolved.players.every((p) => !p.isEliminated)).toBe(true);
        expect(events.some((e) => e.type === 'round.tie')).toBe(true);
    });

    it('a triple tie chains into a second tie, then a clear winner takes the whole accumulated pot', () => {
        // Every card has power=50 except alice's very last card (99) - alice, bob, and carol
        // tie twice in a row on their first two cards, then alice's last card wins the third
        // round outright, collecting the 6-card pot plus the 3 cards just played: all 9 cards
        // in the deck, which also means alice now holds every card ("fin por mazo completo").
        const ready = state({
            phase: 'AWAITING_ATTRIBUTE',
            config: config({ attributeCount: 3, packs: 3, cardsPerPack: 3 }),
            players: [
                player('alice', { joinOrder: 0, cardCount: 3 }),
                player('bob', { joinOrder: 1, cardCount: 3 }),
                player('carol', { joinOrder: 2, cardCount: 3 }),
            ],
            piles: {
                alice: [
                    card('1A', 'A', { power: 50 }),
                    card('2A', 'A', { power: 50 }),
                    card('3A', 'A', { power: 99 }),
                ],
                bob: [
                    card('1B', 'B', { power: 50 }),
                    card('2B', 'B', { power: 50 }),
                    card('3B', 'B', { power: 10 }),
                ],
                carol: [
                    card('1C', 'C', { power: 50 }),
                    card('2C', 'C', { power: 50 }),
                    card('3C', 'C', { power: 10 }),
                ],
            },
            turnOrder: ['alice', 'bob', 'carol'],
            currentTurnIndex: 0,
            hostId: 'alice',
        });

        function playRound(currentState: typeof ready) {
            const afterSelect = reduce(
                currentState,
                {
                    type: 'round.selectAttribute',
                    playerId: currentState.turnOrder[currentState.currentTurnIndex]!,
                    attribute: 'power',
                },
                ctx(),
            ).state;
            let running = afterSelect;
            for (const playerId of afterSelect.round!.playOrder) {
                running = reduce(running, { type: 'round.playCard', playerId }, ctx()).state;
            }
            return running;
        }

        const afterRound1 = playRound(ready);
        expect(afterRound1.phase).toBe('AWAITING_ATTRIBUTE');
        expect(afterRound1.pot).toHaveLength(3);
        expect(afterRound1.turnOrder[afterRound1.currentTurnIndex]).toBe('alice');

        const afterRound2 = playRound(afterRound1);
        expect(afterRound2.phase).toBe('AWAITING_ATTRIBUTE');
        expect(afterRound2.pot).toHaveLength(6);
        expect(afterRound2.turnOrder[afterRound2.currentTurnIndex]).toBe('alice');

        const afterRound3 = playRound(afterRound2);
        expect(afterRound3.phase).toBe('FINISHED');
        expect(afterRound3.winnerId).toBe('alice');
        expect(afterRound3.piles.alice).toHaveLength(9);
        expect(afterRound3.pot).toHaveLength(0);
    });
});

describe('elimination mid-round', () => {
    it('eliminates every loser who just ran out of cards, in the same round', () => {
        const ready = state({
            phase: 'AWAITING_ATTRIBUTE',
            players: [
                player('alice', { joinOrder: 0, cardCount: 1 }),
                player('bob', { joinOrder: 1, cardCount: 1 }),
                player('carol', { joinOrder: 2, cardCount: 5 }),
            ],
            piles: {
                alice: [card('1A', 'A', { power: 1 })],
                bob: [card('1B', 'B', { power: 2 })],
                carol: [
                    card('1C', 'C', { power: 99 }),
                    card('2C', 'C', { power: 1 }),
                    card('3C', 'C', { power: 1 }),
                    card('4C', 'C', { power: 1 }),
                    card('5C', 'C', { power: 1 }),
                ],
            },
            turnOrder: ['alice', 'bob', 'carol'],
            currentTurnIndex: 2,
            hostId: 'alice',
        });

        const afterSelect = reduce(
            ready,
            { type: 'round.selectAttribute', playerId: 'carol', attribute: 'power' },
            ctx(),
        ).state;
        let running = afterSelect;
        for (const playerId of afterSelect.round!.playOrder) {
            running = reduce(running, { type: 'round.playCard', playerId }, ctx()).state;
        }

        expect(running.turnOrder).toEqual(['carol']);
        expect(running.phase).toBe('FINISHED');
        expect(running.winnerId).toBe('carol');
        expect(running.players.find((p) => p.id === 'alice')?.isEliminated).toBe(true);
        expect(running.players.find((p) => p.id === 'bob')?.isEliminated).toBe(true);
    });

    it('leaves a bystander (already eliminated, or a spectator who joined mid-match) untouched', () => {
        const ready = state({
            phase: 'AWAITING_ATTRIBUTE',
            players: [
                player('alice', { joinOrder: 0, cardCount: 1 }),
                player('bob', { joinOrder: 1, cardCount: 1 }),
                player('zed', {
                    joinOrder: 2,
                    isSpectator: true,
                    isEliminated: true,
                    eliminatedAt: 1,
                    cardCount: 0,
                }),
            ],
            piles: {
                alice: [card('1A', 'A', { power: 99 })],
                bob: [card('1B', 'B', { power: 1 })],
                zed: [],
            },
            turnOrder: ['alice', 'bob'],
            currentTurnIndex: 0,
            hostId: 'alice',
        });

        const afterSelect = reduce(
            ready,
            { type: 'round.selectAttribute', playerId: 'alice', attribute: 'power' },
            ctx(),
        ).state;
        let running = afterSelect;
        for (const playerId of afterSelect.round!.playOrder) {
            running = reduce(running, { type: 'round.playCard', playerId }, ctx()).state;
        }

        const zed = running.players.find((p) => p.id === 'zed');
        expect(zed).toEqual(ready.players.find((p) => p.id === 'zed'));
    });
});

describe('turn timeout policies', () => {
    function readyWithTimeout(policy: 'random_attr' | 'highest_attr' | 'skip') {
        return state({
            phase: 'AWAITING_ATTRIBUTE',
            config: config({ turnTimeoutMs: 10_000, onTurnTimeout: policy }),
            players: [
                player('alice', { joinOrder: 0, cardCount: 1 }),
                player('bob', { joinOrder: 1, cardCount: 1 }),
            ],
            piles: {
                alice: [card('1A', 'A', { power: 10, speed: 90 })],
                bob: [card('1B', 'B', { power: 20, speed: 5 })],
            },
            turnOrder: ['alice', 'bob'],
            currentTurnIndex: 0,
            turnDeadline: 10_000,
            hostId: 'alice',
        });
    }

    it('does nothing before the deadline', () => {
        const ready = readyWithTimeout('skip');
        const { state: next, events } = reduce(ready, { type: 'system.tick' }, ctx(5_000));

        expect(next).toBe(ready);
        expect(events).toEqual([]);
    });

    it('"skip" passes leadership to the next player without starting a round', () => {
        const ready = readyWithTimeout('skip');
        const { state: next } = reduce(ready, { type: 'system.tick' }, ctx(10_000));

        expect(next.phase).toBe('AWAITING_ATTRIBUTE');
        expect(next.round).toBeNull();
        expect(next.turnOrder[next.currentTurnIndex]).toBe('bob');
    });

    it('"highest_attr" picks the leader’s own best stat and starts the round', () => {
        const ready = readyWithTimeout('highest_attr');
        const { state: next, events } = reduce(ready, { type: 'system.tick' }, ctx(10_000));

        expect(next.round?.attribute).toBe('speed'); // alice: power=10, speed=90
        expect(next.phase).toBe('AWAITING_CARDS');
        expect(events.map((e) => e.type)).toEqual(['round.attributeSelected', 'round.started']);
    });

    it('"random_attr" deterministically picks one of the leader’s attributes', () => {
        const ready = readyWithTimeout('random_attr');
        const { state: next } = reduce(ready, { type: 'system.tick' }, ctx(10_000));

        expect(['power', 'speed']).toContain(next.round?.attribute);
        expect(next.phase).toBe('AWAITING_CARDS');
    });

    it('a card-play timeout auto-plays the pending player’s only card', () => {
        const afterSelect = reduce(
            readyWithTimeout('skip'),
            { type: 'round.selectAttribute', playerId: 'alice', attribute: 'power' },
            ctx(0),
        ).state;
        // Alice (the leader) already played her card - only bob is still pending when the
        // card-play deadline hits.
        const afterAlicePlays = reduce(
            afterSelect,
            { type: 'round.playCard', playerId: 'alice' },
            ctx(1),
        ).state;

        const { events } = reduce(afterAlicePlays, { type: 'system.tick' }, ctx(20_000));

        expect(events.some((e) => e.type === 'round.cardPlayed' && e.playerId === 'bob')).toBe(
            true,
        );
    });
});

describe('match finished by matchDurationMs', () => {
    it('declares the player with the most cards the winner', () => {
        const ongoing = state({
            phase: 'AWAITING_ATTRIBUTE',
            config: config({ matchDurationMs: 60_000 }),
            players: [
                player('alice', { joinOrder: 0, cardCount: 6 }),
                player('bob', { joinOrder: 1, cardCount: 2 }),
            ],
            piles: {
                alice: Array(6).fill(card('1A', 'A', { power: 1 })),
                bob: Array(2).fill(card('1B', 'B', { power: 1 })),
            },
            turnOrder: ['alice', 'bob'],
            startedAt: 0,
            endsAt: 60_000,
        });

        const { state: finished, events } = reduce(ongoing, { type: 'system.tick' }, ctx(60_000));

        expect(finished.phase).toBe('FINISHED');
        expect(finished.winnerId).toBe('alice');
        expect(finished.isDraw).toBe(false);
        expect(events).toEqual([
            {
                type: 'match.finished',
                standings: expect.any(Array),
                winnerId: 'alice',
                isDraw: false,
            },
        ]);
    });

    it('declares a draw on a tied card count', () => {
        const ongoing = state({
            phase: 'AWAITING_ATTRIBUTE',
            config: config({ matchDurationMs: 60_000 }),
            players: [
                player('alice', { joinOrder: 0, cardCount: 4 }),
                player('bob', { joinOrder: 1, cardCount: 4 }),
            ],
            piles: {
                alice: Array(4).fill(card('1A', 'A', { power: 1 })),
                bob: Array(4).fill(card('1B', 'B', { power: 1 })),
            },
            turnOrder: ['alice', 'bob'],
            startedAt: 0,
            endsAt: 60_000,
        });

        const { state: finished } = reduce(
            ongoing,
            { type: 'round.playCard', playerId: 'alice' },
            ctx(60_000),
        );

        expect(finished.phase).toBe('FINISHED');
        expect(finished.winnerId).toBeNull();
        expect(finished.isDraw).toBe(true);
    });

    it('preempts whatever action was requested once time is up', () => {
        const ongoing = state({
            phase: 'AWAITING_ATTRIBUTE',
            config: config({ matchDurationMs: 60_000 }),
            players: [player('alice', { joinOrder: 0, cardCount: 3 })],
            piles: { alice: Array(3).fill(card('1A', 'A', { power: 1 })) },
            turnOrder: ['alice'],
            startedAt: 0,
            endsAt: 60_000,
        });

        const { state: finished } = reduce(
            ongoing,
            { type: 'round.selectAttribute', playerId: 'alice', attribute: 'power' },
            ctx(60_000),
        );

        expect(finished.phase).toBe('FINISHED');
    });
});

describe('countdown', () => {
    const deck = [card('1A', 'A', { power: 1 }), card('1B', 'B', { power: 2 })];

    it('begins a countdown carrying the pre-built deck', () => {
        const lobby = state({ players: [player('alice')], hostId: 'alice' });

        const { state: next, events } = reduce(
            lobby,
            { type: 'match.beginCountdown', deck },
            ctx(1_000),
        );

        expect(next.phase).toBe('COUNTDOWN');
        expect(next.countdownEndsAt).toBe(1_000 + next.config.autoStartCountdownMs);
        expect(next.pendingDeck).toEqual(deck);
        expect(events).toEqual([{ type: 'match.countdownStarted', endsAt: next.countdownEndsAt }]);
    });

    it('lets the host cancel, returning to LOBBY', () => {
        const counting = state({
            phase: 'COUNTDOWN',
            players: [player('alice')],
            hostId: 'alice',
            countdownEndsAt: 5_000,
            pendingDeck: deck,
        });

        const { state: next } = reduce(
            counting,
            { type: 'match.cancelCountdown', playerId: 'alice' },
            ctx(1_000),
        );

        expect(next.phase).toBe('LOBBY');
        expect(next.pendingDeck).toBeNull();
    });

    it('rejects a non-host cancelling', () => {
        const counting = state({
            phase: 'COUNTDOWN',
            players: [player('alice'), player('bob', { joinOrder: 1 })],
            hostId: 'alice',
            countdownEndsAt: 5_000,
            pendingDeck: deck,
        });

        const result = reduce(
            counting,
            { type: 'match.cancelCountdown', playerId: 'bob' },
            ctx(1_000),
        );

        expect(result.events[0]).toMatchObject({ type: 'error', code: 'ERR_NOT_HOST' });
    });

    it('deals and starts once the countdown elapses', () => {
        const counting = state({
            phase: 'COUNTDOWN',
            config: config({
                minPlayers: 2,
                maxPlayers: 2,
                autoStartPlayers: 2,
                packs: 1,
                cardsPerPack: 2,
            }),
            players: [player('alice', { joinOrder: 0 }), player('bob', { joinOrder: 1 })],
            hostId: 'alice',
            countdownEndsAt: 5_000,
            pendingDeck: deck,
        });

        const { state: next, events } = reduce(counting, { type: 'system.tick' }, ctx(5_000));

        expect(next.phase).toBe('AWAITING_ATTRIBUTE');
        expect(Object.values(next.piles).flat()).toHaveLength(2);
        expect(events).toEqual([{ type: 'match.started' }]);
    });
});

describe('player.leave', () => {
    it('removes the player entirely while in LOBBY, promoting a new host if needed', () => {
        const lobby = state({
            players: [player('alice', { joinOrder: 0 }), player('bob', { joinOrder: 1 })],
            hostId: 'alice',
        });

        const { state: next } = reduce(lobby, { type: 'player.leave', playerId: 'alice' }, ctx());

        expect(next.players.map((p) => p.id)).toEqual(['bob']);
        expect(next.hostId).toBe('bob');
    });

    it('eliminates a player who leaves mid-match', () => {
        const ongoing = state({
            phase: 'AWAITING_ATTRIBUTE',
            players: [
                player('alice', { joinOrder: 0, cardCount: 2 }),
                player('bob', { joinOrder: 1, cardCount: 2 }),
                player('carol', { joinOrder: 2, cardCount: 2 }),
            ],
            piles: {
                alice: [card('1A', 'A', {}), card('2A', 'A', {})],
                bob: [card('1B', 'B', {}), card('2B', 'B', {})],
                carol: [card('1C', 'C', {}), card('2C', 'C', {})],
            },
            turnOrder: ['alice', 'bob', 'carol'],
            currentTurnIndex: 0,
        });

        const { state: next } = reduce(
            ongoing,
            { type: 'player.leave', playerId: 'bob' },
            ctx(500),
        );

        const bob = next.players.find((p) => p.id === 'bob');
        expect(bob?.isEliminated).toBe(true);
        expect(bob?.cardCount).toBe(0);
        expect(next.turnOrder).toEqual(['alice', 'carol']);
    });

    it('hands leadership to the next player if the leaving player was the current leader', () => {
        const ongoing = state({
            phase: 'AWAITING_ATTRIBUTE',
            players: [
                player('alice', { joinOrder: 0, cardCount: 2 }),
                player('bob', { joinOrder: 1, cardCount: 2 }),
                player('carol', { joinOrder: 2, cardCount: 2 }),
            ],
            piles: {
                alice: [card('1A', 'A', {}), card('2A', 'A', {})],
                bob: [card('1B', 'B', {}), card('2B', 'B', {})],
                carol: [card('1C', 'C', {}), card('2C', 'C', {})],
            },
            turnOrder: ['alice', 'bob', 'carol'],
            currentTurnIndex: 0,
        });

        const { state: next } = reduce(
            ongoing,
            { type: 'player.leave', playerId: 'alice' },
            ctx(500),
        );

        expect(next.turnOrder[next.currentTurnIndex]).toBe('bob');
    });
});

describe('a full match is reproducible given the same seed', () => {
    it('produces byte-for-byte identical final states across two independent runs', () => {
        const deck = [
            card('1A', 'A', { power: 10 }),
            card('2A', 'A', { power: 90 }),
            card('1B', 'B', { power: 40 }),
            card('2B', 'B', { power: 60 }),
        ];

        function playFullMatch() {
            let current = createMatch(
                config({
                    minPlayers: 2,
                    maxPlayers: 2,
                    autoStartPlayers: 2,
                    packs: 2,
                    cardsPerPack: 2,
                    seed: 'reproducible',
                }),
                {
                    matchId: 'm1',
                    code: 'ABC123',
                    now: 0,
                },
            );

            current = reduce(
                current,
                { type: 'player.join', playerId: 'alice', nickname: 'Alice', avatarSeed: 'a' },
                ctx(1),
            ).state;
            current = reduce(
                current,
                { type: 'player.join', playerId: 'bob', nickname: 'Bob', avatarSeed: 'b' },
                ctx(2),
            ).state;
            current = reduce(
                current,
                { type: 'match.start', playerId: 'alice', deck },
                ctx(3),
            ).state;

            // Play rounds until the match finishes (bounded loop - a 4-card, 2-player deck can
            // never take more than 2 rounds to resolve to a winner, ties included).
            for (let i = 0; i < 10 && current.phase !== 'FINISHED'; i++) {
                if (current.phase === 'AWAITING_ATTRIBUTE') {
                    const leaderId = current.turnOrder[current.currentTurnIndex]!;
                    const topCard = current.piles[leaderId]![0]!;
                    const [attribute] = Object.keys(topCard.stats);
                    current = reduce(
                        current,
                        {
                            type: 'round.selectAttribute',
                            playerId: leaderId,
                            attribute: attribute!,
                        },
                        ctx(10 + i),
                    ).state;
                } else if (current.phase === 'AWAITING_CARDS') {
                    const nextPlayerId = current.round!.playOrder.find(
                        (id) => current.round!.playedCards[id] === undefined,
                    )!;
                    current = reduce(
                        current,
                        { type: 'round.playCard', playerId: nextPlayerId },
                        ctx(10 + i),
                    ).state;
                }
            }

            return current;
        }

        const runA = playFullMatch();
        const runB = playFullMatch();

        expect(runA).toEqual(runB);
        expect(runA.phase).toBe('FINISHED');
    });
});
