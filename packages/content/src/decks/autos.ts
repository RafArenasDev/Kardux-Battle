import { ENGINE_ATTRIBUTES, vehicle } from './engine-attributes.js';
import type { DeckDefinition } from './types.js';
import { text } from './types.js';

/** Car classes with realistic, rounded specs. Generic model names - no brands or trademarks. */
export const AUTOS_DECK: DeckDefinition = {
    id: 'autos',
    label: text('Autos', 'Cars'),
    tagline: text('Del monoplaza al todoterreno', 'From formula racers to off-roaders'),
    description: text(
        'Monoplazas, hiperdeportivos, muscle cars y todoterrenos con las especificaciones del reto original: cilindraje, cilindros, potencia, revoluciones y peso.',
        'Formula racers, hypercars, muscle cars and off-roaders with the original challenge specs: displacement, cylinders, power, RPM and weight.',
    ),
    coverIcon: 'f1-car',
    accent: '#ff4b3a',
    attributes: ENGINE_ATTRIBUTES,
    families: [
        {
            key: 'formula',
            label: text('Fórmula', 'Formula'),
            icon: 'f1-car',
            palette: { from: '#ff4b3a', to: '#4a0b0b' },
            members: [
                vehicle(
                    'Monoplaza Escarlata',
                    'Scarlet Formula',
                    'f1-car',
                    [1600, 6, 1000, 15000, 798],
                ),
                vehicle('Monoplaza Plata', 'Silver Formula', 'f1-car', [1600, 6, 1020, 15000, 798]),
                vehicle(
                    'Monoplaza Esmeralda',
                    'Emerald Formula',
                    'f1-car',
                    [1600, 6, 960, 15000, 798],
                ),
                vehicle(
                    'Monoplaza Nocturno',
                    'Midnight Formula',
                    'f1-car',
                    [1600, 6, 985, 15000, 798],
                ),
            ],
        },
        {
            key: 'hiper',
            label: text('Hiperdeportivos', 'Hypercars'),
            icon: 'race-car',
            palette: { from: '#ffb43a', to: '#5a2a06' },
            members: [
                vehicle(
                    'Hiper V12 Tempestad',
                    'Tempest V12',
                    'race-car',
                    [6500, 12, 1000, 9000, 1400],
                ),
                vehicle(
                    'Hiper W16 Relámpago',
                    'Lightning W16',
                    'race-car',
                    [8000, 16, 1500, 6700, 1995],
                ),
                vehicle(
                    'Hiper Aurora Híbrido',
                    'Aurora Hybrid',
                    'race-car',
                    [4000, 8, 900, 9000, 1500],
                ),
                vehicle('Hiper V8 Cometa', 'Comet V8', 'race-car', [5000, 8, 1160, 8500, 1300]),
            ],
        },
        {
            key: 'super',
            label: text('Superdeportivos', 'Supercars'),
            icon: 'speedometer',
            palette: { from: '#f5d547', to: '#5a4506' },
            members: [
                vehicle('Toro V10', 'Bull V10', 'speedometer', [5200, 10, 640, 8000, 1420]),
                vehicle('Halcón V8', 'Falcon V8', 'speedometer', [3900, 8, 720, 8000, 1450]),
                vehicle('Rayo V6', 'Bolt V6', 'speedometer', [3000, 6, 600, 8000, 1500]),
                vehicle('Centella V12', 'Spark V12', 'speedometer', [6500, 12, 770, 8500, 1550]),
            ],
        },
        {
            key: 'gt',
            label: text('Gran Turismo', 'Grand Tourers'),
            icon: 'car-key',
            palette: { from: '#6fd2ff', to: '#123a6b' },
            members: [
                vehicle('GT Imperial', 'Imperial GT', 'car-key', [6000, 12, 630, 7000, 1900]),
                vehicle('GT Crucero', 'Cruiser GT', 'car-key', [4000, 8, 550, 6500, 1800]),
                vehicle('GT Clásico', 'Classic GT', 'car-key', [4400, 8, 500, 6500, 1700]),
                vehicle('GT Ligero', 'Lightweight GT', 'car-key', [3000, 6, 450, 7000, 1450]),
            ],
        },
        {
            key: 'muscle',
            label: text('Muscle cars', 'Muscle Cars'),
            icon: 'car-wheel',
            palette: { from: '#ff6f91', to: '#6b0f2e' },
            members: [
                vehicle('Muscle Trueno', 'Thunder Muscle', 'car-wheel', [6200, 8, 650, 6500, 1700]),
                vehicle('Muscle Bestia', 'Beast Muscle', 'car-wheel', [6400, 8, 700, 6200, 1900]),
                vehicle('Muscle Coyote', 'Coyote Muscle', 'car-wheel', [5000, 8, 480, 7000, 1700]),
                vehicle(
                    'Muscle Serpiente',
                    'Serpent Muscle',
                    'car-wheel',
                    [8400, 10, 645, 6200, 1600],
                ),
            ],
        },
        {
            key: 'todoterreno',
            label: text('Todoterrenos', 'Off-roaders'),
            icon: 'jeep',
            palette: { from: '#9fd26a', to: '#1f3a10' },
            members: [
                vehicle(
                    'Todoterreno Montaña',
                    'Mountain Off-roader',
                    'jeep',
                    [3600, 6, 285, 6400, 2100],
                ),
                vehicle(
                    'Todoterreno Desierto',
                    'Desert Off-roader',
                    'jeep',
                    [3500, 6, 420, 6000, 2500],
                ),
                vehicle(
                    'Todoterreno Expedición',
                    'Expedition Off-roader',
                    'jeep',
                    [4500, 8, 300, 5500, 2600],
                ),
                vehicle(
                    'Todoterreno Compacto',
                    'Compact Off-roader',
                    'jeep',
                    [2000, 4, 200, 6000, 1600],
                ),
            ],
        },
        {
            key: 'rally',
            label: text('Rally', 'Rally'),
            icon: 'race-car',
            palette: { from: '#35d9c4', to: '#07303a' },
            members: [
                vehicle('Rally Grava', 'Gravel Rally', 'race-car', [1600, 4, 380, 7500, 1260]),
                vehicle('Rally Nieve', 'Snow Rally', 'race-car', [1600, 4, 370, 7500, 1260]),
                vehicle('Rally Asfalto', 'Tarmac Rally', 'race-car', [1600, 4, 390, 7500, 1260]),
                vehicle('Rally Raid', 'Rally Raid', 'jeep', [3500, 6, 400, 5500, 2000]),
            ],
        },
        {
            key: 'patrulla',
            label: text('Patrullas', 'Patrol Cars'),
            icon: 'police-car',
            palette: { from: '#8aa0c8', to: '#141a2e' },
            members: [
                vehicle(
                    'Patrulla Interceptora',
                    'Interceptor Patrol',
                    'police-car',
                    [3500, 6, 400, 7000, 2000],
                ),
                vehicle('Patrulla Urbana', 'City Patrol', 'police-car', [2000, 4, 200, 6500, 1500]),
                vehicle(
                    'Patrulla de Autopista',
                    'Highway Patrol',
                    'police-car',
                    [5000, 8, 480, 6500, 1800],
                ),
                vehicle(
                    'Patrulla Todoterreno',
                    'Off-road Patrol',
                    'police-car',
                    [3600, 6, 300, 6000, 2300],
                ),
            ],
        },
        {
            key: 'furgonetas',
            label: text('Furgonetas', 'Vans'),
            icon: 'surfer-van',
            palette: { from: '#c28bff', to: '#3d1670' },
            members: [
                vehicle('Furgoneta Surf', 'Surf Van', 'surfer-van', [2000, 4, 150, 4500, 1900]),
                vehicle(
                    'Furgoneta de Carga',
                    'Cargo Van',
                    'surfer-van',
                    [2200, 4, 170, 4000, 2200],
                ),
                vehicle('Autocaravana', 'Camper', 'caravan', [3000, 6, 190, 4000, 3500]),
                vehicle('Minibús', 'Minibus', 'surfer-van', [2800, 4, 180, 4000, 3000]),
            ],
        },
    ],
};
