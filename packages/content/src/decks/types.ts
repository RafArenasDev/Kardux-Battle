import type { AttributeDef, DeckSourceId } from '@kardux/contracts';
import type { Palette } from '../art.js';
import type { IconName } from '../icons.generated.js';

/** Every player-facing string ships in both supported languages. */
export interface LocalizedText {
    es: string;
    en: string;
}

export type Locale = keyof LocalizedText;

export interface DeckAttribute extends Omit<AttributeDef, 'label'> {
    label: LocalizedText;
    icon: IconName;
}

export interface DeckMember {
    name: LocalizedText;
    /** Values for every deck attribute key. Omitted for invented creatures, whose stats are
     *  derived deterministically from the family profile instead. */
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
    label: LocalizedText;
    icon: IconName;
    palette: Palette;
    /** Ink color for the art glyph (dark on light paper for playing cards). */
    ink?: string;
    /** Base 1-99 value per attribute for families without explicit member `stats`. */
    profile?: Record<string, number>;
    members: readonly DeckMember[];
}

export interface DeckDefinition {
    id: DeckSourceId;
    label: LocalizedText;
    tagline: LocalizedText;
    description: LocalizedText;
    coverIcon: IconName;
    accent: string;
    /** Ordered by priority: a match with `attributeCount: n` uses the first `n`. */
    attributes: readonly DeckAttribute[];
    families: readonly DeckFamily[];
}

/** A fully resolved entity, before the deck builder stamps its `<pack><letter>` code. */
export interface DeckEntity {
    id: string;
    familyKey: string;
    name: string;
    nameEn: string;
    imageUrl: string;
    stats: Record<string, number>;
}

/** Helper for the bundled deck files: `[es, en]` pairs read better in long tables. */
export function text(es: string, en: string): LocalizedText {
    return { es, en };
}
