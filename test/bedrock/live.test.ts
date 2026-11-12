import process from 'process';
import { describe, expect, it, vi } from 'vitest';
import { requestUrl } from '../obsidian-mock';
import { bedrockConverseText } from '../../src/bedrock';

// Live smoke test against real Bedrock; skipped unless BEDROCK_LIVE is set.
// Maps the mocked requestUrl onto fetch for this file only.
describe.skipIf(!process.env.BEDROCK_LIVE)('live Bedrock', () => {
    it('returns text from a real Converse call', async () => {
        vi.mocked(requestUrl).mockImplementation(async request => {
            // Live smoke test only: real network call outside Obsidian, so requestUrl is unavailable
            // eslint-disable-next-line no-restricted-globals
            const res = await fetch(request.url, { method: request.method, headers: request.headers, body: request.body });
            const text = await res.text();
            const headers: Record<string, string> = {};
            res.headers.forEach((value, name) => { headers[name] = value; });
            return {
                status: res.status,
                headers,
                text,
                get json(): unknown { return JSON.parse(text) as unknown; }
            };
        });
        const result = await bedrockConverseText({
            awsCliPath: process.env.AWS_CLI_PATH ?? 'aws',
            awsProfile: process.env.BEDROCK_PROFILE ?? 'default',
            region: 'us-east-1',
            modelId: process.env.BEDROCK_MODEL ?? '',
            prompt: 'Reply with OK',
            maxTokens: 16
        });
        expect(result.text.length).toBeGreaterThan(0);
    }, 60000);
});
