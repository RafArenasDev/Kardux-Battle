// Smoke test against a running local API with three existing accounts: a private Pokémon room
// for 3, auto-start, two full rounds, then one player leaves mid-match (their cards are shared
// out and the match goes on) and a second one leaves (the last player standing wins). Finally
// checks that the ranking was updated.
//
//   SMOKE_ACCOUNTS="host:pass,rival1:pass,rival2:pass" node apps/api/scripts/smoke-table.mjs
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3000';
const headers = { 'content-type': 'application/json', origin: 'http://localhost:5173' };
const credentials = (process.env.SMOKE_ACCOUNTS ?? '')
    .split(',')
    .map((pair) => pair.split(':'))
    .filter((pair) => pair.length === 2);

if (credentials.length !== 3) {
    console.error('Set SMOKE_ACCOUNTS="user:pass,user:pass,user:pass" (three existing accounts).');
    process.exit(1);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(condition, message) {
    console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`);
    if (!condition) process.exitCode = 1;
}

async function call(path, { method = 'GET', body, token } = {}) {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
}

async function login(username, password) {
    const tabId = randomUUID();
    const { data } = await call('/auth/login', {
        method: 'POST',
        body: { username, password, tabId },
    });
    const socket = io(`${API}/game`, {
        auth: { token: data.token, tabId },
        transports: ['websocket'],
        extraHeaders: { origin: 'http://localhost:5173' },
    });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
    });
    const player = { username, token: data.token, userId: data.user.id, socket, state: null };
    socket.on('match:state', (state) => (player.state = state));
    socket.on('error', (error) => console.log(`  [${username}] error`, error.code));
    return player;
}

function once(socket, event, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`timeout waiting for ${event}`)),
            timeoutMs,
        );
        socket.once(event, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
}

const players = [];
for (const [username, password] of credentials) players.push(await login(username, password));
const [host, second, third] = players;

const leaderboardBefore = (await call('/leaderboard', { token: host.token })).data.entries;
const eloOf = (entries, userId) => entries.find((entry) => entry.userId === userId)?.elo ?? 1200;

const created = await call('/matches', {
    method: 'POST',
    token: host.token,
    body: {
        deckSources: ['pokeapi'],
        packs: 4,
        cardsPerPack: 8,
        attributeCount: 4,
        minPlayers: 2,
        maxPlayers: 3,
        autoStartPlayers: 3,
        autoStartCountdownMs: 1_000,
        turnTimeoutMs: 0,
        matchDurationMs: 0,
    },
});
check(created.status === 201, `private room created (${created.data.code})`);

const started = once(host.socket, 'match:started');
for (const player of players) {
    const ack = await player.socket.emitWithAck('match:join', {
        code: created.data.code,
        nickname: player.username,
        avatarSeed: 'visored-helm:gold',
    });
    check(!ack.code?.startsWith?.('ERR_'), `${player.username} joined`);
}
await started;
await wait(300);
const dealt = host.state.players.map((player) => player.cardCount);
check(
    dealt.every((count) => count === 10) && host.state.undealtCount === 2,
    `32 cards: 10 each and 2 out of play (${dealt.join('/')}, deck ${host.state.undealtCount})`,
);

async function playRound() {
    const state = host.state;
    const leaderId = state.turnOrder[state.currentTurnIndex];
    const leader = players.find((player) => leaderId.startsWith(`${player.userId}:`));
    // The turn opens only after the deal/reveal plays out at the table.
    await wait(Math.max(0, state.turnOpensAt - Date.now()) + 100);
    const resolved = once(host.socket, 'round:resolved');
    leader.socket.emit('round:selectAttribute', { attribute: 'attack' });
    const result = await resolved;
    await wait(400);
    return result;
}

for (let round = 1; round <= 2; round++) {
    const result = await playRound();
    const total = host.state.players.reduce((sum, player) => sum + player.cardCount, 0);
    check(
        total + host.state.potSize === 30,
        `round ${round}: ${result.isTie ? 'tie' : 'winner'} - 30 cards still in play`,
    );
}

// Third player walks away mid-match: the match goes on, their cards are shared out.
await wait(Math.max(0, host.state.turnOpensAt - Date.now()) + 100);
third.socket.emit('match:leave');
await wait(800);
const leaver = host.state.players.find((player) => player.id.startsWith(`${third.userId}:`));
const inPlay = host.state.players.reduce((sum, player) => sum + player.cardCount, 0);
check(leaver?.hasLeft && leaver.cardCount === 0, 'leaver finishes with 0 cards');
check(host.state.phase !== 'FINISHED', 'with 2 players left the match goes on');
check(inPlay + host.state.potSize === 30, 'the leaver cards were shared out (none lost)');

// Second player leaves too: last one standing wins the duel.
const finished = once(host.socket, 'match:finished');
second.socket.emit('match:leave');
const result = await finished;
check(result.winnerId?.startsWith(`${host.userId}:`), 'the player who stayed wins');
check(
    result.standings[0].cardCount === 30 - host.state.potSize || result.standings[0].cardCount > 0,
    `winner holds ${result.standings[0].cardCount} cards`,
);

await wait(800);
const leaderboardAfter = (await call('/leaderboard', { token: host.token })).data.entries;
check(
    eloOf(leaderboardAfter, host.userId) > eloOf(leaderboardBefore, host.userId),
    'winner gains points',
);
check(
    eloOf(leaderboardAfter, third.userId) < eloOf(leaderboardBefore, third.userId),
    'first leaver loses points',
);

for (const player of players) player.socket.disconnect();
