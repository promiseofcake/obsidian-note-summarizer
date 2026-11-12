import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, mergeSettings, NoteSummarizerSettingTab } from './settings';
import type { NoteSummarizerSettings } from './settings';

export default class NoteSummarizerPlugin extends Plugin {
    settings: NoteSummarizerSettings = { ...DEFAULT_SETTINGS };

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new NoteSummarizerSettingTab(this.app, this));
    }

    async loadSettings(): Promise<void> {
        this.settings = mergeSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
