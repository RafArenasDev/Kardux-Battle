import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [
        // NestJS's DI resolves constructor-injected providers via
        // `Reflect.getMetadata('design:paramtypes', ...)`, which requires `emitDecoratorMetadata`
        // - Vitest's default esbuild transform doesn't emit that metadata, so any test using
        // `@nestjs/testing`'s `Test.createTestingModule` with a real (non-manually-provided)
        // constructor dependency would fail to resolve it. SWC's decorator transform does emit
        // it, matching what `nest build`/`nest start` already produce via tsc.
        swc.vite({
            jsc: {
                parser: { syntax: 'typescript', decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: true },
                target: 'es2022',
            },
            module: { type: 'es6' },
        }),
    ],
    test: {
        environment: 'node',
    },
});
