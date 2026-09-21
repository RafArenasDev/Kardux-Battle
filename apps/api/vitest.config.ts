import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        // NestJS's DI relies on `emitDecoratorMetadata`, which Vitest's default esbuild transform
        // doesn't emit - fine for now (no test here injects a typed constructor dependency), but
        // once a service/provider needs real DI resolution in a test, this config is where an
        // SWC-based transform (`unplugin-swc`) gets added instead of esbuild.
    },
});
