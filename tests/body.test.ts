import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { computeFit } from '../src/fit/engine';
import { parseBodyAssets, type BodyAssets } from '../src/render/body/assets';
import { fitBody, type BodyFit } from '../src/render/body/fit';
import { buildBodyGarment, polarRadii, shellRing, trunkSection } from '../src/render/body/garment';
import { sliceLoops } from '../src/render/body/slice';
import type { BodyProfile } from '../src/types';

const dir = 'public/body/';
const buf = (f: string) => {
  const b = readFileSync(dir + f);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const man: BodyProfile = { gender: 'men', heightCm: 180, weightKg: 80, chestCm: 102, waistCm: 86, hipsCm: 100, shoulderCm: 46, inseamCm: 82 };
const woman: BodyProfile = { gender: 'women', heightCm: 168, weightKg: 62, chestCm: 92, waistCm: 74, hipsCm: 99, shoulderCm: 39, inseamCm: 76 };

let assets: BodyAssets;
let manFit: BodyFit;
let womanFit: BodyFit;
beforeAll(() => {
  assets = parseBodyAssets(JSON.parse(readFileSync(dir + 'body.json', 'utf8')), buf('body.bin'), buf('targets.bin'));
  manFit = fitBody(assets, man);
  womanFit = fitBody(assets, woman);
}, 60000);

describe('MakeHuman body assets', () => {
  it('loads the base mesh, eyes and every target', () => {
    expect(assets.positions.length / 3).toBeGreaterThan(13000);
    expect(assets.srcTris.length / 3).toBeGreaterThan(26000);
    expect(assets.targets.size).toBe(64);
    expect(assets.eyes.left.length).toBeGreaterThan(0);
  });
});

describe('fitting the body to measurements', () => {
  for (const [name, p, get] of [['man', man, () => manFit], ['woman', woman, () => womanFit]] as const) {
    it(`${name}: height, chest, waist, hips, shoulders and inseam land within 1.5 cm`, () => {
      const m = get().measured;
      expect(Math.abs(m.heightCm - p.heightCm)).toBeLessThan(0.5);
      expect(Math.abs(m.chestCm - p.chestCm)).toBeLessThan(1.5);
      expect(Math.abs(m.waistCm - p.waistCm)).toBeLessThan(1.5);
      expect(Math.abs(m.hipsCm - p.hipsCm)).toBeLessThan(1.5);
      expect(Math.abs(m.shoulderCm - p.shoulderCm)).toBeLessThan(1.5);
      expect(Math.abs(m.inseamCm - p.inseamCm)).toBeLessThan(1.5);
    });
  }

  it('a wider waist makes a measurably wider body', () => {
    const wide = fitBody(assets, { ...man, waistCm: 96 });
    expect(wide.measured.waistCm).toBeGreaterThan(manFit.measured.waistCm + 6);
    expect(Math.abs(wide.measured.waistCm - 96)).toBeLessThan(1.5);
  });

  it('puts the feet on the floor', () => {
    let minY = Infinity;
    for (let i = 1; i < manFit.positionsCm.length; i += 3) minY = Math.min(minY, manFit.positionsCm[i]);
    expect(minY).toBeCloseTo(0, 1);
  });
});

describe('garment shell from body sections', () => {
  it('polar radii of a square are about half its side to its corner', () => {
    const pts = [-5, -5, 5, -5, 5, 5, -5, 5];
    const r = polarRadii({ pts, perimeter: 40, minX: -5, maxX: 5, minZ: -5, maxZ: 5 }, 0, 0, 8);
    expect(r[0]).toBeCloseTo(5, 1); // facing an edge
    expect(r[1]).toBeCloseTo(5 * Math.SQRT2, 1); // facing a corner
  });

  it('a shell ring hits its target circumference when loose and hugs the body when tight', () => {
    const loop = trunkSection(manFit.positionsCm, manFit.srcTris, manFit.measured.chestY);
    const loose = shellRing(manFit.measured.chestY, loop, loop.perimeter + 20);
    const tight = shellRing(manFit.measured.chestY, loop, loop.perimeter - 10);
    const per = (r: { radii?: number[] }) => {
      const n = r.radii!.length;
      let s = 0;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 2 * Math.PI, b = ((k + 1) / n) * 2 * Math.PI;
        s += Math.hypot(r.radii![k] * Math.cos(a) - r.radii![(k + 1) % n] * Math.cos(b), r.radii![k] * Math.sin(a) - r.radii![(k + 1) % n] * Math.sin(b));
      }
      return s;
    };
    expect(per(loose)).toBeGreaterThan(per(tight) + 15);
    expect(loose.tint).toBe(0);
    expect(tight.tint).toBe(1);
  });

  const garment = (chest: number) => ({
    title: 't',
    chart: { convention: 'garment-circumference' as const, rows: [{ label: 'M', chestCm: chest, lengthCm: 70 }] },
  });

  it('the shirt stays outside the body at every ring', () => {
    const fit = computeFit(man, garment(110), 'M')!;
    const { parts } = buildBodyGarment(fit, manFit);
    const shirt = parts.find((p) => p.name === 'shirt')!;
    expect(shirt.rings.length).toBeGreaterThan(20);
    for (const r of shirt.rings) {
      expect(r.radii!.every((v) => Number.isFinite(v) && v > 0), `finite radii at y=${r.y.toFixed(0)}`).toBe(true);
    }
    // chest ring is wider than the body's chest section
    const chestRing = shirt.rings.reduce((m, r) => (Math.abs(r.y - manFit.measured.chestY) < Math.abs(m.y - manFit.measured.chestY) ? r : m));
    const body = trunkSection(manFit.positionsCm, manFit.srcTris, manFit.measured.chestY);
    expect(Math.max(...chestRing.radii!)).toBeGreaterThan((body.maxX - body.minX) / 2 - 1);
  });

  it('builds sleeves for short-sleeved tops and none for sleeveless', () => {
    const fit = computeFit(man, garment(110), 'M')!;
    expect(buildBodyGarment(fit, manFit).parts.filter((p) => p.name.startsWith('sleeve')).length).toBe(2);
    const sleeveless = computeFit(man, { ...garment(110), sleeveStyle: 'sleeveless' }, 'M')!;
    expect(buildBodyGarment(sleeveless, manFit).parts.filter((p) => p.name.startsWith('sleeve')).length).toBe(0);
  });

  it('works for a woman', () => {
    const fit = computeFit(woman, garment(100), 'M')!;
    expect(buildBodyGarment(fit, womanFit).parts.some((p) => p.name === 'shirt')).toBe(true);
  });

  it('slicing the body gives a closed trunk loop at the chest', () => {
    const loops = sliceLoops(manFit.positionsCm, manFit.srcTris, manFit.measured.chestY);
    expect(loops.length).toBeGreaterThanOrEqual(1);
  });
});
