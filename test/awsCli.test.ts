import { describe, expect, it } from 'vitest';
import { resolveAwsCliPath } from '../src/awsCli';

describe('resolveAwsCliPath', () => {
    it('uses the trimmed configured path', () => {
        expect(resolveAwsCliPath(' /x/aws ', () => false)).toBe('/x/aws');
    });
    it('falls back to the first existing candidate', () => {
        expect(resolveAwsCliPath('', (p) => p === '/usr/local/bin/aws')).toBe('/usr/local/bin/aws');
    });
    it('returns undefined when nothing exists', () => {
        expect(resolveAwsCliPath('', () => false)).toBeUndefined();
    });
});
