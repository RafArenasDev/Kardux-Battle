import type { IconName } from '../icons.generated.js';
import type { DeckAttribute, DeckMember } from './types.js';
import { text } from './types.js';

/** The five engine specifications from the original SENASOFT brief, shared by the car and
 *  motorcycle decks: displacement, cylinders, horsepower, max RPM and weight. */
export const ENGINE_ATTRIBUTES: readonly DeckAttribute[] = [
    {
        key: 'potencia',
        label: text('Potencia', 'Power'),
        unit: 'hp',
        icon: 'lightning-helix',
        higherIsBetter: true,
    },
    {
        key: 'cilindraje',
        label: text('Cilindraje', 'Displacement'),
        unit: 'cc',
        icon: 'fuel-tank',
        higherIsBetter: true,
    },
    {
        key: 'revoluciones',
        label: text('Revoluciones', 'Max RPM'),
        unit: 'rpm',
        icon: 'speedometer',
        higherIsBetter: true,
    },
    {
        key: 'cilindros',
        label: text('Cilindros', 'Cylinders'),
        icon: 'dice-six-faces-five',
        higherIsBetter: true,
    },
    {
        key: 'peso',
        label: text('Peso', 'Weight'),
        unit: 'kg',
        icon: 'weight',
        higherIsBetter: true,
    },
];

/** One vehicle: `[cc, cylinders, hp, rpm, kg]`. */
export function vehicle(
    es: string,
    en: string,
    icon: IconName,
    [cilindraje, cilindros, potencia, revoluciones, peso]: [number, number, number, number, number],
): DeckMember {
    return {
        name: text(es, en),
        icon,
        stats: { potencia, cilindraje, revoluciones, cilindros, peso },
    };
}
