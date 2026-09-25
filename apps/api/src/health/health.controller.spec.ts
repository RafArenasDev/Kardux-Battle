import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { MatchRuntimeService } from '../game/match-runtime.service.js';
import { HealthController } from './health.controller.js';

async function appWith(queryRaw: () => Promise<unknown>): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
        controllers: [HealthController],
        providers: [
            { provide: PrismaService, useValue: { $queryRaw: vi.fn(queryRaw) } },
            { provide: MatchRuntimeService, useValue: { cacheStatus: () => 'up' } },
        ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
}

describe('GET /health', () => {
    let app: INestApplication | undefined;

    afterEach(async () => {
        await app?.close();
    });

    it('reports ok when the database answers', async () => {
        app = await appWith(async () => [{ '?column?': 1 }]);
        const response = await request(app.getHttpServer()).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ status: 'ok', database: 'up', cache: 'up' });
        expect(typeof response.body.uptimeSeconds).toBe('number');
        expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('answers 503 when the database is down', async () => {
        app = await appWith(async () => {
            throw new Error('connection refused');
        });
        const response = await request(app.getHttpServer()).get('/health');

        expect(response.status).toBe(503);
    });
});
