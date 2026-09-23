import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

function createService() {
    const user = { id: 'user-1', nickname: 'RafArenas', avatarSeed: 'RafArenas' };
    const prisma = {
        user: { create: vi.fn().mockResolvedValue(user) },
    } as unknown as PrismaService;
    const jwt = {
        signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
    } as unknown as JwtService;

    return { service: new AuthService(prisma, jwt), prisma, jwt, user };
}

describe('AuthService.createGuest', () => {
    it('creates an anonymous guest User row (server-generated nickname/avatar) and signs a JWT bound to that user + tabId', async () => {
        const { service, prisma, jwt, user } = createService();

        const result = await service.createGuest({
            tabId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        });

        expect(prisma.user.create).toHaveBeenCalledWith({
            data: {
                nickname: expect.stringMatching(/^Jugador\d{4}$/) as unknown as string,
                // A random `icon:color` pair from the avatar catalog.
                avatarSeed: expect.stringMatching(/^[a-z-]+:[a-z]+$/) as unknown as string,
            },
        });
        expect(jwt.signAsync).toHaveBeenCalledWith({
            sub: user.id,
            tabId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
            nickname: user.nickname,
        });
        expect(result).toEqual({
            token: 'signed.jwt.token',
            user: {
                id: user.id,
                nickname: user.nickname,
                avatarSeed: user.avatarSeed,
                avatarUrl: expect.stringMatching(/^data:image\/svg\+xml/) as unknown as string,
            },
        });
    });
});
