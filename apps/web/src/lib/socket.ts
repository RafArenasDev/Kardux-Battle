import type { ClientEvents, ServerEvents } from '@kardux/contracts';
import { type Socket, io } from 'socket.io-client';
import { API_BASE_URL } from './config';
import { getTabId, getToken } from './session';

export type GameSocket = Socket<ServerEvents, ClientEvents>;

let socket: GameSocket | undefined;

/** One shared `/game` socket per tab (`playerKey = userId:tabId`). A reload reconnects with
 *  the same token/tabId, which is what lets the server hand back the same seat. */
export function getGameSocket(): GameSocket {
    if (socket) return socket;

    socket = io(`${API_BASE_URL}/game`, {
        autoConnect: false,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 500,
        reconnectionDelayMax: 4_000,
        auth: (cb) => cb({ token: getToken(), tabId: getTabId() }),
    });
    return socket;
}

export function connectGameSocket(): GameSocket {
    const gameSocket = getGameSocket();
    if (!gameSocket.connected) gameSocket.connect();
    return gameSocket;
}

/** Resolves once connected (or immediately if already), rejects after `timeoutMs`. */
export function whenConnected(timeoutMs = 8_000): Promise<GameSocket> {
    const gameSocket = connectGameSocket();
    if (gameSocket.connected) return Promise.resolve(gameSocket);

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            gameSocket.off('connect', onConnect);
            reject(new Error('No se pudo conectar con el servidor de juego.'));
        }, timeoutMs);
        function onConnect(): void {
            clearTimeout(timer);
            resolve(gameSocket);
        }
        gameSocket.once('connect', onConnect);
    });
}

export function disconnectGameSocket(): void {
    socket?.disconnect();
    socket = undefined;
}
