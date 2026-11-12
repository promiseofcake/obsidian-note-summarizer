import { Notice } from 'obsidian';
import type { AwsAuthError } from './bedrock';

/** Sticky notice for an AWS auth failure, with a Copy command button when there is a fix. */
export function showAwsAuthNotice(error: AwsAuthError): Notice {
    const fix = error.fixCommand;
    const fragment = createFragment((frag) => {
        frag.createDiv({ text: error.message });
        if (!fix) return;
        frag.createEl('code', { text: fix });
        const button = frag.createEl('button', { text: 'Copy command' });
        button.addEventListener('click', (evt) => {
            evt.stopPropagation(); // keep the notice open
            void navigator.clipboard.writeText(fix);
        });
    });
    return new Notice(fragment, 0);
}
