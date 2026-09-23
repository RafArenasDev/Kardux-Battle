import { describe, expect, it } from 'vitest';
import {
    matchJoinApprovedPayloadSchema,
    matchJoinRejectedPayloadSchema,
    matchJoinRequestedPayloadSchema,
    matchJoinRequestPendingPayloadSchema,
    matchRequestJoinPayloadSchema,
    matchRespondJoinPayloadSchema,
} from './socket-events.js';

describe('matchRequestJoinPayloadSchema', () => {
    const valid = { matchId: 'match_1', nickname: 'Ash', avatarSeed: 'ash-1' };

    it('accepts a well-formed request', () => {
        expect(matchRequestJoinPayloadSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects a missing matchId', () => {
        const { matchId: _matchId, ...withoutMatchId } = valid;

        expect(matchRequestJoinPayloadSchema.safeParse(withoutMatchId).success).toBe(false);
    });

    it('rejects a nickname over 24 characters', () => {
        const result = matchRequestJoinPayloadSchema.safeParse({
            ...valid,
            nickname: 'a'.repeat(25),
        });

        expect(result.success).toBe(false);
    });
});

describe('matchRespondJoinPayloadSchema', () => {
    it('accepts an accept response', () => {
        const result = matchRespondJoinPayloadSchema.safeParse({
            requestId: 'req_1',
            accept: true,
        });

        expect(result.success).toBe(true);
    });

    it('accepts a reject response', () => {
        const result = matchRespondJoinPayloadSchema.safeParse({
            requestId: 'req_1',
            accept: false,
        });

        expect(result.success).toBe(true);
    });

    it('rejects a missing accept flag', () => {
        const result = matchRespondJoinPayloadSchema.safeParse({ requestId: 'req_1' });

        expect(result.success).toBe(false);
    });
});

describe('matchJoinRequestedPayloadSchema', () => {
    it('accepts a well-formed payload', () => {
        const result = matchJoinRequestedPayloadSchema.safeParse({
            requestId: 'req_1',
            nickname: 'Ash',
            avatarSeed: 'ash-1',
        });

        expect(result.success).toBe(true);
    });
});

describe('matchJoinRequestPendingPayloadSchema', () => {
    it('accepts a well-formed payload', () => {
        expect(matchJoinRequestPendingPayloadSchema.safeParse({ requestId: 'req_1' }).success).toBe(
            true,
        );
    });
});

describe('matchJoinApprovedPayloadSchema', () => {
    it('accepts the match:join ack shape plus a requestId', () => {
        const result = matchJoinApprovedPayloadSchema.safeParse({
            requestId: 'req_1',
            code: 'A3F9C1',
            matchId: 'match_1',
            token: 'a.b.c',
            playerId: 'user_1:tab_1',
        });

        expect(result.success).toBe(true);
    });

    it('rejects a payload missing the ack fields', () => {
        const result = matchJoinApprovedPayloadSchema.safeParse({ requestId: 'req_1' });

        expect(result.success).toBe(false);
    });
});

describe('matchJoinRejectedPayloadSchema', () => {
    it('accepts a well-formed payload', () => {
        expect(matchJoinRejectedPayloadSchema.safeParse({ requestId: 'req_1' }).success).toBe(true);
    });
});
