import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';

const ALIGNMENTS = ['left', 'center', 'right'];

// Markdown column alignment arrives as `align`; saved pages carry it as `text-align`.
// Allow-listed because the value goes into a style attribute.
const align = {
  default: null,
  parseHTML: (element: HTMLElement) => {
    const value = element.getAttribute('align') || element.style.textAlign;
    return ALIGNMENTS.includes(value) ? value : null;
  },
  renderHTML: (attributes: { align?: string | null }) =>
    attributes.align ? { style: `text-align: ${attributes.align}` } : {},
};

export const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), align };
  },
});

export const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), align };
  },
});
