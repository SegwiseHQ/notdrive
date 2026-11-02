import htmlToPdfmake from 'html-to-pdfmake';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import { resolveItemAssetUrls } from '../../lib/itemAssets.js';
import emojiFontUrl from './pdfFonts/NotoEmoji.ttf?url';

pdfMake.addVirtualFileSystem(pdfFonts);

const PAGE_WIDTH = 499;
const MAX_IMAGE_HEIGHT = 650;
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function textRuns(text: string): ContentText[] {
  const runs: ContentText[] = [];
  for (const { segment } of graphemes.segment(text)) {
    const font = EMOJI.test(segment) ? 'Emoji' : 'Roboto';
    const last = runs.at(-1);
    if (last?.font === font) last.text += segment;
    else runs.push({ text: segment, font });
  }
  return runs;
}

// Normalize uploaded GIF, WebP and SVG images to PNG as well as embedding
// remote assets. The downloaded PDF must keep working without the app.
async function embedImage(src: string) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      image.src = '';
      reject(new Error('An image took too long to load. Please try exporting again.'));
    }, 15_000);
    image.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Could not load an image. Please check the document and try again.'));
    };
    image.src = src;
  });
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not prepare an image for PDF export.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    src: canvas.toDataURL('image/png'),
    width: Math.min(PAGE_WIDTH, image.naturalWidth * 0.75),
  };
}

async function prepareBody(html: string) {
  // Parse off-screen: no editor controls, comment highlights or dark theme
  // styles should become part of the exported document.
  const doc = new DOMParser().parseFromString(resolveItemAssetUrls(html), 'text/html');
  for (const element of doc.body.querySelectorAll('*')) {
    element.removeAttribute('class');
    element.removeAttribute('style');
    element.removeAttribute('data-pdfmake');
  }

  for (const task of doc.querySelectorAll('li[data-type="taskItem"]')) {
    task.querySelector(':scope > label')?.remove();
    const firstBlock = task.querySelector(':scope > div > p') ?? task;
    firstBlock.prepend(
      doc.createTextNode(task.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] '),
    );
  }
  for (const list of doc.querySelectorAll<HTMLElement>('ul[data-type="taskList"]')) {
    list.style.listStyleType = 'none';
  }
  for (const heading of doc.querySelectorAll('h1, h2, h3')) {
    heading.setAttribute('data-pdfmake', JSON.stringify({ headlineLevel: 1 }));
  }
  for (const rule of doc.querySelectorAll('hr')) {
    rule.setAttribute('data-pdfmake', JSON.stringify({ width: PAGE_WIDTH, color: '#d1d5db' }));
  }
  // Empty paragraphs represent intentional blank lines in TipTap.
  for (const paragraph of doc.querySelectorAll('p')) {
    if (!paragraph.hasChildNodes()) paragraph.textContent = '\u00a0';
  }
  // A trailing margin can push pdfmake onto a blank final page.
  const lastBlock = doc.body.lastElementChild;
  if (lastBlock instanceof HTMLElement) lastBlock.style.marginBottom = '0';

  // Roboto lacks emoji glyphs. Keep complete sequences (skin tones, flags,
  // joined emoji) together and use a bundled font only for those runs.
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const emojiNodes: Text[] = [];
  while (walker.nextNode()) {
    if (EMOJI.test(walker.currentNode.textContent ?? ''))
      emojiNodes.push(walker.currentNode as Text);
  }
  for (const node of emojiNodes) {
    const fragment = doc.createDocumentFragment();
    for (const run of textRuns(node.data)) {
      const span = doc.createElement('span');
      span.style.fontFamily = run.font ?? 'Roboto';
      span.textContent = String(run.text);
      fragment.append(span);
    }
    node.replaceWith(fragment);
  }

  const images = new Map<string, ReturnType<typeof embedImage>>();
  await Promise.all(
    Array.from(doc.images, async (image) => {
      const src = image.getAttribute('src');
      if (!src) throw new Error('The document contains an image without a source.');
      let embedded = images.get(src);
      if (!embedded) {
        embedded = embedImage(src);
        images.set(src, embedded);
      }
      const result = await embedded;
      image.removeAttribute('width');
      image.removeAttribute('height');
      image.setAttribute('src', result.src);
      image.setAttribute('data-pdfmake', JSON.stringify({ fit: [result.width, MAX_IMAGE_HEIGHT] }));
    }),
  );
  return doc.body.innerHTML;
}

export async function exportDocumentPdf(title: string, html: string) {
  const documentTitle = title.trim() || 'Untitled';
  if (EMOJI.test(documentTitle + html)) {
    const font = new URL(emojiFontUrl, window.location.href).href;
    pdfMake.addFonts({ Emoji: { normal: font, bold: font, italics: font, bolditalics: font } });
  }
  const content = htmlToPdfmake(await prepareBody(html), {
    defaultStyles: {
      h1: { fontSize: 22, bold: true, margin: [0, 16, 0, 8] },
      h2: { fontSize: 17, bold: true, margin: [0, 14, 0, 7] },
      h3: { fontSize: 13, bold: true, margin: [0, 12, 0, 6] },
      p: { margin: [0, 0, 0, 8] },
      ul: { margin: [0, 0, 0, 8] },
      ol: { margin: [0, 0, 0, 8] },
      li: { margin: [0, 0, 0, 3] },
      blockquote: { color: '#4b5563', italics: true, margin: [14, 4, 0, 10] },
      pre: { fontSize: 9, background: '#f3f4f6', margin: [0, 4, 0, 10] },
      code: { background: '#f3f4f6' },
    },
  });
  const definition: TDocumentDefinitions = {
    info: { title: documentTitle, creator: 'NotDrive' },
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 48],
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.35, color: '#111827' },
    content: [
      { text: textRuns(documentTitle), fontSize: 28, bold: true, margin: [0, 0, 0, 20] },
      content,
    ],
    footer: (page, pages) => ({
      text: `${page} / ${pages}`,
      alignment: 'right',
      fontSize: 9,
      color: '#6b7280',
      margin: [48, 12, 48, 0],
    }),
    pageBreakBefore: (node, nodes) =>
      !!node.headlineLevel &&
      (nodes.getFollowingNodesOnPage().length === 0 || node.startPosition.top > 730),
  };
  const filename =
    documentTitle
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, '-')
      .slice(0, 160)
      .replace(/[. ]+$/g, '') || 'Untitled';
  await pdfMake.createPdf(definition).download(`${filename}.pdf`);
}
