import type { IconName } from '../icons.generated.js';
import type { DeckDefinition, DeckMember } from './types.js';

/**
 * Vehicles, like the original SENASOFT 2022 brief (cars, planes, trucks). Every model is a
 * generic class - no manufacturer or brand names, so there are no trademarks involved - with
 * realistic, rounded specifications. Aircraft/ships/trains express power as horsepower
 * equivalent so every card compares on the same scale.
 */
function machine(
    name: string,
    icon: IconName,
    [potencia, velocidad, peso, autonomia, capacidad]: [number, number, number, number, number],
): DeckMember {
    return { name, icon, stats: { potencia, velocidad, peso, autonomia, capacidad } };
}

export const MOTORES_DECK: DeckDefinition = {
    id: 'motores',
    label: 'Máquinas',
    tagline: 'Autos, motos, aviones y más',
    description:
        'Monoplazas, superbikes, cazas, trenes y buques: potencia, velocidad y peso de las máquinas más impresionantes.',
    coverIcon: 'race-car',
    accent: '#ff5d3b',
    attributes: [
        {
            key: 'potencia',
            label: 'Potencia',
            unit: 'hp',
            icon: 'lightning-helix',
            higherIsBetter: true,
        },
        {
            key: 'velocidad',
            label: 'Velocidad',
            unit: 'km/h',
            icon: 'speedometer',
            higherIsBetter: true,
        },
        { key: 'peso', label: 'Peso', unit: 'kg', icon: 'weight', higherIsBetter: true },
        {
            key: 'autonomia',
            label: 'Autonomía',
            unit: 'km',
            icon: 'fuel-tank',
            higherIsBetter: true,
        },
        { key: 'capacidad', label: 'Capacidad', unit: 'pers.', icon: 'bus', higherIsBetter: true },
    ],
    families: [
        {
            key: 'monoplazas',
            label: 'Monoplazas',
            icon: 'race-car',
            palette: { from: '#ff4b3a', to: '#4a0b0b' },
            members: [
                machine('Monoplaza Escarlata', 'race-car', [1000, 350, 798, 305, 1]),
                machine('Monoplaza Plata', 'race-car', [1020, 352, 798, 305, 1]),
                machine('Monoplaza Esmeralda', 'race-car', [960, 345, 798, 305, 1]),
                machine('Monoplaza Nocturno', 'race-car', [985, 348, 798, 305, 1]),
            ],
        },
        {
            key: 'superdeportivos',
            label: 'Superdeportivos',
            icon: 'speedometer',
            palette: { from: '#ffb43a', to: '#5a2a06' },
            members: [
                machine('Hiperdeportivo V12', 'speedometer', [1000, 350, 1500, 500, 2]),
                machine('Superdeportivo V8', 'speedometer', [720, 330, 1450, 550, 2]),
                machine('Gran Turismo', 'speedometer', [620, 315, 1800, 700, 4]),
                machine('Deportivo eléctrico', 'speedometer', [1020, 322, 2200, 600, 5]),
            ],
        },
        {
            key: 'motos',
            label: 'Motos',
            icon: 'full-motorcycle-helmet',
            palette: { from: '#35d9c4', to: '#07303a' },
            members: [
                machine('Superbike 1000', 'full-motorcycle-helmet', [215, 299, 200, 250, 2]),
                machine('Naked 900', 'full-motorcycle-helmet', [120, 240, 190, 300, 2]),
                machine('Trail aventura', 'full-motorcycle-helmet', [136, 220, 250, 450, 2]),
                machine('Scooter urbano', 'scooter', [15, 110, 140, 280, 2]),
            ],
        },
        {
            key: 'cazas',
            label: 'Cazas',
            icon: 'jet-fighter',
            palette: { from: '#8aa0c8', to: '#141a2e' },
            members: [
                machine('Caza furtivo', 'jet-fighter', [60000, 2400, 19700, 2900, 1]),
                machine('Interceptor bimotor', 'jet-fighter', [70000, 3000, 20000, 1900, 2]),
                machine('Caza polivalente', 'jet-fighter', [40000, 2100, 12000, 3200, 1]),
                machine('Caza ligero', 'jet-fighter', [25000, 1900, 8000, 2000, 1]),
            ],
        },
        {
            key: 'aviones',
            label: 'Aviones',
            icon: 'commercial-airplane',
            palette: { from: '#6fd2ff', to: '#123a6b' },
            members: [
                machine(
                    'Jumbo cuatrimotor',
                    'commercial-airplane',
                    [250000, 988, 180000, 14800, 416],
                ),
                machine(
                    'Bimotor largo alcance',
                    'commercial-airplane',
                    [180000, 950, 135000, 15600, 350],
                ),
                machine('Jet regional', 'airplane', [30000, 870, 28000, 3700, 100]),
                machine('Turbohélice', 'airplane', [5000, 510, 13000, 1500, 70]),
            ],
        },
        {
            key: 'helicopteros',
            label: 'Helicópteros',
            icon: 'helicopter',
            palette: { from: '#9fd26a', to: '#1f3a10' },
            members: [
                machine('Helicóptero de ataque', 'helicopter', [3800, 290, 5100, 480, 2]),
                machine('Helicóptero de carga', 'helicopter', [9000, 310, 10000, 740, 55]),
                machine('Helicóptero de rescate', 'helicopter', [3600, 280, 6000, 800, 20]),
                machine('Helicóptero ligero', 'helicopter', [750, 260, 1200, 600, 5]),
            ],
        },
        {
            key: 'camiones',
            label: 'Camiones',
            icon: 'truck',
            palette: { from: '#f2c46d', to: '#6b3a0c' },
            members: [
                machine('Tractocamión', 'truck', [600, 120, 9000, 2000, 2]),
                machine('Camión minero', 'mine-truck', [3500, 64, 240000, 400, 1]),
                machine('Grúa pesada', 'tow-truck', [500, 90, 30000, 800, 2]),
                machine('Ambulancia 4x4', 'ambulance', [300, 150, 5000, 900, 6]),
            ],
        },
        {
            key: 'trenes',
            label: 'Trenes',
            icon: 'steam-locomotive',
            palette: { from: '#c28bff', to: '#3d1670' },
            members: [
                machine('Tren de alta velocidad', 'subway-train', [16000, 320, 400000, 1000, 1300]),
                machine('Locomotora de vapor', 'steam-locomotive', [3000, 125, 160000, 300, 300]),
                machine('Locomotora de carga', 'steam-locomotive', [6000, 110, 200000, 1500, 2]),
                machine('Metro urbano', 'subway-train', [4000, 90, 150000, 200, 1500]),
            ],
        },
        {
            key: 'barcos',
            label: 'Barcos',
            icon: 'speed-boat',
            palette: { from: '#4aa8ff', to: '#0a2352' },
            members: [
                machine('Lancha rápida', 'speed-boat', [1350, 130, 5000, 400, 8]),
                machine('Buque portacontenedores', 'cargo-ship', [80000, 45, 200000000, 25000, 25]),
                machine('Velero oceánico', 'sailboat', [150, 30, 8000, 5000, 12]),
                machine('Acorazado', 'battleship', [150000, 60, 45000000, 15000, 2500]),
            ],
        },
    ],
};
