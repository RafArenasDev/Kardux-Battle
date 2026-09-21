import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthModule } from './health.module.js';

describe('GET /health', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('reports ok with an uptime and a timestamp', async () => {
        const response = await request(app.getHttpServer()).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ status: 'ok' });
        expect(typeof response.body.uptimeSeconds).toBe('number');
        expect(new Date(response.body.timestamp).toString()).not.toBe('Invalid Date');
    });
});
