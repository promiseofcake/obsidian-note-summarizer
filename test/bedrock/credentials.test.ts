import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execFile: execFileMock }));

import {
    AwsAuthError,
    classifyAwsCliFailure,
    clearAwsCliCredentialCache,
    getAwsCliCredentials,
    invalidateAwsCliCredentials
} from '../../src/bedrock';

type Callback = (error: Error | null, stdout: string, stderr: string) => void;

function creds(): string {
    return JSON.stringify({
        AccessKeyId: 'A',
        SecretAccessKey: 'S',
        SessionToken: 'T',
        Expiration: new Date(Date.now() + 3600_000).toISOString()
    });
}

function succeedWith(stdout: string): void {
    execFileMock.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Callback) => {
        void Promise.resolve().then(() => cb(null, stdout, ''));
    });
}

beforeEach(() => {
    execFileMock.mockReset();
    clearAwsCliCredentialCache();
});

describe('classifyAwsCliFailure', () => {
    it.each([
        ['spawn /usr/local/bin/aws ENOENT', 'cli_not_found'],
        ['The config profile (foo) could not be found', 'profile_not_found'],
        ['Error when retrieving token from sso: Token has expired and refresh failed', 'sso_expired'],
        ['something else', 'other']
    ])('%s -> %s', (input, reason) => {
        expect(classifyAwsCliFailure(input)).toBe(reason);
    });
});

describe('AwsAuthError.fixCommand', () => {
    it.each(['sso_expired', 'rejected'] as const)('suggests sso login for %s', (reason) => {
        expect(new AwsAuthError('m', reason, 'p', 'aws').fixCommand).toBe('aws sso login --profile p');
    });

    it('has no fix for cli_not_found', () => {
        expect(new AwsAuthError('m', 'cli_not_found', 'p', 'aws').fixCommand).toBeUndefined();
    });
});

describe('getAwsCliCredentials', () => {
    it('parses CLI output', async () => {
        succeedWith(creds());
        const result = await getAwsCliCredentials('aws', 'p');
        expect(result).toMatchObject({ accessKeyId: 'A', secretAccessKey: 'S', sessionToken: 'T' });
        expect(result.expiration).toBeInstanceOf(Date);
    });

    it('serves a second call within TTL from cache', async () => {
        succeedWith(creds());
        await getAwsCliCredentials('aws', 'p');
        await getAwsCliCredentials('aws', 'p');
        expect(execFileMock).toHaveBeenCalledTimes(1);
    });

    it('shares one CLI invocation between concurrent calls', async () => {
        succeedWith(creds());
        await Promise.all([getAwsCliCredentials('aws', 'p'), getAwsCliCredentials('aws', 'p')]);
        expect(execFileMock).toHaveBeenCalledTimes(1);
    });

    it('re-runs the CLI after invalidation', async () => {
        succeedWith(creds());
        await getAwsCliCredentials('aws', 'p');
        invalidateAwsCliCredentials('aws', 'p');
        await getAwsCliCredentials('aws', 'p');
        expect(execFileMock).toHaveBeenCalledTimes(2);
    });

    it('classifies CLI failure and keeps stdout out of the message', async () => {
        execFileMock.mockImplementation((_c: string, _a: string[], _o: unknown, cb: Callback) => {
            cb(new Error('exit 1'), 'SECRET-STDOUT', 'Token has expired');
        });
        const err = await getAwsCliCredentials('aws', 'p').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AwsAuthError);
        expect((err as AwsAuthError).reason).toBe('sso_expired');
        expect((err as AwsAuthError).message).not.toContain('SECRET-STDOUT');
    });

    it('rejects unparseable output with reason other', async () => {
        succeedWith('not json');
        const err = await getAwsCliCredentials('aws', 'p').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AwsAuthError);
        expect((err as AwsAuthError).reason).toBe('other');
    });
});
