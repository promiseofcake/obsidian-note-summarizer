import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    resolve: {
        alias: {
            obsidian: fileURLToPath(new URL('./test/obsidian-mock.ts', import.meta.url))
        }
    },
    test: {
        environment: 'node',
        include: ['test/**/*.test.ts'],
        server: {
            // Inline the shared package so the `obsidian` alias applies to it. The regex is
            // needed while it is a file: symlink (its realpath is outside node_modules).
            deps: { inline: ['obsidian-bedrock-client', /obsidian-bedrock-client/] }
        }
    }
});
