import { Marked } from 'marked';
import { describe, expect, it } from 'vitest';
import { looksLikeMarkdown, markdownToHtml } from '../src/markdown.js';

describe('markdownToHtml', () => {
  it('matches the plain gfm output for documents without task lists or code blocks', () => {
    const md =
      '# Title\n\nText with **bold** and `code`.\n\n- a\n  - nested\n\n1. one\n\n> quote\n';
    const reference = new Marked({ gfm: true, breaks: false }).parse(md, { async: false });
    expect(markdownToHtml(md)).toBe(reference);
  });

  it('drops the trailing newline inside code blocks', () => {
    expect(markdownToHtml('```ts\nconst x = 1;\n```\n')).toBe(
      '<pre><code class="language-ts">const x = 1;</code></pre>\n',
    );
  });

  it('renders gfm tables', () => {
    const html = markdownToHtml('| a | b |\n|:--|--:|\n| 1 | 2 |\n');
    expect(html).toContain('<table>');
    expect(html).toContain('<th align="left">a</th>');
    expect(html).toContain('<td align="right">2</td>');
  });

  it('renders task lists as TipTap task items', () => {
    const html = markdownToHtml('- [ ] todo\n- [x] done\n');
    expect(html).toContain('<ul data-type="taskList">');
    expect(html).toContain('<li data-type="taskItem" data-checked="false">todo</li>');
    expect(html).toContain('<li data-type="taskItem" data-checked="true">done</li>');
    expect(html).not.toContain('<input');
  });

  it('keeps mixed lists as normal bullets with the task state as text', () => {
    const html = markdownToHtml('- [ ] todo\n- [x] done\n- plain\n');
    expect(html).not.toContain('taskList');
    expect(html).not.toContain('<input');
    expect(html).toContain('<li>[ ] todo</li>');
    expect(html).toContain('<li>[x] done</li>');
  });

  it('keeps remote images and replaces local ones in paste mode', () => {
    const md = '![a](https://x.test/a.png)\n\n![b](./img/b.png)\n';
    const html = markdownToHtml(md, { paste: true });
    expect(html).toContain('<img src="https://x.test/a.png" alt="a">');
    expect(html).toContain('<em>Image not found: b.png. Drag the file here.</em>');
  });

  it('keeps single line breaks in paste mode only', () => {
    expect(markdownToHtml('one\ntwo\n', { paste: true })).toBe('<p>one<br>two</p>\n');
    expect(markdownToHtml('one\ntwo\n')).toBe('<p>one\ntwo</p>\n');
  });

  it('escapes raw html in paste mode only', () => {
    expect(markdownToHtml('- use <div> here\n', { paste: true })).toContain('use &lt;div&gt; here');
    expect(markdownToHtml('- use <div> here\n')).toContain('use <div> here');
  });

  it('keeps local images by default so the importer can resolve them', () => {
    expect(markdownToHtml('![b](./b.png)\n')).toContain('<img src="./b.png" alt="b">');
  });
});

describe('looksLikeMarkdown', () => {
  it.each([
    '# Heading\n\n- item',
    '1. first\n\n> quoted',
    '- [ ] task',
    '| a | b |\n|---|---|',
    '|:--|--:|',
    '| a |\n| --- |\n| b |',
    '[docs](https://x.test "Docs")',
    '![img](a.png "Title")',
    '```\ncode\n```',
    'see [docs](https://x.test)',
    'see [spec](./spec.md)',
    '![img](a.png)',
  ])('detects %j', (text) => {
    expect(looksLikeMarkdown(text)).toBe(true);
  });

  it.each([
    'just a plain sentence.',
    'https://x.test/page',
    'price is 5 * 3 today',
    '# install deps\nnpm install\n# run\nnpm start',
    'items:\n  - a\n  - b',
    'handlers[type](event);',
  ])('ignores %j', (text) => {
    expect(looksLikeMarkdown(text)).toBe(false);
  });

  it('stays fast on long runs of blank lines and spaces', () => {
    const start = performance.now();
    expect(looksLikeMarkdown(`a${'\n'.repeat(20_000)}b`)).toBe(false);
    expect(looksLikeMarkdown(`${' '.repeat(100_000)}x`)).toBe(false);
    expect(looksLikeMarkdown(`|-|${' '.repeat(100_000)}x`)).toBe(false);
    expect(looksLikeMarkdown(`${'['.repeat(100_000)}x`)).toBe(false);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
