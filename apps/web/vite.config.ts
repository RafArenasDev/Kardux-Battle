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
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'favicon-32x32.png'],
            manifest: {
                name: 'Kardux Battle',
                short_name: 'Kardux',
                description: 'Elige el atributo. Gánate la mesa. Duelos de cartas en vivo.',
                lang: 'es',
                start_url: '/',
                scope: '/',
                display: 'standalone',
                orientation: 'any',
                theme_color: '#07060a',
                background_color: '#07060a',
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
