// Plugin code uses window timers (Obsidian popout-window safe); in Node tests, window is globalThis.
// eslint-disable-next-line obsidianmd/no-global-this
(globalThis as { window?: unknown }).window ??= globalThis;
