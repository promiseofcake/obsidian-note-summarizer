import { existsSync } from 'fs';
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { AwsAuthError, bedrockConverseText } from 'obsidian-bedrock-client';
import type { BedrockConnection } from 'obsidian-bedrock-client';
import { showAwsAuthNotice } from './authNotice';
import { resolveAwsCliPath } from './awsCli';
import type NoteSummarizerPlugin from './main';

export interface NoteSummarizerSettings {
    awsCliPath: string;
    awsProfile: string;
    region: string;
    modelId: string;
    systemPrompt: string;
    summaryHeading: string;
    maxTokens: number;
}

// Provisional: the model availability check is pending. Change here only.
export const DEFAULT_MODEL_ID = 'us.anthropic.claude-sonnet-5-5';

export const DEFAULT_SYSTEM_PROMPT = `You summarize raw notes (often meeting notes) so they can be pasted into Slack or Confluence.
Write in a neutral, plain tone. Use Markdown.
Use these sections, in this order, and omit any section that would be empty:
**TL;DR** — 1–3 sentences.
**Key points** — bullets.
**Decisions** — bullets.
**Action items** — bullets as "Owner — task (due date)" when the notes say who or when; otherwise just the task.
**Open questions** — bullets.
Use only what is in the notes. Do not invent names, dates, numbers, or decisions. Keep it short.
Output only the summary, with no preamble and no top-level heading.`;

export const DEFAULT_SETTINGS: NoteSummarizerSettings = {
    awsCliPath: '',
    awsProfile: 'default',
    region: 'us-east-1',
    modelId: DEFAULT_MODEL_ID,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    summaryHeading: 'Summary',
    maxTokens: 4096,
};

/** DEFAULT_SETTINGS overlaid with saved fields that are known and of the right type. */
export function mergeSettings(saved: unknown): NoteSummarizerSettings {
    const result: NoteSummarizerSettings = { ...DEFAULT_SETTINGS };
    if (typeof saved !== 'object' || saved === null) return result;
    const src = saved as Record<string, unknown>;
    const out = result as unknown as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof NoteSummarizerSettings)[]) {
        const value = src[key];
        if (typeof value === typeof DEFAULT_SETTINGS[key] && !(typeof value === 'number' && !Number.isFinite(value))) {
            out[key] = value;
        }
    }
    return result;
}

export function toConnection(s: NoteSummarizerSettings, resolvedCliPath: string): BedrockConnection {
    return {
        awsCliPath: resolvedCliPath,
        awsProfile: s.awsProfile,
        region: s.region,
        modelId: s.modelId,
    };
}

export const NO_CLI_MESSAGE = 'AWS CLI not found. Set its path in Note Summarizer settings.';

export class NoteSummarizerSettingTab extends PluginSettingTab {
    plugin: NoteSummarizerPlugin;

    constructor(app: App, plugin: NoteSummarizerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        const settings = this.plugin.settings;
        const save = async (): Promise<void> => {
            await this.plugin.saveSettings();
        };

        const resolved = resolveAwsCliPath(settings.awsCliPath, existsSync);
        // Acronyms (AWS, CLI) and the brief's lowercase placeholder trip the sentence-case rule.
        /* eslint-disable obsidianmd/ui/sentence-case */
        new Setting(containerEl)
            .setName('AWS CLI path')
            .setDesc(`Resolved: ${resolved ?? 'not found'}`)
            .addText((t) =>
                t.setPlaceholder('auto-detect').setValue(settings.awsCliPath).onChange(async (v) => {
                    settings.awsCliPath = v;
                    await save();
                }),
            );

        new Setting(containerEl).setName('AWS profile').addText((t) =>
            t.setValue(settings.awsProfile).onChange(async (v) => {
                settings.awsProfile = v.trim();
                await save();
            }),
        );

        /* eslint-enable obsidianmd/ui/sentence-case */
        new Setting(containerEl).setName('Region').addText((t) =>
            t.setValue(settings.region).onChange(async (v) => {
                settings.region = v.trim();
                await save();
            }),
        );

        new Setting(containerEl).setName('Model ID').addText((t) =>
            t.setValue(settings.modelId).onChange(async (v) => {
                settings.modelId = v.trim();
                await save();
            }),
        );

        new Setting(containerEl).setName('Max output tokens').addText((t) =>
            t.setValue(String(settings.maxTokens)).onChange(async (v) => {
                const n = Number.parseInt(v, 10);
                if (Number.isFinite(n) && n > 0) {
                    settings.maxTokens = n;
                    await save();
                }
            }),
        );

        new Setting(containerEl).setName('Summary heading').addText((t) =>
            t.setValue(settings.summaryHeading).onChange(async (v) => {
                settings.summaryHeading = v.trim();
                await save();
            }),
        );

        let promptText: { setValue(v: string): unknown } | undefined;
        new Setting(containerEl)
            .setName('System prompt')
            .addTextArea((t) => {
                promptText = t;
                t.inputEl.rows = 10;
                t.setValue(settings.systemPrompt).onChange(async (v) => {
                    settings.systemPrompt = v;
                    await save();
                });
            })
            .addButton((b) =>
                b.setButtonText('Reset to default').onClick(async () => {
                    settings.systemPrompt = DEFAULT_SYSTEM_PROMPT;
                    promptText?.setValue(DEFAULT_SYSTEM_PROMPT);
                    await save();
                }),
            );

        new Setting(containerEl)
            .setName('Test connection')
            .setDesc('Send a tiny test request using the settings above.')
            .addButton((b) =>
                b.setButtonText('Test connection').onClick(async () => {
                    await this.testConnection();
                }),
            );
    }

    private async testConnection(): Promise<void> {
        const s = this.plugin.settings;
        const cli = resolveAwsCliPath(s.awsCliPath, existsSync);
        if (!cli) {
            new Notice(NO_CLI_MESSAGE);
            return;
        }
        try {
            await bedrockConverseText({ ...toConnection(s, cli), prompt: 'Reply with OK', maxTokens: 16 });
            new Notice(`Bedrock OK (${s.modelId})`);
        } catch (e) {
            if (e instanceof AwsAuthError) {
                showAwsAuthNotice(e);
            } else {
                new Notice(`Bedrock test failed: ${e instanceof Error ? e.message : 'unknown error'}`);
            }
        }
    }
}
