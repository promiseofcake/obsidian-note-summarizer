import { Modal } from 'obsidian';
import type { App } from 'obsidian';

export class ConfirmReplaceModal extends Modal {
    private resolve: (confirmed: boolean) => void = () => undefined;
    private settled = false;

    constructor(app: App) {
        super(app);
    }

    /** Opens the modal and resolves true only if the user clicks Replace. */
    prompt(): Promise<boolean> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl('p', {
            text: 'Replace this note with its summary? The raw notes will be removed (undo with Cmd/Ctrl+Z or file recovery).',
        });
        const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
        buttons.createEl('button', { text: 'Replace', cls: 'mod-warning' }).addEventListener('click', () => {
            this.settle(true);
            this.close();
        });
        buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => {
            this.settle(false);
            this.close();
        });
    }

    onClose(): void {
        this.contentEl.empty();
        this.settle(false); // Esc or click-away cancels
    }

    private settle(value: boolean): void {
        if (this.settled) return;
        this.settled = true;
        this.resolve(value);
    }
}
