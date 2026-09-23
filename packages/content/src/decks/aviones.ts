import type { IconName } from '../icons.generated.js';
import type { DeckDefinition, DeckMember } from './types.js';
import { text } from './types.js';

/** One aircraft: `[km/h, range km, ceiling m, max takeoff kg, seats]`. */
function aircraft(
    es: string,
    en: string,
    icon: IconName,
    [velocidad, alcance, techo, peso, capacidad]: [number, number, number, number, number],
): DeckMember {
    return { name: text(es, en), icon, stats: { velocidad, alcance, techo, peso, capacidad } };
}

/** Aircraft classes with realistic, rounded specs. Generic model names - no manufacturers. */
export const AVIONES_DECK: DeckDefinition = {
    id: 'aviones',
    label: text('Aviones', 'Aircraft'),
    tagline: text('Cazas, jumbos, drones y más', 'Fighters, jumbos, drones and more'),
    description: text(
        'Ocho clases de aeronaves comparadas por velocidad, alcance, techo de vuelo, peso de despegue y capacidad.',
        'Eight aircraft classes compared by speed, range, service ceiling, takeoff weight and seats.',
    ),
    coverIcon: 'jet-fighter',
    accent: '#6fd2ff',
    attributes: [
        {
            key: 'velocidad',
            label: text('Velocidad', 'Speed'),
            unit: 'km/h',
            icon: 'speedometer',
            higherIsBetter: true,
        },
        {
            key: 'alcance',
            label: text('Alcance', 'Range'),
            unit: 'km',
            icon: 'fuel-tank',
            higherIsBetter: true,
        },
        {
            key: 'techo',
            label: text('Techo de vuelo', 'Ceiling'),
            unit: 'm',
            icon: 'rocket-flight',
            higherIsBetter: true,
        },
        {
            key: 'peso',
            label: text('Peso', 'Weight'),
            unit: 'kg',
            icon: 'weight',
            higherIsBetter: true,
        },
        {
            key: 'capacidad',
            label: text('Capacidad', 'Seats'),
            unit: 'pers.',
            icon: 'plane-pilot',
            higherIsBetter: true,
        },
    ],
    families: [
        {
            key: 'cazas',
            label: text('Cazas', 'Fighters'),
            icon: 'jet-fighter',
            palette: { from: '#8aa0c8', to: '#141a2e' },
            members: [
                aircraft(
                    'Caza furtivo',
                    'Stealth Fighter',
                    'jet-fighter',
                    [2400, 2900, 20000, 38000, 1],
                ),
                aircraft(
                    'Interceptor',
                    'Interceptor',
                    'heavy-fighter',
                    [3000, 1900, 20000, 46000, 2],
                ),
                aircraft(
                    'Caza polivalente',
                    'Multirole Fighter',
                    'jet-fighter',
                    [2100, 3200, 15000, 21000, 1],
                ),
                aircraft(
                    'Caza ligero',
                    'Light Fighter',
                    'light-fighter',
                    [1900, 2000, 15000, 12000, 1],
                ),
            ],
        },
        {
            key: 'bombarderos',
            label: text('Bombarderos', 'Bombers'),
            icon: 'bomber',
            palette: { from: '#6b7280', to: '#111827' },
            members: [
                aircraft(
                    'Bombardero furtivo',
                    'Stealth Bomber',
                    'stealth-bomber',
                    [1010, 11000, 15000, 170000, 2],
                ),
                aircraft(
                    'Bombardero estratégico',
                    'Strategic Bomber',
                    'bomber',
                    [1000, 14000, 15000, 220000, 5],
                ),
                aircraft(
                    'Bombardero supersónico',
                    'Supersonic Bomber',
                    'bomber',
                    [1500, 9000, 18000, 216000, 4],
                ),
                aircraft(
                    'Bombardero medio',
                    'Medium Bomber',
                    'bomber',
                    [900, 5000, 13000, 90000, 4],
                ),
            ],
        },
        {
            key: 'comerciales',
            label: text('Aviones comerciales', 'Airliners'),
            icon: 'commercial-airplane',
            palette: { from: '#6fd2ff', to: '#123a6b' },
            members: [
                aircraft(
                    'Jumbo cuatrimotor',
                    'Four-engine Jumbo',
                    'commercial-airplane',
                    [988, 14800, 13000, 447000, 416],
                ),
                aircraft(
                    'Largo alcance',
                    'Long-haul Twin',
                    'commercial-airplane',
                    [950, 15600, 13000, 350000, 350],
                ),
                aircraft(
                    'Doble piso',
                    'Double-deck Giant',
                    'commercial-airplane',
                    [1020, 15000, 13000, 575000, 550],
                ),
                aircraft(
                    'Fuselaje estrecho',
                    'Narrow-body',
                    'commercial-airplane',
                    [840, 6500, 12500, 79000, 180],
                ),
            ],
        },
        {
            key: 'regionales',
            label: text('Regionales y ejecutivos', 'Regional & Business'),
            icon: 'airplane',
            palette: { from: '#35d9c4', to: '#07303a' },
            members: [
                aircraft(
                    'Jet regional',
                    'Regional Jet',
                    'airplane',
                    [870, 3700, 12500, 37000, 100],
                ),
                aircraft('Turbohélice', 'Turboprop', 'airplane', [510, 1500, 7600, 23000, 70]),
                aircraft(
                    'Jet ejecutivo',
                    'Business Jet',
                    'airplane',
                    [950, 12000, 15500, 45000, 19],
                ),
                aircraft('Avioneta', 'Light Aircraft', 'airplane', [230, 1200, 4200, 1100, 4]),
            ],
        },
        {
            key: 'historicos',
            label: text('Históricos', 'Vintage'),
            icon: 'biplane',
            palette: { from: '#f2c46d', to: '#6b3a0c' },
            members: [
                aircraft('Biplano', 'Biplane', 'biplane', [180, 500, 4000, 900, 2]),
                aircraft('Caza clásico', 'Classic Fighter', 'biplane', [700, 1600, 12000, 5000, 1]),
                aircraft('Hidroavión', 'Seaplane', 'airplane', [330, 4000, 6000, 15000, 20]),
                aircraft('Trimotor', 'Trimotor', 'biplane', [210, 900, 5000, 5700, 15]),
            ],
        },
        {
            key: 'helicopteros',
            label: text('Helicópteros', 'Helicopters'),
            icon: 'helicopter',
            palette: { from: '#9fd26a', to: '#1f3a10' },
            members: [
                aircraft(
                    'Helicóptero de ataque',
                    'Attack Helicopter',
                    'helicopter',
                    [290, 480, 6400, 10400, 2],
                ),
                aircraft(
                    'Helicóptero de carga',
                    'Heavy-lift Helicopter',
                    'helicopter',
                    [310, 740, 5600, 33000, 55],
                ),
                aircraft(
                    'Helicóptero de rescate',
                    'Rescue Helicopter',
                    'helicopter',
                    [280, 800, 5000, 11000, 20],
                ),
                aircraft(
                    'Helicóptero ligero',
                    'Light Helicopter',
                    'helicopter',
                    [260, 600, 4200, 1200, 5],
                ),
            ],
        },
        {
            key: 'planeadores',
            label: text('Aerostatos y planeadores', 'Airships & Gliders'),
            icon: 'zeppelin',
            palette: { from: '#c28bff', to: '#3d1670' },
            members: [
                aircraft('Dirigible', 'Airship', 'zeppelin', [125, 4000, 2000, 10000, 20]),
                aircraft('Planeador', 'Glider', 'glider', [250, 1000, 9000, 600, 2]),
                aircraft('Ala delta', 'Hang Glider', 'hang-glider', [80, 300, 4000, 120, 1]),
                aircraft('Paramotor', 'Paramotor', 'parachute', [60, 150, 3000, 150, 1]),
            ],
        },
        {
            key: 'drones',
            label: text('Drones', 'Drones'),
            icon: 'delivery-drone',
            palette: { from: '#ff6f91', to: '#6b0f2e' },
            members: [
                aircraft(
                    'Dron de reconocimiento',
                    'Recon Drone',
                    'delivery-drone',
                    [480, 1850, 15000, 4700, 0],
                ),
                aircraft(
                    'Dron de vigilancia',
                    'Surveillance Drone',
                    'delivery-drone',
                    [370, 1100, 7600, 2200, 0],
                ),
                aircraft('Dron de carga', 'Cargo Drone', 'delivery-drone', [100, 50, 500, 40, 0]),
                aircraft('Dron de carreras', 'Racing Drone', 'delivery-drone', [190, 5, 500, 1, 0]),
            ],
        },
    ],
};
