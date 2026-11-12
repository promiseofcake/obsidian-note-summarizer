import { AwsAuthError, BedrockTruncatedError } from 'obsidian-bedrock-client';
import { appendSummary, hasSummarizableBody, noteBodyForPrompt, replaceWithSummary } from './noteEdit';
import type { NoteSummarizerSettings } from './settings';

export type SummarizeMode = 'append' | 'replace';

export type SummarizeOutcome =
    | { kind: 'done' }
    | { kind: 'empty' }
    | { kind: 'cancelled' }
    | { kind: 'no-cli' }
    | { kind: 'auth'; error: AwsAuthError }
    | { kind: 'truncated' }
    | { kind: 'error'; message: string };

export interface SummarizeDeps {
    read: () => Promise<string>;
    /** vault.process(file, fn): applies fn to the current file content atomically. */
    process: (fn: (current: string) => string) => Promise<void>;
    converse: (system: string, prompt: string) => Promise<string>;
    confirmReplace: () => Promise<boolean>;
    cliPath: string | undefined;
}

export async function summarizeNote(
    mode: SummarizeMode,
    settings: NoteSummarizerSettings,
    deps: SummarizeDeps,
): Promise<SummarizeOutcome> {
    if (!deps.cliPath) return { kind: 'no-cli' };
    try {
        const content = await deps.read();
        if (!hasSummarizableBody(content)) return { kind: 'empty' };
        // Guard before the call, so a cancelled replace costs nothing.
        if (mode === 'replace' && !(await deps.confirmReplace())) return { kind: 'cancelled' };
        const text = await deps.converse(settings.systemPrompt, noteBodyForPrompt(content));
        // Apply to the current content, not the snapshot, so edits made during the call survive.
        await deps.process((current) =>
            mode === 'append'
                ? appendSummary(current, settings.summaryHeading, text)
                : replaceWithSummary(current, text),
        );
        return { kind: 'done' };
    } catch (e) {
        if (e instanceof AwsAuthError) return { kind: 'auth', error: e };
        if (e instanceof BedrockTruncatedError) return { kind: 'truncated' };
        return { kind: 'error', message: e instanceof Error ? e.message : 'unknown error' };
    }
}
