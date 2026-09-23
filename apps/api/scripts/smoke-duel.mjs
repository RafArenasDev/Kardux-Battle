// Smoke test against a running local API: two guests quick-match, the leader picks an
// attribute, and we check the leader's card was laid down automatically.
// Usage: node apps/api/scripts/smoke-duel.mjs
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3000';

async function guest() {
    const tabId = randomUUID();
    const response = await fetch(`${API}/auth/guest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
        body: JSON.stringify({ tabId }),
    });
    const auth = await response.json();
    const socket = io(`${API}/game`, {
        auth: { token: auth.token, tabId },
        transports: ['websocket'],
        extraHeaders: { origin: 'http://localhost:5173' },
    });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
    });
    const player = { auth, socket, state: null, errors: [] };
    socket.on('match:state', (state) => (player.state = state));
    socket.on('error', (error) => player.errors.push(error));
    return player;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const a = await guest();
const b = await guest();
const ackA = await a.socket.timeout(5000).emitWithAck('match:quick', {});
const ackB = await b.socket.timeout(5000).emitWithAck('match:quick', {});
console.log('same match:', ackA.matchId === ackB.matchId, ackA.code);

// autoStartCountdownMs is 4s for quick matches.
await wait(5500);
const state = a.state;
console.log('phase:', state.phase, 'cards:', state.players.map((p) => p.cardCount).join(' vs '));

const leaderId = state.turnOrder[state.currentTurnIndex];
const leader = leaderId === a.state.yourId ? a : b;
const attribute = Object.keys(leader.state.yourTopCard.stats)[0];
leader.socket.emit('round:selectAttribute', { attribute });
await wait(800);

console.log('after select - phase:', leader.state.phase, 'playedBy:', leader.state.round?.playedBy);
console.log(
    'leader auto-played:',
    leader.state.round?.playedBy.includes(leaderId) ?? 'round resolved',
);
console.log('errors:', JSON.stringify([...a.errors, ...b.errors]));

a.socket.emit('match:leave');
b.socket.emit('match:leave');
await wait(300);
process.exit(0);
