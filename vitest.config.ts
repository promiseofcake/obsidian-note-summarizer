import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    resolve: {
        alias: {
            obsidian: fileURLToPath(new URL('./test/obsidian-mock.ts', import.meta.url)),
            // Run the shared package from source so the `obsidian` alias reaches it
            // (its CJS dist would require('obsidian') natively).
            'obsidian-bedrock-client': fileURLToPath(
                new URL('./node_modules/obsidian-bedrock-client/src/index.ts', import.meta.url)
            )
        }
    },
    test: {
        environment: 'node',
        include: ['test/**/*.test.ts']
    }
});
