import { describe, expect, it } from 'vitest';
import {
    appendSummary,
    hasSummarizableBody,
    noteBodyForPrompt,
    replaceWithSummary,
    splitFrontmatter
} from '../src/noteEdit';

describe('splitFrontmatter', () => {
    it('splits frontmatter including both fences and trailing newline', () => {
        expect(splitFrontmatter('---\na: 1\n---\nbody')).toEqual({
            frontmatter: '---\na: 1\n---\n',
            body: 'body'
        });
    });
    it('returns empty frontmatter when none', () => {
        expect(splitFrontmatter('raw')).toEqual({ frontmatter: '', body: 'raw' });
    });
    it('treats a missing closing fence as all body', () => {
        const c = '---\na: 1\nbody';
        expect(splitFrontmatter(c)).toEqual({ frontmatter: '', body: c });
    });
});

describe('splitFrontmatter fences', () => {
    const crlf = '---\r\na: 1\r\n---\r\nhello\r\n';
    it('handles CRLF frontmatter', () => {
        expect(noteBodyForPrompt(crlf, 'Summary')).toBe('hello');
        expect(noteBodyForPrompt(crlf, 'Summary')).not.toContain('a: 1');
        expect(replaceWithSummary(crlf, 'S')).toBe('---\r\na: 1\r\n---\r\nS\n');
    });
    it('recognizes a closing fence with trailing space', () => {
        expect(splitFrontmatter('---\na: 1\n--- \nbody')).toEqual({
            frontmatter: '---\na: 1\n--- \n',
            body: 'body'
        });
    });
});

describe('hasSummarizableBody', () => {
    it('is false for whitespace-only body', () => {
        expect(hasSummarizableBody('---\na: 1\n---\n  \n', 'Summary')).toBe(false);
    });
    it('is false for empty content', () => {
        expect(hasSummarizableBody('', 'Summary')).toBe(false);
    });
    it('is true for text', () => {
        expect(hasSummarizableBody('x', 'Summary')).toBe(true);
    });
    it('is true when no closing fence (all body)', () => {
        expect(hasSummarizableBody('---\na: 1', 'Summary')).toBe(true);
    });
});

describe('noteBodyForPrompt', () => {
    it('strips frontmatter and trims', () => {
        expect(noteBodyForPrompt('---\na: 1\n---\nhello\n', 'Summary')).toBe('hello');
    });
    it('leaves out a previous summary block', () => {
        expect(noteBodyForPrompt('raw\n\n---\n\n## Summary\n\nold\n', 'Summary')).toBe('raw');
    });
});

describe('hasSummarizableBody with a previous summary', () => {
    it('is false when the note is only a summary block', () => {
        expect(hasSummarizableBody('---\n\n## Summary\n\nold\n', 'Summary')).toBe(false);
    });
});

describe('appendSummary', () => {
    const block = (s: string) => `---\n\n## Summary\n\n${s}\n`;

    it('appends a rule, the heading and the summary at the end', () => {
        expect(appendSummary('# Notes\nraw', 'Summary', 'S')).toBe(`# Notes\nraw\n\n${block('S')}`);
    });
    it('puts a blank line before the rule so the last line does not become a heading', () => {
        expect(appendSummary('raw\n', 'Summary', 'S')).toMatch(/raw\n\n---\n/);
    });
    it('replaces the previous block on a re-run, leaving one', () => {
        const once = appendSummary('# Notes\nraw', 'Summary', 'S');
        const twice = appendSummary(once, 'Summary', 'S2');
        expect(twice).toBe(`# Notes\nraw\n\n${block('S2')}`);
        expect(twice.match(/^## Summary$/gm)).toHaveLength(1);
    });
    it('is idempotent in shape', () => {
        const once = appendSummary('# Notes\nraw', 'Summary', 'S');
        expect(appendSummary(once, 'Summary', 'S')).toBe(once);
    });
    it('keeps notes added above the summary between runs', () => {
        const once = appendSummary('raw', 'Summary', 'S');
        const edited = once.replace('raw', 'raw\nmore');
        expect(appendSummary(edited, 'Summary', 'S2')).toBe(`raw\nmore\n\n${block('S2')}`);
    });
    it('replaces text typed below the summary', () => {
        const once = appendSummary('raw', 'Summary', 'S');
        expect(appendSummary(`${once}\nbelow\n`, 'Summary', 'S2')).toBe(`raw\n\n${block('S2')}`);
    });
    it('leaves other horizontal rules alone', () => {
        const notes = 'part 1\n\n---\n\npart 2';
        const once = appendSummary(notes, 'Summary', 'S');
        expect(appendSummary(once, 'Summary', 'S2')).toBe(`${notes}\n\n${block('S2')}`);
    });
    it('does not treat a hand-written heading without a rule as the summary', () => {
        const notes = '## Summary\n\nmy own words';
        expect(appendSummary(notes, 'Summary', 'S')).toBe(`${notes}\n\n${block('S')}`);
    });
    it('matches the rule and heading ignoring trailing whitespace', () => {
        expect(appendSummary('raw\n\n--- \n\n## Summary  \n\nold\n', 'Summary', 'new')).toBe(`raw\n\n${block('new')}`);
    });
    it('supports custom headings', () => {
        expect(appendSummary('raw', 'TL;DR', 'S')).toBe('raw\n\n---\n\n## TL;DR\n\nS\n');
    });
    it('preserves frontmatter and never mistakes it for the rule', () => {
        const once = appendSummary('---\na: 1\n---\nraw', 'Summary', 'S');
        expect(once).toBe(`---\na: 1\n---\nraw\n\n${block('S')}`);
        expect(appendSummary(once, 'Summary', 'S2')).toBe(`---\na: 1\n---\nraw\n\n${block('S2')}`);
    });
    it('omits the rule when there are no notes, so it cannot read as frontmatter', () => {
        expect(appendSummary('', 'Summary', 'S')).toBe('## Summary\n\nS\n');
        expect(appendSummary('---\na: 1\n---\n', 'Summary', 'S')).toBe('---\na: 1\n---\n## Summary\n\nS\n');
    });
});

describe('replaceWithSummary', () => {
    it('keeps frontmatter and replaces body', () => {
        expect(replaceWithSummary('---\ntags: [a]\n---\nraw body', 'S')).toBe('---\ntags: [a]\n---\nS\n');
    });
    it('works without frontmatter', () => {
        expect(replaceWithSummary('raw', 'S')).toBe('S\n');
    });
});
