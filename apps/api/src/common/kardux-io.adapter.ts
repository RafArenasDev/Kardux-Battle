import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO's CORS check runs independently of `app.enableCors()`, and `@WebSocketGateway`
 * options are fixed at decoration time (before config exists). This adapter applies the same
 * `CORS_ORIGINS` whitelist to every Socket.IO server, plus conservative transport limits.
 */
export class KarduxIoAdapter extends IoAdapter {
    constructor(
        app: INestApplicationContext,
        private readonly allowedOrigins: string[],
    ) {
        super(app);
    }

    override createIOServer(port: number, options?: ServerOptions): unknown {
        return super.createIOServer(port, {
            ...options,
            cors: { origin: this.allowedOrigins, credentials: true },
            // Largest legitimate payload is a chat line - 64 KB is generous.
            maxHttpBufferSize: 64 * 1024,
            pingInterval: 20_000,
            pingTimeout: 20_000,
        });
    }
}
