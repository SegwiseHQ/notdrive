import { Marked, type Tokens } from 'marked';

export interface MarkdownToHtmlOptions {
  /**
   * Paste mode: keep single line breaks, and replace non-http(s) images with a
   * visible note because the browser cannot read local files.
   */
  paste?: boolean;
}

const REMOTE_SRC = /^https?:\/\//i;

// Line patterns use [ \t], not \s: \s crosses newlines and backtracks badly on blank runs.
// Any one of these is enough: plain text rarely has them.
const STRONG_SIGNALS = [
  /^[ \t]*(```|~~~)/m,
  // Table separator row: two or more columns, or one column between pipes.
  // Each [ \t]* sits between required tokens, so whitespace runs match in one way only.
  /^[ \t]*(\|[ \t]*)?:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)+(\|[ \t]*)?$|^[ \t]*\|[ \t]*:?-+:?[ \t]*\|[ \t]*$/m,
  /^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]/m,
  // Links need a URL-like target so code such as `handlers[type](event)` does not match.
  // Labels exclude `[` so a long run of brackets scans in linear time.
  /!\[[^[\]\n]*\]\([^)\s]+([ \t]+"[^"\n]*")?\)|\[[^[\]\n]*\]\((https?:|mailto:|#|\.{0,2}\/)[^)\s]*([ \t]+"[^"\n]*")?\)/,
];
// Shell comments and YAML lists look like one of these, so it takes two kinds.
const WEAK_SIGNALS = [
  /^#{1,6}[ \t]/m,
  /^[ \t]*[-*+][ \t]+\S/m,
  /^[ \t]*\d{1,9}[.)][ \t]+\S/m,
  /^>/m,
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMarked(paste: boolean): Marked {
  return new Marked({
    gfm: true,
    breaks: paste,
    renderer: {
      // TipTap's TaskList parses only its own data-type markup, not gfm checkbox inputs.
      list(token: Tokens.List) {
        if (!token.items.every((item) => item.task)) return false;
        const items = token.items
          .map((item) => {
            const body = this.parser.parse(item.tokens, !!item.loose);
            return `<li data-type="taskItem" data-checked="${item.checked ? 'true' : 'false'}">${body}</li>\n`;
          })
          .join('');
        return `<ul data-type="taskList">\n${items}</ul>\n`;
      },
      // Paste input is plain text, so tag-like text such as `<div>` must stay visible.
      html(token: Tokens.HTML | Tokens.Tag) {
        return paste ? escapeHtml(token.text) : false;
      },
      // In mixed lists the editor cannot show a checkbox, so keep the state as text.
      checkbox({ checked }: Tokens.Checkbox) {
        return checked ? '[x]' : '[ ]';
      },
      image(token: Tokens.Image) {
        if (!paste || REMOTE_SRC.test(token.href)) return false;
        const name = token.href.split('/').pop() || token.href;
        return `<em>Image not found: ${escapeHtml(name)}. Drag the file here.</em>`;
      },
    },
  });
}

const markedDefault = buildMarked(false);
const markedPaste = buildMarked(true);

export function markdownToHtml(md: string, options: MarkdownToHtmlOptions = {}): string {
  const marked = options.paste ? markedPaste : markedDefault;
  // marked ends code blocks with a newline, which the editor shows as an empty last line.
  return marked.parse(md, { async: false }).replace(/\n<\/code><\/pre>/g, '</code></pre>');
}

export function looksLikeMarkdown(text: string): boolean {
  if (STRONG_SIGNALS.some((re) => re.test(text))) return true;
  return WEAK_SIGNALS.filter((re) => re.test(text)).length >= 2;
}
