import { describe, expect, it } from 'vitest';
import { parseProductLink } from '../src/adapters/link';

describe('pasted product link', () => {
  it('accepts supported product pages, with or without https://', () => {
    expect(parseProductLink('https://www.target.com.au/p/australian-cotton-relaxed-t-shirt/73125303')).toEqual({
      ok: true,
      url: 'https://www.target.com.au/p/australian-cotton-relaxed-t-shirt/73125303',
    });
    expect(parseProductLink('  www.kmart.com.au/product/oversized-print-t-shirt-s175529/?selectedSwatch=Gry+Taco ')).toMatchObject({ ok: true });
  });

  it('gives a clear message otherwise', () => {
    expect(parseProductLink('')).toMatchObject({ ok: false });
    expect(parseProductLink('not a link at all')).toMatchObject({ ok: false, message: expect.stringContaining('link') });
    expect(parseProductLink('http://www.target.com.au/p/x/123')).toMatchObject({ ok: false, message: expect.stringContaining('https') });
    expect(parseProductLink('https://www.example.com/p/x/123')).toMatchObject({ ok: false, message: expect.stringContaining('not supported') });
    expect(parseProductLink('https://www.myer.com.au/p/some-tee')).toMatchObject({ ok: false, message: expect.stringContaining('Myer') });
    expect(parseProductLink('https://www.target.com.au/c/men/tops/W133028')).toMatchObject({ ok: false, message: expect.stringContaining('product page') });
  });
});
