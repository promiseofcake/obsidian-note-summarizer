import { describe, expect, it, vi } from 'vitest';
import { AwsAuthError, BedrockTruncatedError } from '../src/bedrock';
import { DEFAULT_SETTINGS, DEFAULT_SYSTEM_PROMPT } from '../src/settings';
import { summarizeNote } from '../src/summarize';
import type { SummarizeDeps } from '../src/summarize';

function makeDeps(initial: string, overrides: Partial<SummarizeDeps> = {}) {
    const state = { content: initial };
    const converse = vi.fn<SummarizeDeps['converse']>().mockResolvedValue('OUT');
    const confirmReplace = vi.fn<SummarizeDeps['confirmReplace']>().mockResolvedValue(true);
    const deps: SummarizeDeps = {
        read: async () => state.content,
        process: async (fn) => {
            state.content = fn(state.content);
        },
        converse,
        confirmReplace,
        cliPath: '/aws',
        ...overrides,
    };
    return { state, deps, converse, confirmReplace };
}

const NOTE = '---\ntitle: t\n---\nraw notes here';

describe('summarizeNote', () => {
    it('appends a summary section', async () => {
        const { state, deps, converse } = makeDeps(NOTE);
        const outcome = await summarizeNote('append', DEFAULT_SETTINGS, deps);
        expect(outcome).toEqual({ kind: 'done' });
        expect(state.content.endsWith('## Summary\n\nOUT\n')).toBe(true);
        expect(converse).toHaveBeenCalledWith(DEFAULT_SYSTEM_PROMPT, 'raw notes here');
    });

    it('replaces the note body, keeping frontmatter, when confirmed', async () => {
        const { state, deps } = makeDeps(NOTE);
        expect(await summarizeNote('replace', DEFAULT_SETTINGS, deps)).toEqual({ kind: 'done' });
        expect(state.content).toBe('---\ntitle: t\n---\nOUT\n');
    });

    it('cancels replace without calling the model', async () => {
        const { state, deps, converse, confirmReplace } = makeDeps(NOTE);
        confirmReplace.mockResolvedValue(false);
        expect(await summarizeNote('replace', DEFAULT_SETTINGS, deps)).toEqual({ kind: 'cancelled' });
        expect(converse).not.toHaveBeenCalled();
        expect(state.content).toBe(NOTE);
    });

    it.each(['', '---\ntitle: t\n---\n', '  \n'])('returns empty for %j', async (note) => {
        const { deps, converse } = makeDeps(note);
        expect(await summarizeNote('append', DEFAULT_SETTINGS, deps)).toEqual({ kind: 'empty' });
        expect(converse).not.toHaveBeenCalled();
    });

    it('returns no-cli when the CLI path is unresolved', async () => {
        const { deps, converse } = makeDeps(NOTE, { cliPath: undefined });
        expect(await summarizeNote('append', DEFAULT_SETTINGS, deps)).toEqual({ kind: 'no-cli' });
        expect(converse).not.toHaveBeenCalled();
    });

    it('maps AwsAuthError to auth and leaves the note unchanged', async () => {
        const { state, deps, converse } = makeDeps(NOTE);
        const err = new AwsAuthError('x', 'sso_expired', 'p', '/aws');
        converse.mockRejectedValue(err);
        expect(await summarizeNote('append', DEFAULT_SETTINGS, deps)).toEqual({ kind: 'auth', error: err });
        expect(state.content).toBe(NOTE);
    });

    it('maps BedrockTruncatedError to truncated and leaves the note unchanged', async () => {
        const { state, deps, converse } = makeDeps(NOTE);
        converse.mockRejectedValue(new BedrockTruncatedError('cut'));
        expect(await summarizeNote('append', DEFAULT_SETTINGS, deps)).toEqual({ kind: 'truncated' });
        expect(state.content).toBe(NOTE);
    });

    it('applies the summary to the current content, not the snapshot', async () => {
        const { state, deps } = makeDeps('raw', {
            read: async () => 'raw',
        });
        state.content = 'raw\nmore typing';
        await summarizeNote('append', DEFAULT_SETTINGS, deps);
        expect(state.content).toContain('more typing');
        expect(state.content).toContain('## Summary\n\nOUT');
    });

    it('replace mode does not overwrite text typed during the call', async () => {
        const { state, deps, converse } = makeDeps('raw', {
            read: async () => 'raw',
        });
        state.content = 'raw\nmore';
        expect(await summarizeNote('replace', DEFAULT_SETTINGS, deps)).toEqual({ kind: 'changed' });
        expect(state.content).toBe('raw\nmore');
        expect(converse).toHaveBeenCalledTimes(1);
    });

    it('maps other errors to error with the message', async () => {
        const { deps, converse } = makeDeps(NOTE);
        converse.mockRejectedValue(new Error('500 boom'));
        expect(await summarizeNote('append', DEFAULT_SETTINGS, deps)).toEqual({ kind: 'error', message: '500 boom' });
    });
});
