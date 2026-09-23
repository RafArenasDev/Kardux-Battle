import { ENGINE_ATTRIBUTES, vehicle } from './engine-attributes.js';
import type { DeckDefinition } from './types.js';
import { text } from './types.js';

/** Motorcycle classes with realistic, rounded specs. Generic model names - no brands. */
export const MOTOS_DECK: DeckDefinition = {
    id: 'motos',
    label: text('Motos', 'Motorcycles'),
    tagline: text('Superbikes, trail, custom y más', 'Superbikes, trail, custom and more'),
    description: text(
        'Nueve estilos de moto, del prototipo de GP al scooter urbano, comparados por cilindraje, cilindros, potencia, revoluciones y peso.',
        'Nine motorcycle styles, from GP prototypes to city scooters, compared by displacement, cylinders, power, RPM and weight.',
    ),
    coverIcon: 'full-motorcycle-helmet',
    accent: '#35d9c4',
    attributes: ENGINE_ATTRIBUTES,
    families: [
        {
            key: 'gp',
            label: text('Carreras', 'Racing'),
            icon: 'full-motorcycle-helmet',
            palette: { from: '#ff4b3a', to: '#4a0b0b' },
            members: [
                vehicle(
                    'Prototipo GP',
                    'GP Prototype',
                    'full-motorcycle-helmet',
                    [1000, 4, 290, 18000, 157],
                ),
                vehicle(
                    'Moto Intermedia',
                    'Intermediate Racer',
                    'full-motorcycle-helmet',
                    [765, 3, 140, 13000, 217],
                ),
                vehicle(
                    'Moto Ligera de Carreras',
                    'Light Racer',
                    'full-motorcycle-helmet',
                    [250, 1, 60, 14000, 152],
                ),
                vehicle(
                    'Superstock',
                    'Superstock',
                    'full-motorcycle-helmet',
                    [1000, 4, 220, 14000, 168],
                ),
            ],
        },
        {
            key: 'superbike',
            label: text('Superbikes', 'Superbikes'),
            icon: 'full-motorcycle-helmet',
            palette: { from: '#ffb43a', to: '#5a2a06' },
            members: [
                vehicle(
                    'Superbike Relámpago',
                    'Lightning Superbike',
                    'full-motorcycle-helmet',
                    [1000, 4, 215, 14500, 195],
                ),
                vehicle(
                    'Superbike Tricilíndrica',
                    'Triple Superbike',
                    'full-motorcycle-helmet',
                    [800, 3, 150, 13000, 180],
                ),
                vehicle(
                    'Superbike Bicilíndrica',
                    'Twin Superbike',
                    'full-motorcycle-helmet',
                    [1200, 2, 210, 12500, 190],
                ),
                vehicle(
                    'Superbike V4',
                    'V4 Superbike',
                    'full-motorcycle-helmet',
                    [1100, 4, 215, 13000, 200],
                ),
            ],
        },
        {
            key: 'naked',
            label: text('Naked', 'Naked Bikes'),
            icon: 'full-motorcycle-helmet',
            palette: { from: '#ff6f91', to: '#6b0f2e' },
            members: [
                vehicle(
                    'Naked Callejera',
                    'Street Naked',
                    'full-motorcycle-helmet',
                    [900, 3, 120, 10000, 190],
                ),
                vehicle(
                    'Naked Bestia',
                    'Beast Naked',
                    'full-motorcycle-helmet',
                    [1300, 2, 180, 9500, 210],
                ),
                vehicle(
                    'Naked Ligera',
                    'Light Naked',
                    'full-motorcycle-helmet',
                    [700, 2, 75, 9000, 180],
                ),
                vehicle(
                    'Naked V4',
                    'V4 Naked',
                    'full-motorcycle-helmet',
                    [1100, 4, 208, 13000, 200],
                ),
            ],
        },
        {
            key: 'touring',
            label: text('Turismo', 'Touring'),
            icon: 'full-motorcycle-helmet',
            palette: { from: '#6fd2ff', to: '#123a6b' },
            members: [
                vehicle(
                    'Gran Turismo Seis',
                    'Six Grand Tourer',
                    'full-motorcycle-helmet',
                    [1800, 6, 120, 6000, 380],
                ),
                vehicle(
                    'Crucero Turismo',
                    'Touring Cruiser',
                    'full-motorcycle-helmet',
                    [1900, 2, 95, 5000, 400],
                ),
                vehicle(
                    'Sport Turismo',
                    'Sport Tourer',
                    'full-motorcycle-helmet',
                    [1300, 4, 165, 10000, 300],
                ),
                vehicle(
                    'Turismo Aventura',
                    'Adventure Tourer',
                    'full-motorcycle-helmet',
                    [1250, 2, 136, 9000, 250],
                ),
            ],
        },
        {
            key: 'trail',
            label: text('Trail', 'Adventure'),
            icon: 'full-motorcycle-helmet',
            palette: { from: '#9fd26a', to: '#1f3a10' },
            members: [
                vehicle(
                    'Trail Rally',
                    'Rally Adventure',
                    'full-motorcycle-helmet',
                    [450, 1, 60, 10000, 160],
                ),
                vehicle(
                    'Trail Maxi',
                    'Maxi Adventure',
                    'full-motorcycle-helmet',
                    [1250, 2, 136, 9000, 260],
                ),
                vehicle(
                    'Trail Media',
                    'Mid Adventure',
                    'full-motorcycle-helmet',
                    [800, 2, 95, 9000, 210],
                ),
                vehicle(
                    'Trail Ligera',
                    'Light Adventure',
                    'full-motorcycle-helmet',
                    [300, 1, 27, 9000, 160],
                ),
            ],
        },
        {
            key: 'offroad',
            label: text('Todoterreno', 'Off-road'),
            icon: 'full-motorcycle-helmet',
            palette: { from: '#f2c46d', to: '#6b3a0c' },
            members: [
                vehicle(
                    'Motocross 450',
                    'Motocross 450',
                    'full-motorcycle-helmet',
                    [450, 1, 63, 11500, 105],
                ),
                vehicle(
                    'Motocross 250',
                    'Motocross 250',
                    'full-motorcycle-helmet',
                    [250, 1, 45, 13500, 100],
                ),
                vehicle(
                    'Enduro 300',
                    'Enduro 300',
                    'full-motorcycle-helmet',
                    [300, 1, 52, 10000, 110],
                ),
                vehicle(
                    'Supermotard',
                    'Supermoto',
                    'full-motorcycle-helmet',
                    [450, 1, 60, 11000, 115],
                ),
            ],
        },
        {
            key: 'custom',
            label: text('Custom', 'Custom'),
            icon: 'full-motorcycle-helmet',
            palette: { from: '#b3a58a', to: '#3a3226' },
            members: [
                vehicle(
                    'Custom V-Twin',
                    'V-Twin Custom',
                    'full-motorcycle-helmet',
                    [1900, 2, 100, 5000, 340],
                ),
                vehicle('Bobber', 'Bobber', 'full-motorcycle-helmet', [1200, 2, 80, 6000, 250]),
                vehicle('Chopper', 'Chopper', 'full-motorcycle-helmet', [1700, 2, 90, 5000, 300]),
                vehicle(
                    'Power Cruiser',
                    'Power Cruiser',
                    'full-motorcycle-helmet',
                    [1800, 2, 160, 9000, 310],
                ),
            ],
        },
        {
            key: 'clasicas',
            label: text('Clásicas', 'Classics'),
            icon: 'full-motorcycle-helmet',
            palette: { from: '#c28bff', to: '#3d1670' },
            members: [
                vehicle(
                    'Café Racer',
                    'Café Racer',
                    'full-motorcycle-helmet',
                    [1200, 2, 80, 7000, 210],
                ),
                vehicle(
                    'Scrambler',
                    'Scrambler',
                    'full-motorcycle-helmet',
                    [800, 2, 73, 8250, 190],
                ),
                vehicle(
                    'Clásica 500',
                    'Classic 500',
                    'full-motorcycle-helmet',
                    [500, 1, 27, 5250, 195],
                ),
                vehicle(
                    'Clásica Twin',
                    'Classic Twin',
                    'full-motorcycle-helmet',
                    [900, 2, 65, 7500, 215],
                ),
            ],
        },
        {
            key: 'scooter',
            label: text('Scooters', 'Scooters'),
            icon: 'scooter',
            palette: { from: '#4aa8ff', to: '#0a2352' },
            members: [
                vehicle('Maxiscooter', 'Maxi Scooter', 'scooter', [750, 2, 58, 7000, 230]),
                vehicle('Scooter 300', 'Scooter 300', 'scooter', [300, 1, 26, 8000, 180]),
                vehicle('Scooter 125', 'Scooter 125', 'scooter', [125, 1, 15, 8500, 140]),
                vehicle('Scooter 50', 'Scooter 50', 'scooter', [50, 1, 4, 7500, 95]),
            ],
        },
    ],
};
