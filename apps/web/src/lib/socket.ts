import type { ClientEvents, ServerEvents } from '@kardux/contracts';
import { type Socket, io } from 'socket.io-client';
import { getTabId, getToken } from './session';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export type GameSocket = Socket<ServerEvents, ClientEvents>;

let socket: GameSocket | undefined;

/** One shared `/game` socket per tab, matching CLAUDE.md's `playerKey = userId:tabId` -
 *  reconnecting with the same `token`/`tabId` is what a page refresh should do, not a fresh
 *  identity. Connects lazily on first use, not at app boot, so a visitor who never leaves the
 *  auth screen never opens a socket. */
export function getGameSocket(): GameSocket {
    if (socket) return socket;

    socket = io(`${BASE_URL}/game`, {
        autoConnect: false,
        auth: { token: getToken(), tabId: getTabId() },
    });
    return socket;
}

export function connectGameSocket(): GameSocket {
    const gameSocket = getGameSocket();
    // Token may have changed (fresh login) since the socket instance was created - refresh
    // the handshake auth before every connect attempt.
    gameSocket.auth = { token: getToken(), tabId: getTabId() };
    if (!gameSocket.connected) gameSocket.connect();
    return gameSocket;
}

export function disconnectGameSocket(): void {
    socket?.disconnect();
    socket = undefined;
}
