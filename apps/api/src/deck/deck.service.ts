import type { DeckSourceDescriptor } from '@kardux/contracts';
import { Injectable } from '@nestjs/common';

/**
 * Static catalog from CLAUDE.md's provider table. Only `local` is `ready: true` today
 * (the embedded seed deck `packages/providers` already knows how to build); every
 * external-API source is listed so the lobby UI can show it and explain it's coming
 * soon, but none of them are built here or ever call out to their API - that's TASK-02.
 */
const DECK_SOURCES: readonly DeckSourceDescriptor[] = [
    {
        id: 'local',
        label: 'Local (offline seed deck)',
        attributes: [
            { key: 'hp', label: 'HP', higherIsBetter: true },
            { key: 'attack', label: 'Attack', higherIsBetter: true },
            { key: 'defense', label: 'Defense', higherIsBetter: true },
            { key: 'speed', label: 'Speed', higherIsBetter: true },
        ],
        requiresApiKey: false,
        ready: true,
    },
    {
        id: 'pokeapi',
        label: 'Pokémon',
        attributes: [
            { key: 'hp', label: 'HP', higherIsBetter: true },
            { key: 'attack', label: 'Attack', higherIsBetter: true },
            { key: 'defense', label: 'Defense', higherIsBetter: true },
            { key: 'speed', label: 'Speed', higherIsBetter: true },
            { key: 'specialAttack', label: 'Special Attack', higherIsBetter: true },
            { key: 'weight', label: 'Weight', unit: 'kg', higherIsBetter: true },
        ],
        requiresApiKey: false,
        ready: false,
    },
    {
        id: 'dragonball',
        label: 'Dragon Ball',
        attributes: [
            { key: 'ki', label: 'Ki', higherIsBetter: true },
            { key: 'maxKi', label: 'Max Ki', higherIsBetter: true },
            { key: 'affiliation', label: 'Affiliation', higherIsBetter: true },
            { key: 'age', label: 'Age', higherIsBetter: true },
        ],
        requiresApiKey: false,
        ready: false,
    },
    {
        id: 'naruto',
        label: 'Naruto',
        attributes: [
            { key: 'ninjutsu', label: 'Ninjutsu', higherIsBetter: true },
            { key: 'taijutsu', label: 'Taijutsu', higherIsBetter: true },
            { key: 'genjutsu', label: 'Genjutsu', higherIsBetter: true },
            { key: 'intelligence', label: 'Intelligence', higherIsBetter: true },
            { key: 'strength', label: 'Strength', higherIsBetter: true },
            { key: 'speed', label: 'Speed', higherIsBetter: true },
        ],
        requiresApiKey: false,
        ready: false,
    },
    {
        id: 'digimon',
        label: 'Digimon',
        attributes: [
            { key: 'level', label: 'Level', higherIsBetter: true },
            { key: 'attack', label: 'Attack', higherIsBetter: true },
            { key: 'hp', label: 'HP', higherIsBetter: true },
        ],
        requiresApiKey: false,
        ready: false,
    },
    {
        id: 'rickmorty',
        label: 'Rick & Morty',
        attributes: [
            { key: 'episodeCount', label: 'Episode Count', higherIsBetter: true },
            { key: 'status', label: 'Status', higherIsBetter: true },
            { key: 'origin', label: 'Origin', higherIsBetter: true },
        ],
        requiresApiKey: false,
        ready: false,
    },
    {
        id: 'swapi',
        label: 'Star Wars',
        attributes: [
            { key: 'height', label: 'Height', unit: 'cm', higherIsBetter: true },
            { key: 'mass', label: 'Mass', unit: 'kg', higherIsBetter: true },
            { key: 'filmCount', label: 'Film Count', higherIsBetter: true },
            { key: 'starshipCount', label: 'Starship Count', higherIsBetter: true },
        ],
        requiresApiKey: false,
        ready: false,
    },
    {
        id: 'superheroes',
        label: 'Superheroes',
        attributes: [
            { key: 'intelligence', label: 'Intelligence', higherIsBetter: true },
            { key: 'strength', label: 'Strength', higherIsBetter: true },
            { key: 'speed', label: 'Speed', higherIsBetter: true },
            { key: 'power', label: 'Power', higherIsBetter: true },
            { key: 'combat', label: 'Combat', higherIsBetter: true },
        ],
        requiresApiKey: false,
        ready: false,
    },
    {
        id: 'marvel',
        label: 'Marvel',
        attributes: [
            { key: 'comics', label: 'Comics', higherIsBetter: true },
            { key: 'series', label: 'Series', higherIsBetter: true },
            { key: 'stories', label: 'Stories', higherIsBetter: true },
            { key: 'events', label: 'Events', higherIsBetter: true },
        ],
        requiresApiKey: true,
        ready: false,
    },
    {
        id: 'transformers',
        label: 'Transformers',
        attributes: [
            { key: 'tech', label: 'Tech', higherIsBetter: true },
            { key: 'firepower', label: 'Firepower', higherIsBetter: true },
            { key: 'speed', label: 'Speed', higherIsBetter: true },
            { key: 'rank', label: 'Rank', higherIsBetter: true },
            { key: 'courage', label: 'Courage', higherIsBetter: true },
        ],
        requiresApiKey: false,
        ready: false,
    },
];

@Injectable()
export class DeckService {
    listSources(): DeckSourceDescriptor[] {
        return [...DECK_SOURCES];
    }
}
