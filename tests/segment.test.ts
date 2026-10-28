import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { buildTexture, extractLook, type Pixels } from '../src/look/segment';

const load = (name: string): Pixels => {
  const { data, width, height } = jpeg.decode(readFileSync(`tests/fixtures/images/${name}.jpg`), { useTArray: true });
  return { data, width, height };
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('garment look from product photos', () => {
  it('T1: blue tee, no print, box around the torso', () => {
    const look = extractLook(load('T1'))!;
    const [r, , b] = rgb(look.colour);
    expect(b).toBeGreaterThan(r + 40);
    expect(look.hasPrint).toBe(false);
    expect(look.box.x0).toBeGreaterThan(0.2);
    expect(look.box.x1).toBeLessThan(0.8);
    expect(look.box.y0).toBeLessThan(0.25);
    // the shorts below the tee are not part of the garment
    expect(look.box.y1).toBeLessThan(0.6);
  });

  it('T2: burgundy blouse with white dots counts as a print', () => {
    const look = extractLook(load('T2'))!;
    const [r, g, b] = rgb(look.colour);
    expect(r).toBeGreaterThan(g + 25);
    expect(r).toBeGreaterThan(b);
    expect(look.hasPrint).toBe(true);
    // the curly hair above the shoulders is not part of the garment
    expect(look.box.y0).toBeGreaterThan(0.18);
  });

  it('T4: dark brown shirt is not mistaken for skin', () => {
    const look = extractLook(load('T4'))!;
    const [r, g, b] = rgb(look.colour);
    expect(r + g + b).toBeLessThan(330);
    expect(r).toBeGreaterThanOrEqual(b);
    expect(look.box.x1 - look.box.x0).toBeGreaterThan(0.4);
  });

  it('T5: navy tee', () => {
    const look = extractLook(load('T5'))!;
    const [r, , b] = rgb(look.colour);
    expect(b).toBeGreaterThan(r);
    expect(r + b).toBeLessThan(250);
    expect(look.hasPrint).toBe(false);
    expect(look.box.y1).toBeLessThan(0.6); // white shorts excluded
  });

  it('returns null for a blank image', () => {
    const data = new Uint8ClampedArray(64 * 64 * 4).fill(240);
    expect(extractLook({ data, width: 64, height: 64 })).toBeNull();
  });
});

describe('texture crop', () => {
  it('crops to the garment box with a plain border', () => {
    const img = load('T2');
    const look = extractLook(img)!;
    const tex = buildTexture(img, look, 128);
    expect(Math.max(tex.width, tex.height)).toBeLessThanOrEqual(128 + 4);
    const [r, g, b] = rgb(look.colour);
    // corner texel is the plain garment colour
    expect([tex.data[0], tex.data[1], tex.data[2]]).toEqual([r, g, b]);
    // and the texture has white dots somewhere
    let light = 0;
    for (let i = 0; i < tex.data.length; i += 4) if (tex.data[i] > 200 && tex.data[i + 1] > 200) light++;
    expect(light).toBeGreaterThan(20);
  });
});
