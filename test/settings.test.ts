import { describe, expect, it, vi } from 'vitest';

// The package ships CJS that require()s `obsidian`, which the vitest alias cannot reach
// when it is symlinked via file:. These tests never call Bedrock, so stub it.
vi.mock('obsidian-bedrock-client', () => ({
    AwsAuthError: class AwsAuthError extends Error {},
    bedrockConverseText: vi.fn(),
}));

import { DEFAULT_SETTINGS, mergeSettings, toConnection } from '../src/settings';

describe('mergeSettings', () => {
    it('returns defaults for undefined', () => {
        expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    });

    it('overlays valid fields and drops unknown ones', () => {
        const s = mergeSettings({ awsProfile: 'x', bogus: 1 });
        expect(s.awsProfile).toBe('x');
        expect(s.region).toBe(DEFAULT_SETTINGS.region);
        expect(s).not.toHaveProperty('bogus');
    });

    it('ignores fields of the wrong type', () => {
        const s = mergeSettings({ maxTokens: 'lots', region: 5 });
        expect(s.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
        expect(s.region).toBe(DEFAULT_SETTINGS.region);
    });
});

describe('toConnection', () => {
    it('maps settings and resolved CLI path', () => {
        expect(toConnection(DEFAULT_SETTINGS, '/x/aws')).toEqual({
            awsCliPath: '/x/aws',
            awsProfile: DEFAULT_SETTINGS.awsProfile,
            region: DEFAULT_SETTINGS.region,
            modelId: DEFAULT_SETTINGS.modelId,
        });
    });
});
