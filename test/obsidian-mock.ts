import { vi } from 'vitest';

/** Stand-in for the `obsidian` module (aliased in vitest.config.ts). */
export const requestUrl = vi.fn();
export const Notice = vi.fn();
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Modal {}
export class MarkdownView {}
