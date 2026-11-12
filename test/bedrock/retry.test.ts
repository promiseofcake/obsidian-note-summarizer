import { describe, expect, it, vi } from 'vitest';
import { AwsAuthError, isRetryableBedrockError, withBedrockRetry } from '../../src/bedrock';

describe('isRetryableBedrockError', () => {
    it.each(['429 x', '500 x', '502 x', '503 x', '504 x', 'ThrottlingException', 'ServiceUnavailable', 'ModelNotReady', 'Too Many Requests'])(
        'retries %s', m => expect(isRetryableBedrockError(m)).toBe(true));
    it.each(['400 ValidationException', '403 AccessDenied', 'boom'])('does not retry %s', m =>
        expect(isRetryableBedrockError(m)).toBe(false));
});

describe('withBedrockRetry', () => {
    it('retries throttling then succeeds', async () => {
        const sleep = vi.fn(async () => {});
        const call = vi.fn()
            .mockRejectedValueOnce(new Error('429 ThrottlingException'))
            .mockRejectedValueOnce(new Error('429 ThrottlingException'))
            .mockResolvedValueOnce('ok');
        await expect(withBedrockRetry(call, { sleep })).resolves.toBe('ok');
        expect(sleep).toHaveBeenCalledTimes(2);
    });

    it('never retries AwsAuthError', async () => {
        const sleep = vi.fn(async () => {});
        const err = new AwsAuthError('429 ThrottlingException', 'rejected', 'p', 'aws');
        await expect(withBedrockRetry(() => Promise.reject(err), { sleep })).rejects.toBe(err);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('does not retry client errors', async () => {
        const sleep = vi.fn(async () => {});
        const call = vi.fn().mockRejectedValue(new Error('400 ValidationException'));
        await expect(withBedrockRetry(call, { sleep })).rejects.toThrow('400 ValidationException');
        expect(call).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('gives up after 5 attempts', async () => {
        const sleep = vi.fn(async () => {});
        const call = vi.fn().mockRejectedValue(new Error('429 ThrottlingException'));
        await expect(withBedrockRetry(call, { sleep })).rejects.toThrow('429');
        expect(call).toHaveBeenCalledTimes(5);
        expect(sleep).toHaveBeenCalledTimes(4);
    });

    it('honors a custom isRetryable', async () => {
        const sleep = vi.fn(async () => {});
        const call = vi.fn().mockRejectedValue(new Error('429 ThrottlingException'));
        await expect(withBedrockRetry(call, { sleep, isRetryable: () => false })).rejects.toThrow('429');
        expect(call).toHaveBeenCalledTimes(1);
    });

    it('uses full-jitter backoff capped at maxMs', async () => {
        const sleep = vi.fn(async () => {});
        vi.spyOn(Math, 'random').mockReturnValue(1);
        const call = vi.fn().mockRejectedValue(new Error('503 x'));
        await expect(withBedrockRetry(call, { sleep, baseMs: 1000, maxMs: 3000, maxAttempts: 4 })).rejects.toThrow();
        expect(sleep.mock.calls.map(c => (c as unknown[])[0])).toEqual([1000, 2000, 3000]);
        vi.restoreAllMocks();
    });
});
