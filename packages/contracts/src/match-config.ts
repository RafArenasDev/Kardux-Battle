import { z } from 'zod';
import { deckSourceIdSchema } from './card.js';

/** What happens when a player lets their turn clock run out. */
export const TURN_TIMEOUT_POLICIES = ['random_attr', 'highest_attr', 'skip'] as const;
export type TurnTimeoutPolicy = (typeof TURN_TIMEOUT_POLICIES)[number];

/**
 * Everything a host can set from the lobby, per CLAUDE.md's "CONFIGURACIÓN DE PARTIDA"
 * section. Field-level bounds are enforced here; cross-field rules that need more than one
 * field at a time (autoStartPlayers vs. min/maxPlayers, deck size vs. player count, ...) are
 * enforced by `.superRefine` below so every rejection carries a specific, addressable path.
 */
export const matchConfigShape = {
    minPlayers: z.number().int().min(2).max(12).default(2),
    maxPlayers: z.number().int().min(2).max(12).default(7),
    autoStartPlayers: z.number().int().min(2).max(12).default(7),
    autoStartCountdownMs: z.number().int().min(0).default(5_000),
    matchDurationMs: z.number().int().min(0).default(3_600_000),
    turnTimeoutMs: z.number().int().min(0).default(30_000),
    onTurnTimeout: z.enum(TURN_TIMEOUT_POLICIES).default('random_attr'),
    packs: z.number().int().min(1).default(4),
    cardsPerPack: z.number().int().min(1).max(26).default(8),
    attributeCount: z.number().int().min(3).max(6).default(4),
    deckSources: z.array(deckSourceIdSchema).min(1).default(['local']),
    mixSources: z.boolean().default(false),
    allowSpectators: z.boolean().default(true),
    fillWithBots: z.boolean().default(false),
    visibility: z.enum(['public', 'private']).default('public'),
    seed: z.string().min(1).optional(),
};

export const matchConfigSchema = z.object(matchConfigShape).superRefine((config, ctx) => {
    if (config.minPlayers > config.maxPlayers) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['minPlayers'],
            message: 'minPlayers cannot be greater than maxPlayers.',
        });
    }

    if (
        config.autoStartPlayers < config.minPlayers ||
        config.autoStartPlayers > config.maxPlayers
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['autoStartPlayers'],
            message: 'autoStartPlayers must be between minPlayers and maxPlayers.',
        });
    }

    const totalCards = config.packs * config.cardsPerPack;

    if (totalCards < config.maxPlayers) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['packs'],
            message: `The deck (${totalCards} cards) is too small to deal at least one card to ${config.maxPlayers} players.`,
        });
    }

    if (!config.mixSources && config.deckSources.length > 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['deckSources'],
            message: 'Multiple deck sources require mixSources: true.',
        });
    }
});

export type MatchConfig = z.infer<typeof matchConfigSchema>;

/** Used by `match:config` (host editing an existing lobby): every field optional, but the
 *  *merged* result (existing config + patch) must still pass `matchConfigSchema` - that
 *  re-validation happens where the merge happens (the API layer / engine), not here. */
export const matchConfigPatchSchema = z.object(matchConfigShape).partial();
export type MatchConfigPatch = z.infer<typeof matchConfigPatchSchema>;
