import { describe, expect, it } from 'vitest';
import { guestAuthRequestSchema, guestAuthResponseSchema } from './auth.js';

// `guestAuthRequestSchema` only ever asked for `tabId` (2026-09-22 decision: nickname/avatar
// are always server-generated for a guest, never client-supplied - see `auth.ts`'s own
// docblock). These cases used to also assert on a client-supplied `nickname` field that this
// schema has never actually had since that redesign landed.
describe('guestAuthRequestSchema', () => {
    const valid = {
        tabId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    };

    it('accepts a well-formed request', () => {
        expect(guestAuthRequestSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects a non-UUID tabId', () => {
        const result = guestAuthRequestSchema.safeParse({ ...valid, tabId: 'not-a-uuid' });

        expect(result.success).toBe(false);
    });

    it('rejects a missing tabId', () => {
        const result = guestAuthRequestSchema.safeParse({});

        expect(result.success).toBe(false);
    });
});

describe('guestAuthResponseSchema', () => {
    it('accepts a well-formed response', () => {
        const result = guestAuthResponseSchema.safeParse({
            token: 'a.b.c',
            user: {
                id: 'user_1',
                nickname: 'Ash',
                avatarSeed: 'ash-1',
                avatarUrl: 'https://api.dicebear.com/9.x/adventurer/svg?seed=ash-1',
            },
        });

        expect(result.success).toBe(true);
    });

    it('rejects a missing token', () => {
        const result = guestAuthResponseSchema.safeParse({
            user: {
                id: 'user_1',
                nickname: 'Ash',
                avatarSeed: 'ash-1',
                avatarUrl: 'https://api.dicebear.com/9.x/adventurer/svg?seed=ash-1',
            },
        });

        expect(result.success).toBe(false);
    });
});
