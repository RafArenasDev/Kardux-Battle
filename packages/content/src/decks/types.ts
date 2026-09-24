import type { AttributeDef } from '@kardux/contracts';
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

/** One card-to-be from the synced pool, before the deck builder stamps its `<pack><letter>`
 *  code. Cards that share `familyKey` form a quartet. */
export interface DeckEntity {
    id: string;
    familyKey: string;
    name: string;
    nameEn: string;
    imageUrl: string;
    stats: Record<string, number>;
}

/** Helper for bilingual copy: `[es, en]` pairs read better in long tables. */
export function text(es: string, en: string): LocalizedText {
    return { es, en };
}
