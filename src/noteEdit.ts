// Pure note-editing helpers (no Obsidian imports).
// The summary block always sits at the end of the note:
//
//     <notes>
//
//     ---
//
//     ## <heading>
//
//     <summary>
//
// A re-run finds the last `---` line whose next non-blank line is `## <heading>` and
// replaces from there to the end of the note. Text typed below the summary is replaced too.

const FRONTMATTER_DELIMITER = '---';

export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
    if (!/^---\r?\n/.test(content)) {
        return { frontmatter: '', body: content };
    }
    const lines = content.split('\n');
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trimEnd() === FRONTMATTER_DELIMITER) {
            const frontmatter = lines.slice(0, i + 1).join('\n') + '\n';
            return { frontmatter, body: content.slice(frontmatter.length) };
        }
    }
    return { frontmatter: '', body: content };
}

/** Index of the summary block's `---` line in `lines`, or -1. */
function findSummaryBlock(lines: string[], heading: string): number {
    const headingLine = `## ${heading}`;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trimEnd() !== FRONTMATTER_DELIMITER) continue;
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length && lines[j].trimEnd() === headingLine) return i;
    }
    return -1;
}

/** Body with any previous summary block removed. */
function notesOnly(body: string, heading: string): string {
    const lines = body.split('\n');
    const block = findSummaryBlock(lines, heading);
    return block === -1 ? body : lines.slice(0, block).join('\n');
}

/** Note text sent to the model: no frontmatter, no previous summary. */
export function noteBodyForPrompt(content: string, heading: string): string {
    return notesOnly(splitFrontmatter(content).body, heading).trim();
}

/** True when there is note text besides frontmatter and a previous summary. */
export function hasSummarizableBody(content: string, heading: string): boolean {
    return noteBodyForPrompt(content, heading).length > 0;
}

export function appendSummary(content: string, heading: string, summary: string): string {
    const { frontmatter, body } = splitFrontmatter(content);
    const notes = notesOnly(body, heading).trimEnd();
    const section = `## ${heading}\n\n${summary}\n`;
    // No rule when there are no notes: a leading `---` would read as frontmatter.
    if (notes.trim() === '') return `${frontmatter}${section}`;
    // Blank line before the rule, or the line above would become a setext heading.
    return `${frontmatter}${notes}\n\n${FRONTMATTER_DELIMITER}\n\n${section}`;
}

export function replaceWithSummary(content: string, summary: string): string {
    return `${splitFrontmatter(content).frontmatter}${summary}\n`;
}
