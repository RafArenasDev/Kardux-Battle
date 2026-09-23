import { describe, expect, it } from 'vitest';
import { matchSummaryWithRoleSchema } from './match.js';

const validSummary = {
    matchId: 'match_1',
    code: 'A3F9C1',
    status: 'LOBBY' as const,
    config: {
        minPlayers: 2,
        maxPlayers: 7,
        autoStartPlayers: 7,
        autoStartCountdownMs: 5000,
        matchDurationMs: 3_600_000,
        turnTimeoutMs: 30_000,
        onTurnTimeout: 'random_attr' as const,
        packs: 4,
        cardsPerPack: 8,
        attributeCount: 4,
        deckSources: ['local'] as const,
        mixSources: false,
        allowSpectators: true,
        fillWithBots: false,
        visibility: 'public' as const,
    },
    hostId: 'user_1',
    hostNickname: 'Ash',
    hostAvatarUrl: 'https://api.dicebear.com/9.x/adventurer/svg?seed=ash-1',
    createdAt: '2026-09-21T00:00:00.000Z',
};

describe('matchSummaryWithRoleSchema', () => {
    it('accepts a summary tagged with the "admin" role', () => {
        const result = matchSummaryWithRoleSchema.safeParse({ ...validSummary, role: 'admin' });

        expect(result.success).toBe(true);
    });

    it('accepts a summary tagged with the "player" role', () => {
        const result = matchSummaryWithRoleSchema.safeParse({ ...validSummary, role: 'player' });

        expect(result.success).toBe(true);
    });

    it('rejects an unknown role', () => {
        const result = matchSummaryWithRoleSchema.safeParse({ ...validSummary, role: 'spectator' });

        expect(result.success).toBe(false);
    });

    it('rejects a summary missing the role', () => {
        const result = matchSummaryWithRoleSchema.safeParse(validSummary);

        expect(result.success).toBe(false);
    });
});
