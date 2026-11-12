import { existsSync } from 'fs';
import { MarkdownView, Notice, Plugin } from 'obsidian';
import type { TFile } from 'obsidian';
import { bedrockConverseText, withBedrockRetry } from './bedrock';
import { showAwsAuthNotice } from './authNotice';
import { resolveAwsCliPath } from './awsCli';
import { ConfirmReplaceModal } from './confirmReplaceModal';
import { DEFAULT_SETTINGS, mergeSettings, NO_CLI_MESSAGE, NoteSummarizerSettingTab, toConnection } from './settings';
import type { NoteSummarizerSettings } from './settings';
import { summarizeNote } from './summarize';
import type { SummarizeMode, SummarizeOutcome } from './summarize';

export default class NoteSummarizerPlugin extends Plugin {
    settings: NoteSummarizerSettings = { ...DEFAULT_SETTINGS };
    private running = false;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new NoteSummarizerSettingTab(this.app, this));

        this.addCommand({
            id: 'summarize-append',
            name: 'Summarize note (append summary)',
            checkCallback: (checking) => this.runCommand('append', checking),
        });
        this.addCommand({
            id: 'summarize-replace',
            name: 'Summarize note (replace note with summary)',
            checkCallback: (checking) => this.runCommand('replace', checking),
        });
    }

    async loadSettings(): Promise<void> {
        this.settings = mergeSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    private runCommand(mode: SummarizeMode, checking: boolean): boolean {
        const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
        if (!file) return false;
        if (!checking) {
            this.summarize(mode, file).catch((e: unknown) => {
                new Notice(`Summarize failed: ${e instanceof Error ? e.message : String(e)}`);
            });
        }
        return true;
    }

    private async summarize(mode: SummarizeMode, file: TFile): Promise<void> {
        if (this.running) {
            new Notice('A summary is already running');
            return;
        }
        let working: Notice | undefined;
        try {
            this.running = true;
            const cliPath = resolveAwsCliPath(this.settings.awsCliPath, existsSync);
            working = new Notice('Summarizing…', 0);
            const settings = this.settings;
            const outcome = await summarizeNote(mode, settings, {
                read: () => this.app.vault.read(file),
                process: async (fn) => {
                    await this.app.vault.process(file, fn);
                },
                converse: (system, prompt) =>
                    withBedrockRetry(() =>
                        bedrockConverseText({
                            ...toConnection(settings, cliPath ?? ''),
                            system,
                            prompt,
                            maxTokens: settings.maxTokens,
                        }),
                    ).then((r) => r.text),
                confirmReplace: () => new ConfirmReplaceModal(this.app).prompt(),
                cliPath,
            });
            // Close the progress notice before showing the outcome.
            working.hide();
            this.showOutcome(mode, outcome);
        } finally {
            working?.hide();
            this.running = false;
        }
    }

    private showOutcome(mode: SummarizeMode, outcome: SummarizeOutcome): void {
        switch (outcome.kind) {
            case 'done':
                new Notice(mode === 'append' ? 'Summary added' : 'Note replaced with summary');
                break;
            case 'empty':
                new Notice('Nothing to summarize');
                break;
            case 'cancelled':
                break;
            case 'no-cli':
                new Notice(NO_CLI_MESSAGE);
                break;
            case 'auth':
                showAwsAuthNotice(outcome.error);
                break;
            case 'truncated':
                // "Max output tokens" is the setting's exact name.
                // eslint-disable-next-line obsidianmd/ui/sentence-case
                new Notice('Summary was cut off at the output token limit. Raise Max output tokens in settings.');
                break;
            case 'changed':
                new Notice('Note changed while summarizing; nothing was replaced. Run again, or use append.');
                break;
            case 'error':
                new Notice(`Summarize failed: ${outcome.message}`);
                break;
        }
    }
}
