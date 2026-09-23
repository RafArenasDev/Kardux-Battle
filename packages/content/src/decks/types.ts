import type { AttributeDef, DeckSourceId } from '@kardux/contracts';
import type { Palette } from '../art.js';
import type { IconName } from '../icons.generated.js';

export interface DeckAttribute extends AttributeDef {
    icon: IconName;
}

export interface DeckMember {
    name: string;
    /** Real values for every deck attribute key. Omitted for invented creatures, whose stats
     *  are derived deterministically from the family profile instead. */
    stats?: Record<string, number>;
    /** Per-card glyph; falls back to the family icon. */
    icon?: IconName;
    /** Corner rank for playing cards ("A", "10", "K"). */
    rank?: string;
    /** Per-card glyph color (red/black suits); falls back to the family ink. */
    ink?: string;
}

/** One quartet family - every card sharing a quartet letter comes from the same family. */
export interface DeckFamily {
    key: string;
    label: string;
    icon: IconName;
    palette: Palette;
    /** Ink color for the art glyph (dark on light paper for playing cards). */
    ink?: string;
    /** Base 1-99 value per attribute for families without real `stats` on their members. */
    profile?: Record<string, number>;
    members: readonly DeckMember[];
}

export interface DeckDefinition {
    id: DeckSourceId;
    label: string;
    tagline: string;
    description: string;
    coverIcon: IconName;
    accent: string;
    /** Ordered by priority: a match with `attributeCount: n` uses the first `n`. */
    attributes: readonly DeckAttribute[];
    families: readonly DeckFamily[];
}

/** A fully resolved entity, before `DeckBuilder` stamps its `<pack><letter>` code. */
export interface DeckEntity {
    id: string;
    familyKey: string;
    name: string;
    imageUrl: string;
    stats: Record<string, number>;
}
