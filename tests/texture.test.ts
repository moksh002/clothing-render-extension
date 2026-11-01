import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { extractLook, type Look, type Pixels } from '../src/look/segment';
import { buildAtlas, buildTexture, fabricPatch, type Texture } from '../src/look/texture';
import { sizedImageUrl } from '../src/look/urls';

const load = (name: string): Pixels => {
  const { data, width, height } = jpeg.decode(readFileSync(`tests/fixtures/images/${name}.jpg`), { useTArray: true });
  return { data, width, height };
};

/** A flat garment-coloured image with a brightness gradient (a baked-in shadow) and a full mask. */
function shaded(): { img: Pixels; look: Look } {
  const w = 64, h = 64;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = 0.5 + (y / h) * 1.0; // dark at the top, bright at the bottom
    const o = (y * w + x) * 4;
    data[o] = 100 * k; data[o + 1] = 60 * k; data[o + 2] = 40 * k; data[o + 3] = 255;
  }
  const mask = new Uint8Array(w * h).fill(1);
  return { img: { data, width: w, height: h }, look: { colour: '#643c28', hasPrint: false, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, mask, maskWidth: w, maskHeight: h } };
}

const rowMean = (t: Texture, y: number) => {
  let s = 0;
  for (let x = 4; x < t.width - 4; x++) s += t.data[(y * t.width + x) * 4];
  return s / (t.width - 8);
};

describe('de-shading', () => {
  it('flattens a brightness gradient but keeps the colour', () => {
    const { img, look } = shaded();
    const raw = buildTexture(img, look, { maxSide: 64 });
    const flat = buildTexture(img, look, { maxSide: 64, deshade: 1 });
    const spread = (t: Texture) => Math.abs(rowMean(t, t.height - 8) - rowMean(t, 8));
    expect(spread(flat)).toBeLessThan(spread(raw) * 0.5);
    // red stays the strongest channel
    const o = (flat.height >> 1) * flat.width * 4 + (flat.width >> 1) * 4;
    expect(flat.data[o]).toBeGreaterThan(flat.data[o + 2]);
  });
});

describe('atlas', () => {
  const tex = (w: number, h: number, v: number): Texture => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(v) });

  it('places front and back side by side with inner u-ranges', () => {
    const a = buildAtlas(tex(40, 80, 10), tex(60, 80, 200))!;
    expect(a.texture.height).toBe(80);
    expect(a.texture.width).toBe(100);
    expect(a.front!.u0).toBeGreaterThan(0);
    expect(a.front!.u1).toBeLessThan(a.back!.u0);
    expect(a.back!.u1).toBeLessThanOrEqual(1);
    // the left half holds the front texture's value, the right half the back's
    expect(a.texture.data[(40 * 100 + 10) * 4]).toBe(10);
    expect(a.texture.data[(40 * 100 + 90) * 4]).toBe(200);
  });

  it('works with only a front, and with nothing', () => {
    const a = buildAtlas(tex(40, 80, 5))!;
    expect(a.back).toBeUndefined();
    expect(a.front!.u1).toBeLessThan(1);
    expect(buildAtlas()).toBeNull();
  });
});

describe('fabric patch', () => {
  it('is a tileable greyscale patch from inside the garment', () => {
    const img = load('T4');
    const look = extractLook(img)!;
    const p = fabricPatch(img, look)!;
    expect(p).not.toBeNull();
    expect(p.width).toBe(p.height);
    // mirrored 2x2: the left edge matches the right edge so it tiles without a seam
    for (let y = 0; y < p.height; y += 7) expect(p.data[(y * p.width) * 4]).toBe(p.data[(y * p.width + p.width - 1) * 4]);
    // greyscale
    expect(p.data[0]).toBe(p.data[1]);
    // not flat: it carries some texture
    const vals = new Set<number>();
    for (let i = 0; i < p.data.length; i += 4 * 97) vals.add(p.data[i]);
    expect(vals.size).toBeGreaterThan(5);
  });
});

describe('image urls', () => {
  it('asks Target for a smaller image and leaves other urls alone', () => {
    const t = 'https://assets.target.com.au/transform/abc/415_1?io=transform%3Afit%2Cwidth%3A1400%2Cheight%3A1600&quality=90';
    expect(sizedImageUrl(t, 480)).toContain('width%3A480%2Cheight%3A600');
    const k = 'https://assets.kmart.com.au/transform/x/74111084-1?q=1';
    expect(sizedImageUrl(k, 480)).toBe(k);
  });
});
