import { describe, expect, it } from 'vitest';
import { guestAuthRequestSchema, guestAuthResponseSchema } from './auth.js';

// A guest request carries only `tabId`: nickname and avatar are always generated server-side.
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
