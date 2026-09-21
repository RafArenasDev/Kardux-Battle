import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeckModule } from './deck.module.js';

describe('GET /decks/sources', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [DeckModule] }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('lists every deck source with local as the only ready one', async () => {
        const response = await request(app.getHttpServer()).get('/decks/sources');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body).toHaveLength(10);

        const local = response.body.find((source: { id: string }) => source.id === 'local') as {
            ready: boolean;
            requiresApiKey: boolean;
            attributes: unknown[];
        };
        expect(local.ready).toBe(true);
        expect(local.requiresApiKey).toBe(false);
        expect(local.attributes.length).toBeGreaterThan(0);

        const others = response.body.filter((source: { id: string }) => source.id !== 'local');
        expect(others.every((source: { ready: boolean }) => source.ready === false)).toBe(true);

        const marvel = response.body.find((source: { id: string }) => source.id === 'marvel') as {
            requiresApiKey: boolean;
        };
        expect(marvel.requiresApiKey).toBe(true);
    });
});
