import { vi } from 'vitest';

/** Stand-in for the `obsidian` module (aliased in vitest.config.ts). */
export interface MockRequestParam {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    throw?: boolean;
}

export interface MockRequestResponse {
    status: number;
    headers: Record<string, string>;
    text: string;
    readonly json: unknown;
}

/** Tests set the behavior with mockResolvedValueOnce / mockImplementation and read mock.calls. */
export const requestUrl = vi.fn(
    (_request: MockRequestParam): Promise<MockRequestResponse> => Promise.reject(new Error('requestUrl mock not configured'))
);

/** Build a response the way Obsidian's requestUrl returns one (json getter throws on invalid JSON). */
export function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}): MockRequestResponse {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
        status,
        headers,
        text,
        get json(): unknown {
            return JSON.parse(text) as unknown;
        }
    };
}
export const Notice = vi.fn();
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Modal {}
export class MarkdownView {}
