import type { IconName } from '../icons.generated.js';
import type { DeckDefinition, DeckMember } from './types.js';

/** Real-world animal facts (rounded averages from public encyclopedic data - facts aren't
 *  copyrightable). `peligro` is a 1-10 game rating of how dangerous the animal is to humans. */
function animal(
    name: string,
    icon: IconName,
    [velocidad, peso, longevidad, longitud, peligro]: [number, number, number, number, number],
): DeckMember {
    return { name, icon, stats: { velocidad, peso, longevidad, longitud, peligro } };
}

export const FAUNA_DECK: DeckDefinition = {
    id: 'fauna',
    label: 'Fauna Salvaje',
    tagline: 'Datos reales del reino animal',
    description:
        'Velocidad, peso, longevidad y tamaño reales de los animales más impresionantes del planeta.',
    coverIcon: 'lion',
    accent: '#2dd4a7',
    attributes: [
        {
            key: 'velocidad',
            label: 'Velocidad',
            unit: 'km/h',
            icon: 'speedometer',
            higherIsBetter: true,
        },
        { key: 'peso', label: 'Peso', unit: 'kg', icon: 'weight', higherIsBetter: true },
        {
            key: 'longevidad',
            label: 'Longevidad',
            unit: 'años',
            icon: 'hourglass',
            higherIsBetter: true,
        },
        {
            key: 'longitud',
            label: 'Tamaño',
            unit: 'cm',
            icon: 'measure-tape',
            higherIsBetter: true,
        },
        { key: 'peligro', label: 'Peligro', unit: '/10', icon: 'fangs', higherIsBetter: true },
    ],
    families: [
        {
            key: 'sabana',
            label: 'Sabana',
            icon: 'lion',
            palette: { from: '#f0b54a', to: '#6b3a0c' },
            members: [
                animal('León', 'lion', [80, 190, 14, 250, 9]),
                animal('Elefante africano', 'elephant', [40, 6000, 65, 700, 8]),
                animal('Búfalo cafre', 'buffalo-head', [57, 750, 22, 340, 8]),
                animal('Avestruz', 'ostrich', [70, 120, 45, 250, 5]),
            ],
        },
        {
            key: 'oceano',
            label: 'Océano',
            icon: 'shark-jaws',
            palette: { from: '#4aa8ff', to: '#0a2352' },
            members: [
                animal('Tiburón blanco', 'shark-jaws', [56, 1100, 70, 460, 10]),
                animal('Cachalote', 'sperm-whale', [37, 41000, 70, 1600, 6]),
                animal('Delfín mular', 'dolphin', [35, 300, 45, 300, 2]),
                animal('Pulpo gigante', 'octopus', [25, 50, 4, 480, 3]),
            ],
        },
        {
            key: 'artico',
            label: 'Ártico',
            icon: 'polar-bear',
            palette: { from: '#bfe9ff', to: '#2a5373' },
            members: [
                animal('Oso polar', 'polar-bear', [40, 450, 25, 250, 9]),
                animal('Morsa', 'walrus-head', [35, 1200, 40, 330, 6]),
                animal('Pingüino emperador', 'penguin', [10, 35, 20, 120, 1]),
                animal('Zorro ártico', 'fox', [50, 5, 4, 85, 2]),
            ],
        },
        {
            key: 'selva',
            label: 'Selva',
            icon: 'tiger-head',
            palette: { from: '#5fd06b', to: '#0d3b17' },
            members: [
                animal('Tigre de Bengala', 'tiger-head', [65, 220, 15, 310, 10]),
                animal('Gorila de montaña', 'gorilla', [40, 180, 40, 175, 6]),
                animal('Cobra real', 'cobra', [20, 9, 20, 400, 9]),
                animal('Rana dardo dorada', 'frog', [1, 0.03, 10, 5, 8]),
            ],
        },
        {
            key: 'cielo',
            label: 'Cielo',
            icon: 'eagle-head',
            palette: { from: '#8ec5ff', to: '#2b2f7a' },
            members: [
                animal('Águila real', 'eagle-head', [240, 6, 30, 90, 5]),
                animal('Halcón peregrino', 'falcon-moon', [390, 1.2, 15, 45, 4]),
                animal('Cóndor andino', 'condor-emblem', [55, 13, 70, 130, 2]),
                animal('Búho real', 'owl', [65, 3, 20, 70, 3]),
            ],
        },
        {
            key: 'bosque',
            label: 'Bosque',
            icon: 'wolf-head',
            palette: { from: '#6cae75', to: '#1f3322' },
            members: [
                animal('Lobo gris', 'wolf-head', [60, 50, 13, 160, 7]),
                animal('Oso pardo', 'bear-head', [56, 400, 30, 250, 9]),
                animal('Ciervo rojo', 'deer-head', [70, 200, 18, 230, 3]),
                animal('Zorro rojo', 'fox-head', [50, 8, 5, 90, 2]),
            ],
        },
        {
            key: 'desierto',
            label: 'Desierto',
            icon: 'scorpion',
            palette: { from: '#f2c46d', to: '#7a3e12' },
            members: [
                animal('Camello', 'camel', [65, 600, 45, 300, 3]),
                animal('Escorpión amarillo', 'scorpion', [1, 0.003, 5, 10, 8]),
                animal('Serpiente de cascabel', 'rattlesnake', [3, 4, 20, 180, 8]),
                animal('Armadillo', 'armadillo', [48, 6, 15, 90, 1]),
            ],
        },
        {
            key: 'montana',
            label: 'Montaña',
            icon: 'ram',
            palette: { from: '#b9a794', to: '#3b2f28' },
            members: [
                animal('Bisonte', 'bison', [55, 900, 20, 350, 7]),
                animal('Cabra montés', 'goat', [40, 100, 17, 150, 3]),
                animal('Carnero cimarrón', 'ram', [48, 130, 12, 180, 4]),
                animal('Cuervo común', 'raven', [50, 1.2, 15, 65, 1]),
            ],
        },
        {
            key: 'oceania',
            label: 'Oceanía',
            icon: 'kangaroo',
            palette: { from: '#ff9a6b', to: '#6b1f12' },
            members: [
                animal('Canguro rojo', 'kangaroo', [70, 85, 22, 160, 4]),
                animal('Koala', 'koala', [30, 12, 15, 80, 1]),
                animal('Kiwi', 'kiwi-bird', [20, 3, 30, 50, 1]),
                animal('Cocodrilo marino', 'croc-jaws', [30, 1000, 70, 600, 10]),
            ],
        },
    ],
};
