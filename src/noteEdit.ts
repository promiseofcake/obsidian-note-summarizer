// Pure note-editing helpers (no Obsidian imports).
// Known limitation: `## ` lines inside fenced code blocks are treated as real headings.

const FENCE = '---';

export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
    if (!content.startsWith(FENCE + '\n')) {
        return { frontmatter: '', body: content };
    }
    const lines = content.split('\n');
    for (let i = 1; i < lines.length; i++) {
        if (lines[i] === FENCE) {
            const frontmatter = lines.slice(0, i + 1).join('\n') + '\n';
            return { frontmatter, body: content.slice(frontmatter.length) };
        }
    }
    return { frontmatter: '', body: content };
}

export function hasSummarizableBody(content: string): boolean {
    return splitFrontmatter(content).body.trim().length > 0;
}

export function noteBodyForPrompt(content: string): string {
    return splitFrontmatter(content).body.trim();
}

export function appendSummary(content: string, heading: string, summary: string): string {
    const headingLine = `## ${heading}`;
    const lines = content.split('\n');
    const start = lines.indexOf(headingLine);
    if (start === -1) {
        return `${content.trimEnd()}\n\n${headingLine}\n\n${summary}\n`;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].startsWith('## ')) {
            end = i;
            break;
        }
    }
    const before = lines.slice(0, start).join('\n');
    const prefix = start === 0 ? '' : before + '\n';
    const section = `${headingLine}\n\n${summary}\n`;
    if (end === lines.length) {
        return prefix + section;
    }
    // Exactly one blank line between the new section and the next heading.
    return `${prefix}${section}\n${lines.slice(end).join('\n')}`;
}

export function replaceWithSummary(content: string, summary: string): string {
    return `${splitFrontmatter(content).frontmatter}${summary}\n`;
}
