import { apiOrigin } from './api.js';

const ITEM_ASSET_PATH = '/item-assets/';

export function resolveItemAssetUrl(url: string): string {
  if (!url.startsWith(ITEM_ASSET_PATH)) return url;
  return new URL(url, apiOrigin()).toString();
}

export function resolveItemAssetUrls(html: string): string {
  if (!html.includes(ITEM_ASSET_PATH)) return html;

  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const image of document.querySelectorAll<HTMLImageElement>('img[src]')) {
    const src = image.getAttribute('src');
    if (src) image.setAttribute('src', resolveItemAssetUrl(src));
  }
  return document.body.innerHTML;
}

export function makeItemAssetUrlsPortable(html: string): string {
  const assetPrefix = new URL(ITEM_ASSET_PATH, apiOrigin()).toString();
  return html.includes(assetPrefix) ? html.split(assetPrefix).join(ITEM_ASSET_PATH) : html;
}
