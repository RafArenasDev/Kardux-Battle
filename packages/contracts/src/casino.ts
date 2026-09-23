import { z } from 'zod';
import type { errorPayloadSchema } from './errors.js';

/** Casino games live on their own Socket.IO namespace, `/casino`. */
export const CASINO_GAMES = ['blackjack', 'holdem'] as const;
export type CasinoGame = (typeof CASINO_GAMES)[number];

export const CASINO_TIERS = ['bronze', 'silver', 'gold'] as const;
export type CasinoTier = (typeof CASINO_TIERS)[number];

export const casinoJoinPayloadSchema = z.object({
    game: z.enum(CASINO_GAMES).describe('Which table to sit at.'),
    tier: z.enum(CASINO_TIERS).describe('Stake level: minimum/maximum bet and blinds.'),
});
export type CasinoJoinPayload = z.infer<typeof casinoJoinPayloadSchema>;

export const casinoActionPayloadSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('bet'), amount: z.number().int().min(0) }),
    z.object({ action: z.literal('raise'), to: z.number().int().positive() }),
    z.object({
        action: z.enum(['hit', 'stand', 'double', 'split', 'fold', 'check', 'call', 'allIn']),
    }),
]);
export type CasinoActionPayload = z.infer<typeof casinoActionPayloadSchema>;

export const casinoJoinAckSchema = z.object({
    tableId: z.string().min(1),
    game: z.enum(CASINO_GAMES),
    tier: z.enum(CASINO_TIERS),
});
export type CasinoJoinAck = z.infer<typeof casinoJoinAckSchema>;

export const casinoWalletSchema = z.object({
    coins: z.number().int().min(0).describe('Virtual chips available (no real-money value).'),
    canRefill: z.boolean().describe('True when the balance is low enough to claim a refill.'),
});
export type CasinoWallet = z.infer<typeof casinoWalletSchema>;

type CasinoAck<T> = T | z.infer<typeof errorPayloadSchema>;

export interface CasinoClientEvents {
    'casino:join': (
        payload: CasinoJoinPayload,
        ack: (response: CasinoAck<CasinoJoinAck>) => void,
    ) => void;
    'casino:action': (payload: CasinoActionPayload) => void;
    'casino:leave': () => void;
}

/** Table views are the redacted engine states from `@kardux/casino-engine`. */
export interface CasinoServerEvents {
    'casino:state': (view: unknown) => void;
    /** One-off moments for animations: a hand won, chips paid out, a new street. */
    'casino:event': (event: { type: string; [key: string]: unknown }) => void;
    'casino:wallet': (wallet: CasinoWallet) => void;
    error: (payload: z.infer<typeof errorPayloadSchema>) => void;
}
