import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockResponse, requestUrl } from '../obsidian-mock';

vi.mock('../../src/bedrock/credentials', async importOriginal => {
    const actual = await importOriginal<typeof import('../../src/bedrock/credentials')>();
    return {
        ...actual,
        getAwsCliCredentials: vi.fn(async () => ({ accessKeyId: 'AKIATEST', secretAccessKey: 'secret', sessionToken: 'TOKEN' })),
        invalidateAwsCliCredentials: vi.fn()
    };
});

import { AwsAuthError, BedrockTruncatedError, bedrockConverseText, invalidateAwsCliCredentials } from '../../src/bedrock';

interface SentBody {
    system?: Array<{ text: string }>;
    messages: unknown;
    inferenceConfig: unknown;
    outputConfig: { textFormat: { type: string } };
}
const sentBody = (i = 0): SentBody => JSON.parse(requestUrl.mock.calls[i][0].body ?? '{}') as SentBody;

const conn = { awsCliPath: 'aws', awsProfile: 'p', region: 'us-east-1', modelId: 'us.anthropic.claude-sonnet-5' };
const ok = (text: string, stopReason = 'end_turn') => mockResponse(200, {
    output: { message: { content: [{ text }] } }, stopReason, usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
}, { 'x-amzn-requestid': 'rid' });
const expired = () => mockResponse(403, { message: 'The security token included in the request is expired' }, { 'x-amzn-errortype': 'ExpiredTokenException' });

beforeEach(() => {
    requestUrl.mockReset();
    vi.mocked(invalidateAwsCliCredentials).mockClear();
});

describe('bedrockConverseText', () => {
    it('signs and sends the request, returning trimmed concatenated text', async () => {
        requestUrl.mockResolvedValueOnce(mockResponse(200, {
            output: { message: { content: [{ text: ' a' }, { text: 'b ' }] } }, stopReason: 'end_turn',
            usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
        }));
        const result = await bedrockConverseText({ ...conn, system: 'SYS', prompt: 'hi', maxTokens: 4096 });
        expect(result.text).toBe('ab');
        expect(result.stopReason).toBe('end_turn');
        expect(result.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });

        const req = requestUrl.mock.calls[0][0];
        expect(req.url).toBe(`https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent('us.anthropic.claude-sonnet-5')}/converse`);
        const headers = Object.fromEntries(Object.entries(req.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
        expect(headers['authorization']).toMatch(/^AWS4-HMAC-SHA256/);
        expect(headers['x-amz-security-token']).toBe('TOKEN');
        expect(headers).not.toHaveProperty('host');
        const body = sentBody();
        expect(body.system?.[0].text).toBe('SYS');
        expect(body.messages).toEqual([{ role: 'user', content: [{ text: 'hi' }] }]);
        expect(body).not.toHaveProperty('temperature');
        expect(body.inferenceConfig).toEqual({ maxTokens: 4096 });
    });

    it('omits system when not given', async () => {
        requestUrl.mockResolvedValueOnce(ok('x'));
        await bedrockConverseText({ ...conn, prompt: 'hi', maxTokens: 10 });
        expect(JSON.parse(requestUrl.mock.calls[0][0].body ?? '')).not.toHaveProperty('system');
    });

    it('throws BedrockTruncatedError on max_tokens without leaking output', async () => {
        requestUrl.mockResolvedValueOnce(ok('SECRET', 'max_tokens'));
        const err = await bedrockConverseText({ ...conn, prompt: 'p', maxTokens: 5 }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BedrockTruncatedError);
        expect((err as Error).message).not.toContain('SECRET');
    });

    it('throws on empty text', async () => {
        requestUrl.mockResolvedValueOnce(ok('  '));
        await expect(bedrockConverseText({ ...conn, prompt: 'p', maxTokens: 5 })).rejects.toThrow(/Empty/);
    });
});

describe('error handling', () => {
    it('refreshes credentials once after a rejected-credentials response', async () => {
        requestUrl.mockResolvedValueOnce(expired()).mockResolvedValueOnce(ok('fine'));
        await expect(bedrockConverseText({ ...conn, prompt: 'p', maxTokens: 5 })).resolves.toMatchObject({ text: 'fine' });
        expect(invalidateAwsCliCredentials).toHaveBeenCalledTimes(1);
        expect(invalidateAwsCliCredentials).toHaveBeenCalledWith('aws', 'p');
        expect(requestUrl).toHaveBeenCalledTimes(2);
    });

    it('gives up with AwsAuthError rejected after the second rejection', async () => {
        requestUrl.mockResolvedValueOnce(expired()).mockResolvedValueOnce(expired());
        const err = await bedrockConverseText({ ...conn, prompt: 'p', maxTokens: 5 }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AwsAuthError);
        expect((err as AwsAuthError).reason).toBe('rejected');
    });

    it('reports other errors with status, message and request id', async () => {
        requestUrl.mockResolvedValueOnce(mockResponse(400, { message: 'ValidationException: bad' }, { 'x-amzn-requestid': 'rid' }));
        const err = await bedrockConverseText({ ...conn, prompt: 'p', maxTokens: 5 }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toContain('400 ValidationException: bad');
        expect((err as Error).message).toContain('requestId:');
    });
});
