# Markdown paste, tables, and image paste — design

Date: 2026-10-19

## Problem

We write TRD specs in markdown, then paste them into a NotDrive page. Today the page editor does not format the paste:

- Raw markdown text lands as plain paragraphs. Only typed shortcuts (`# `, `- `, ```` ``` ````) convert.
- VS Code puts syntax-highlighted HTML on the clipboard. The editor uses that HTML, so the result is plain text.
- The editor schema has no table node. It drops tables on paste and on load. This also hits pages from the ZIP markdown import.
- Images upload only through the `/image` command. Paste and drag-drop do nothing.

Users fix the formatting by hand after each paste.

## Goal

Paste a markdown TRD from a `.md` file (editor or terminal) and get a formatted page: headings, lists, task lists, code blocks, tables, links, and images. Edit tables in place. Paste or drop image files directly.

## Out of scope

- Copy a page out as markdown.
- Rendered-HTML paste from chat UIs (claude.ai, ChatGPT).
- Copy remote images into NotDrive storage. Markdown image URLs link to the original site.

## Design

### 1. Shared converter — `packages/shared/src/markdown.ts`

- `markdownToHtml(md: string): string` uses `marked` with `gfm: true, breaks: false`. These are the importer's current options.
- In a list that mixes task and plain items, task items keep their state as literal `[ ]` / `[x]` text, because the editor cannot show a checkbox in a bullet list.
- The function changes GFM task lists into the HTML that TipTap TaskList reads: `<ul data-type="taskList">` with `<li data-type="taskItem" data-checked="true|false">`. Without this step, checkboxes come out as plain bullets.
- With `{ paste: true }`, single line breaks stay as line breaks (`breaks: true`), raw HTML is escaped so tag-like text such as `<div>` stays visible, and images whose source is not `http(s)` render as the "Image not found" note (section 4). The importer uses the default, because it resolves relative paths against the ZIP.
- `looksLikeMarkdown(text: string): boolean` returns true if the text has one strong signal: a code fence, a table separator row (`|---|`, one or more columns), a task item (`- [ ]` / `- [x]`), an image `![…](…)`, or a link `[…](…)` (an optional `"title"` is fine) whose target starts with `http(s):`, `mailto:`, `#`, `/`, `./` or `../`. Otherwise it needs two different weak signals: ATX heading, bullet item, ordered item, blockquote. Shell comments (`# …`) and YAML lists each look like one weak signal, so code snippets stay plain text. The cost: a paste that is only a bullet list (from a terminal, not VS Code) stays plain text. Line patterns use `[ \t]`, not `\s`, so a long run of blank lines cannot cause slow backtracking.
- The function removes the trailing newline that `marked` puts inside `<pre><code>`. Otherwise the editor shows an empty last line in each code block.
- `apps/api/src/services/importer.ts` calls `markdownToHtml` instead of its own `Marked` instance. ZIP import and paste then give the same HTML.
- `marked` moves from `apps/api` to `packages/shared` dependencies, at the same pinned version (14.1.4).

### 2. Tables — `apps/web/src/features/editor/Editor.tsx`

- Add `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-header` and `@tiptap/extension-table-cell`, pinned at 2.27.2 like the other TipTap packages. Configure `Table` with `resizable: true`.
- Add a "Table" slash command. It inserts a 3×3 table with a header row.
- The Comment button is hidden for a multi-cell selection, because its range spans unselected cells.
- When the selection is in a table, the bubble toolbar shows these actions: add row above, add row below, add column left, add column right, delete row, delete column, toggle header row, delete table.
- Add table styles (borders, header background, cell padding) next to the existing `prose` classes so tables match the theme in light and dark mode.
- Table header and cell nodes keep markdown column alignment (`align` attribute, saved as `text-align`). Only `left`, `center` and `right` are kept, because the value goes into a `style` attribute.
- Add `@tiptap/extension-link` (2.27.2). StarterKit 2 has no link mark, so links in pasted or imported markdown would become plain text. Configure `openOnClick: false` and `linkOnPaste: false`. A plain click edits the link text, and Cmd/Ctrl+click opens the link in a new tab.

### 3. Markdown paste — `apps/web/src/features/editor/pasteAndDrop.ts`

A TipTap extension with a ProseMirror `handlePaste` prop:

1. If the clipboard has image files and lacks `text/html` or `text/plain`, use the image path (section 4) and stop. Office apps put a rendered PNG next to both, so their content wins. Screenshots, Finder copies (file name as text only) and browser "Copy image" (an `<img>` as HTML only) upload the file.
2. If the selection is in a code block, or Shift was held (Cmd+Shift+V), or the selection spans several table cells (the table plugin fills them), return `false` (default paste).
2a. If `vscode-editor-data` names a language other than `markdown`, return `false`. For a VS Code markdown copy, every "skip conversion" path (Shift held, table inside a table, conversion error) calls `view.pasteText(text)` instead of returning `false`, because CodeBlock's handler would wrap it in a code block. TipTap's CodeBlock paste handler then makes a code block in that language. The extension has priority 1000, so it runs before that handler and a VS Code markdown copy is converted, not wrapped in a code block.
3. If `text/html` has rich tags (`a`, `b`, `strong`, `em`, `ul`, `ol`, `li`, `table`, headings, `blockquote`, `img`, `pre`) or `data-pm-slice`, return `false`. Word, browsers, code copied from web pages and NotDrive itself keep their normal rich paste. VS Code sends only styled `div`/`span`, so its HTML is ignored. (JetBrains sends `<pre>`, so a JetBrains markdown copy pastes as code.)
4. Read `text/plain`. If VS Code did not mark it as `markdown` and `looksLikeMarkdown` is false, return `false` (default paste). A VS Code markdown copy always converts, so prose from a `.md` file does not become a code block.
5. Convert with `markdownToHtml(text, { paste: true })`, parse it as a full document with the editor schema (this fills required nodes, such as the paragraph in an empty table cell), and dispatch `replaceSelection` with its content. If the cursor is in a table and the converted content has a table, return `false`, because nested tables are not wanted. The slice is open only at edge paragraphs, so inline markdown joins the current paragraph, while headings, lists and code blocks stay whole blocks. The transaction is not marked as a paste, so TipTap paste rules do not change the parsed content (for example escaped `\*` or link targets).

ProseMirror calls `handlePaste` for Cmd+Shift+V too. So the extension records `shiftKey` from `keydown`/`keyup` DOM events and clears it on `blur`, to keep Cmd+Shift+V as a plain-text paste. Shift+Insert (the Linux/Windows paste shortcut) does not count.

The editor schema drops unknown tags and attributes on insert. So pasted HTML cannot inject scripts or styles.

### 4. Images

**Image files (paste and drop).**

- Move the upload logic out of the `/image` command in `SlashMenu.tsx` into one helper, `uploadAndInsertImages(editor, itemId, files, range)`. The `/image` command, `handlePaste`, and `handleDrop` all call it. The caller captures `range` when the user acts. The helper uploads the files in order, maps `range` through every transaction during the uploads (a small plugin does this through plugin state, so it also sees transactions other plugins append), then inserts all uploaded images in one step, so their order is fixed. It replaces `range` only if at least one upload succeeds, and does not move the user's cursor. A non-empty range grows over neither text typed before it nor after it. A caret point stays before text typed at it, so a caption typed after pasting lands after the image. Each upload has a sequence number, so images pasted at the same caret keep paste order whichever upload finishes first. If the user leaves the page during the uploads, or `setBody` (Refresh) replaces the page content, it inserts nothing. Other edits, such as Select All plus typing, keep the insert.
- The helper keeps the current behavior: "Uploading image…" loading toast, `http.uploadItemAsset`, `setImage` with `resolveItemAssetUrl(url)`, and a failure toast.
- If `itemId` is missing (page still saving), show the same error toast as `/image`.
- Accept the same types as `/image`: png, jpeg, gif, webp, svg. Ignore other files and let the default behavior run.
- `handleDrop` inserts at the drop position. Over a multi-cell selection, a pasted image goes into the anchor cell. Inside a code block, an image goes right after the block, so the block is not split. `handlePaste` replaces the selected content after a successful upload. A failed upload leaves it in place. `/image` inserts at the cursor position at the time of the action.

**Images in markdown.**

- `https://` and `http://` sources stay as they are. The `<img>` loads from the original site.
- Any other source (relative or local path) becomes an italic note: *Image not found: `<filename>`. Drag the file here.* Paste calls `markdownToHtml` with `paste: true` to get this.

## Error handling

- Conversion is synchronous and local. If `marked` throws, fall back to default paste and log to the console.
- Upload errors use the existing failure toast. The rest of the paste stays in the page.

## Testing

Vitest unit tests:

- `markdownToHtml`: tables with alignment, task lists (checked and unchecked), nested lists, code fences with language, images, links.
- `looksLikeMarkdown`: each strong signal and a two-weak-signal sample give true. A plain sentence, a bare URL, an inline `*`, a shell snippet with `#` comments, and a YAML list give false.
- Importer: an existing or new test confirms that ZIP import output does not change, apart from task-list markup.

Manual checks in `pnpm dev`:

1. Paste a real TRD `.md` copied from VS Code.
2. Paste the same TRD copied from a terminal.
3. Paste a screenshot from the clipboard.
4. Drag a PNG file onto the page.
5. Add and delete rows and columns, and toggle the header row.
6. Import a ZIP that has a table, and open the page.
7. Paste markdown with one `https://` image and one `./local.png` image.
