import { classifyPage } from './index';

export type LinkResult = { ok: true; url: string } | { ok: false; message: string };

/** Check a pasted link is a product page on a supported store. */
export function parseProductLink(input: string): LinkResult {
  const text = input.trim();
  if (!text) return { ok: false, message: 'Paste a product link first.' };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, message: 'That does not look like a link.' };
  }
  if (url.protocol !== 'https:') return { ok: false, message: 'Only https links are supported.' };
  const cls = classifyPage(url);
  if (cls.kind !== 'product') return { ok: false, message: cls.message };
  return { ok: true, url: url.href };
}
