// Smoke test against a running local API: two registered accounts, a private Pokémon room
// joined by code, host start, one full round. Usage: node apps/api/scripts/smoke-private.mjs
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3000';
const headers = { 'content-type': 'application/json', origin: 'http://localhost:5173' };
const suffix = Date.now().toString(36).slice(-5);

async function call(path, { method = 'GET', body, token } = {}) {
    const response = await fetch(`${API}${path}`, {
        method,
        headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
}

async function account(name, avatarSeed) {
    const tabId = randomUUID();
    const password = `Smoke-${randomUUID()}`;
    const registered = await call('/auth/register', {
        method: 'POST',
        body: { username: name, password, tabId, avatarSeed },
    });
    console.log(`register ${name}:`, registered.status, 'avatar', registered.data.user.avatarSeed);
    const loggedIn = await call('/auth/login', {
        method: 'POST',
        body: { username: name, password, tabId },
    });
    console.log(`login ${name}:`, loggedIn.status);
    const socket = io(`${API}/game`, {
        auth: { token: loggedIn.data.token, tabId },
        transports: ['websocket'],
        extraHeaders: { origin: 'http://localhost:5173' },
    });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
    });
    const player = { token: loggedIn.data.token, socket, state: null, events: [] };
    socket.on('match:state', (state) => (player.state = state));
    for (const event of ['match:started', 'round:revealed', 'round:resolved', 'error']) {
        socket.on(event, (payload) => player.events.push({ event, payload }));
    }
    return player;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const host = await account(`smoke_host_${suffix}`, 'samurai-helmet:ember');
const guest = await account(`smoke_rival_${suffix}`, 'woman-elf-face:ice');

const created = await call('/matches', {
    method: 'POST',
    token: host.token,
    body: {
        deckSources: ['pokeapi'],
        packs: 4,
        cardsPerPack: 8,
        attributeCount: 4,
        minPlayers: 2,
        maxPlayers: 4,
        autoStartPlayers: 4,
    },
});
console.log('create private:', created.status, created.data.code, created.data.config.visibility);

const hostMine = await call('/matches/mine', { token: host.token });
const rivalMine = await call('/matches/mine', { token: guest.token });
console.log(
    'host panel lists it:',
    hostMine.data.some((m) => m.code === created.data.code),
);
console.log(
    'rival panel lists it:',
    rivalMine.data.some((m) => m.code === created.data.code),
);

const joinHost = await host.socket
    .timeout(5000)
    .emitWithAck('match:join', { code: created.data.code, nickname: 'x', avatarSeed: 'x' });
const joinRival = await guest.socket
    .timeout(5000)
    .emitWithAck('match:join', { code: created.data.code, nickname: 'x', avatarSeed: 'x' });
console.log('both joined:', joinHost.matchId === joinRival.matchId);
await wait(300);
console.log('seated:', host.state.players.map((p) => `${p.nickname}(${p.avatarSeed})`).join(', '));

host.socket.emit('match:start');
await wait(800);
console.log(
    'phase:',
    host.state.phase,
    'cards:',
    host.state.players.map((p) => p.cardCount).join(' vs '),
);
console.log(
    'top card is Pokémon:',
    host.state.yourTopCard?.name,
    host.state.yourTopCard?.imageUrl.includes('PokeAPI'),
);

const leaderId = host.state.turnOrder[host.state.currentTurnIndex];
const leader = leaderId === host.state.yourId ? host : guest;
const other = leader === host ? guest : host;
leader.socket.emit('round:selectAttribute', { attribute: 'attack' });
await wait(400);
other.socket.emit('round:playCard');
await wait(600);
const resolved = host.events.find((e) => e.event === 'round:resolved');
console.log(
    'round resolved:',
    Boolean(resolved),
    'winner gets',
    resolved?.payload.potSize,
    'cards',
);
console.log('after round:', host.state.players.map((p) => p.cardCount).join(' vs '));
console.log(
    'errors:',
    JSON.stringify([...host.events, ...guest.events].filter((e) => e.event === 'error')),
);

host.socket.emit('match:leave');
guest.socket.emit('match:leave');
await wait(300);
process.exit(0);
