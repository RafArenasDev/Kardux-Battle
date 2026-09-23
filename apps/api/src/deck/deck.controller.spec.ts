import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DeckController } from './deck.controller.js';
import { DeckService } from './deck.service.js';
import { GithubSyncClient } from './github-sync.client.js';
import type { GithubSyncManifest, GithubSyncCard } from './github-sync.client.js';

/** A tiny fixture standing in for the real `tcg-github-sync` manifest/deck JSON - this test
 *  asserts the controller wires `DeckService` correctly, not that the real repo is reachable
 *  (CLAUDE.md: "Tests con msw o nock interceptando las APIs, sin red real en CI"). */
const FIXTURE_MANIFEST: GithubSyncManifest = {
    decks: [
        {
            source: 'pokeapi',
            tcg: null,
            deck: 'pokemon',
            name: 'Pokémon',
            count: 2,
            path: 'data/pokeapi/pokemon.json',
        },
        {
            source: 'deckofcards',
            tcg: null,
            deck: 'poker-standard',
            name: 'Baraja estandar',
            count: 1,
            path: 'data/deckofcards/standard-52.json',
        },
    ],
};

const FIXTURE_POKEAPI_DECK: GithubSyncCard[] = [
    {
        source: 'pokeapi',
        deck: 'pokemon',
        id: 1,
        name: 'bulbasaur',
        image: { small: 's.png', medium: 'm.png', large: 'l.png' },
        attributes: {},
    },
];

describe('GET /decks/sources', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const githubSync: Pick<GithubSyncClient, 'getManifest' | 'getDeck'> = {
            getManifest: vi.fn().mockResolvedValue(FIXTURE_MANIFEST),
            getDeck: vi.fn().mockResolvedValue(FIXTURE_POKEAPI_DECK),
        };

        // Built by hand instead of importing `DeckModule` directly: that module also imports
        // `AuthModule` for the real `JwtAuthGuard`, which pulls in `AuthService`/`PrismaService`
        // and the whole `JwtModule.registerAsync` chain - none of which this test needs, since
        // the guard is stubbed out below and auth itself is never exercised here.
        const moduleRef = await Test.createTestingModule({
            controllers: [DeckController],
            providers: [
                DeckService,
                { provide: GithubSyncClient, useValue: githubSync },
                { provide: JwtAuthGuard, useValue: { canActivate: () => true } },
            ],
        })
            .overrideGuard(JwtAuthGuard)
            .useValue({ canActivate: () => true })
            .compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('lists exactly the sources the manifest reports as synced, with real counts/previews', async () => {
        const response = await request(app.getHttpServer()).get('/decks/sources');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);

        const ids = response.body.map((source: { id: string }) => source.id).sort();
        expect(ids).toEqual(['deckofcards', 'pokeapi']);

        const pokeapi = response.body.find((source: { id: string }) => source.id === 'pokeapi') as {
            ready: boolean;
            cardCount: number;
            preview: { name: string; imageUrl: string }[];
        };
        expect(pokeapi.ready).toBe(true);
        expect(pokeapi.cardCount).toBe(2);
        expect(pokeapi.preview).toEqual([{ name: 'bulbasaur', imageUrl: 'm.png' }]);
    });
});
