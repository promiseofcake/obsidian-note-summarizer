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
        expect(noteBodyForPrompt(crlf)).toBe('hello');
        expect(noteBodyForPrompt(crlf)).not.toContain('a: 1');
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
        expect(hasSummarizableBody('---\na: 1\n---\n  \n')).toBe(false);
    });
    it('is false for empty content', () => {
        expect(hasSummarizableBody('')).toBe(false);
    });
    it('is true for text', () => {
        expect(hasSummarizableBody('x')).toBe(true);
    });
    it('is true when no closing fence (all body)', () => {
        expect(hasSummarizableBody('---\na: 1')).toBe(true);
    });
});

describe('noteBodyForPrompt', () => {
    it('strips frontmatter and trims', () => {
        expect(noteBodyForPrompt('---\na: 1\n---\nhello\n')).toBe('hello');
    });
});

describe('appendSummary', () => {
    it('appends a new section', () => {
        expect(appendSummary('# Notes\nraw', 'Summary', 'S')).toBe('# Notes\nraw\n\n## Summary\n\nS\n');
    });
    it('replaces on repeat, leaving one section', () => {
        const once = appendSummary('# Notes\nraw', 'Summary', 'S');
        const twice = appendSummary(once, 'Summary', 'S2');
        expect(twice.match(/^## Summary$/gm)).toHaveLength(1);
        expect(twice).toContain('S2');
        expect(twice).not.toMatch(/^S$/m);
        expect(twice).toBe('# Notes\nraw\n\n## Summary\n\nS2\n');
    });
    it('is idempotent in shape', () => {
        const once = appendSummary('# Notes\nraw', 'Summary', 'S');
        expect(appendSummary(once, 'Summary', 'S')).toBe(once);
    });
    it('keeps following sections with one blank line before them', () => {
        const out = appendSummary('## Summary\n\nold\n\n## Appendix\nkeep', 'Summary', 'new');
        expect(out).toBe('## Summary\n\nnew\n\n## Appendix\nkeep');
        expect(out.indexOf('new')).toBeLessThan(out.indexOf('## Appendix\nkeep'));
    });
    it('is stable when re-summarizing a section followed by another', () => {
        const once = appendSummary('## Summary\n\nold\n\n## Appendix\nkeep', 'Summary', 'new');
        expect(appendSummary(once, 'Summary', 'new2')).toBe('## Summary\n\nnew2\n\n## Appendix\nkeep');
    });
    it('ends the section at the next H1 so it is not swallowed', () => {
        const out = appendSummary('## Summary\n\nold\n\n# Next\nkeep', 'Summary', 'new');
        expect(out).toBe('## Summary\n\nnew\n\n# Next\nkeep');
    });
    it('matches the heading ignoring trailing whitespace', () => {
        const out = appendSummary('raw\n\n## Summary  \n\nold\n', 'Summary', 'new');
        expect(out).toBe('raw\n\n## Summary\n\nnew\n');
    });
    it('replaces ### subsections inside the summary section', () => {
        const out = appendSummary('## Summary\n\nold\n\n### Sub\nx\n\n## After\nkeep', 'Summary', 'new');
        expect(out).toBe('## Summary\n\nnew\n\n## After\nkeep');
    });
    it('keeps prose before a final summary section', () => {
        const out = appendSummary('# T\nprose\n\n## Summary\n\nold\n', 'Summary', 'new');
        expect(out).toBe('# T\nprose\n\n## Summary\n\nnew\n');
    });
    it('supports custom headings', () => {
        expect(appendSummary('raw', 'TL;DR', 'S')).toContain('\n## TL;DR\n');
    });
    it('does not match a heading that merely starts with the heading text', () => {
        const out = appendSummary('## Summary of call\nstuff', 'Summary', 'S');
        expect(out).toBe('## Summary of call\nstuff\n\n## Summary\n\nS\n');
    });
    it('preserves frontmatter when appending', () => {
        expect(appendSummary('---\na: 1\n---\nraw', 'Summary', 'S')).toBe(
            '---\na: 1\n---\nraw\n\n## Summary\n\nS\n'
        );
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
