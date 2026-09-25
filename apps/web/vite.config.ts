import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
    version: string;
};

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: [
                'favicon.ico',
                'apple-touch-icon.png',
                'favicon-32x32.png',
                'favicon-16x16.png',
                'logo.png',
            ],
            manifest: {
                id: '/',
                name: 'Kardux Battle',
                short_name: 'Kardux',
                description:
                    'Duelos de cartas Pokémon en vivo: elige el atributo, gánate la mesa. De 2 a 7 jugadores.',
                lang: 'es',
                dir: 'ltr',
                categories: ['games', 'entertainment'],
                start_url: '/',
                scope: '/',
                display: 'standalone',
                orientation: 'any',
                theme_color: '#07060a',
                background_color: '#07060a',
                screenshots: [
                    {
                        src: '/screenshots/mobile-choose.png',
                        sizes: '372x779',
                        type: 'image/png',
                        form_factor: 'narrow',
                        label: 'Elige con qué atributo competir',
                    },
                    {
                        src: '/screenshots/mobile-round-result.png',
                        sizes: '372x779',
                        type: 'image/png',
                        form_factor: 'narrow',
                        label: 'Resultado de la ronda sobre la mesa',
                    },
                    {
                        src: '/screenshots/mobile-ranking.png',
                        sizes: '372x779',
                        type: 'image/png',
                        form_factor: 'narrow',
                        label: 'Ranking con podio',
                    },
                ],
                icons: [
                    { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
                    {
                        src: '/android-chrome-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable',
                    },
                ],
            },
            workbox: {
                // App shell offline; the API and sockets always go to the network.
                globPatterns: ['**/*.{js,css,html,png,webp,ico,woff2,svg}'],
                // Store screenshots are only for the install dialog, never needed offline.
                globIgnores: ['screenshots/**'],
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api/],
            },
            devOptions: {
                enabled: true,
                type: 'module',
                navigateFallback: 'index.html',
                suppressWarnings: true,
            },
        }),
    ],
    build: {
        rollupOptions: {
            output: {
                // Long-lived vendor chunks: app deploys don't bust the framework cache.
                manualChunks: {
                    react: ['react', 'react-dom', 'react-router-dom'],
                    motion: ['framer-motion'],
                    realtime: ['socket.io-client'],
                    content: ['@kardux/content'],
                },
            },
        },
    },
    server: {
        port: 5173,
        strictPort: true,
    },
    preview: {
        port: 4173,
    },
});
