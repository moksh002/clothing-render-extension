import { describe, expect, it } from 'vitest';
import { computeFit } from '../src/fit/engine';
import { buildFigure, ellipsePerimeter, halfAxes, sampleRings } from '../src/render/three/figure';
import type { BodyProfile, Garment, SleeveStyle } from '../src/types';

const man: BodyProfile = { gender: 'men', heightCm: 180, weightKg: 80, chestCm: 100, waistCm: 85, hipsCm: 100, shoulderCm: 46, inseamCm: 82 };
const woman: BodyProfile = { gender: 'women', heightCm: 168, weightKg: 62, chestCm: 92, waistCm: 74, hipsCm: 99, shoulderCm: 39, inseamCm: 76 };

const garment = (chest: number, extra: Partial<Garment> = {}, row = {}): Garment => ({
  title: 't',
  chart: { convention: 'garment-circumference', rows: [{ label: 'M', chestCm: chest, ...row }] },
  ...extra,
});
const fig = (p: BodyProfile, g: Garment) => buildFigure(computeFit(p, g, 'M')!);
const part = (f: ReturnType<typeof fig>, name: string) => f.parts.find((p) => p.name === name)!;
const perim = (r: { a: number; b: number }) => ellipsePerimeter(r.a, r.b);

describe('ellipse helpers', () => {
  it('halfAxes inverts the perimeter', () => {
    for (const ratio of [0.5, 0.72, 1]) {
      const { a, b } = halfAxes(100, ratio);
      expect(ellipsePerimeter(a, b)).toBeCloseTo(100, 1);
      expect(b / a).toBeCloseTo(ratio, 5);
    }
  });
});

describe('body figure', () => {
  it('reproduces the measured circumferences', () => {
    const torso = part(fig(man, garment(110)), 'torso');
    const at = (frac: number) => perim(sampleRings(torso.rings, frac * 180));
    expect(at(0.72)).toBeCloseTo(100, 0); // chest
    expect(at(0.62)).toBeCloseTo(85, 0); // waist
    expect(at(0.52)).toBeCloseTo(100, 0); // hips
  });

  it('is as tall as the person and has head, legs, arms', () => {
    const f = fig(man, garment(110));
    const head = f.blobs.find((b) => b.name === 'head')!;
    expect(head.center.y + head.radii.y).toBeCloseTo(180, 5);
    expect(f.parts.filter((p) => p.kind === 'body').map((p) => p.name).sort()).toEqual(
      ['arm-l', 'arm-r', 'leg-l', 'leg-r', 'neck', 'torso'],
    );
  });

  it('a wider waist changes the body; men and women differ', () => {
    const w = (p: BodyProfile) => sampleRings(part(fig(p, garment(110)), 'torso').rings, 0.62 * p.heightCm).a;
    expect(w({ ...man, waistCm: 100 })).toBeGreaterThan(w(man));
    const f1 = fig(man, garment(110));
    const f2 = fig({ ...man, gender: 'women' }, garment(110));
    expect(JSON.stringify(f1.parts[0].rings)).not.toBe(JSON.stringify(f2.parts[0].rings));
  });
});

describe('garment figure', () => {
  const shirtAt = (f: ReturnType<typeof fig>, y: number) => sampleRings(part(f, 'shirt').rings, y);

  it('looser sizes are wider and tight sizes are flush and red', () => {
    const loose = fig(man, garment(125));
    const fitted = fig(man, garment(106));
    const tight = fig(man, garment(92));
    const y = 0.72 * 180;
    expect(shirtAt(loose, y).a).toBeGreaterThan(shirtAt(fitted, y).a);
    expect(shirtAt(loose, y).tint).toBe(0);
    expect(shirtAt(tight, y).tint).toBeGreaterThan(0.9);
    // never inside the body
    const body = sampleRings(part(tight, 'torso').rings, y);
    expect(shirtAt(tight, y).a).toBeGreaterThanOrEqual(body.a);
  });

  it('garment circumference matches the chart when loose', () => {
    const f = fig(man, garment(120));
    expect(perim(shirtAt(f, 0.72 * 180))).toBeCloseTo(120, 0);
  });

  it('hem follows garment length', () => {
    const short = fig(man, garment(110, {}, { lengthCm: 55 }));
    const long = fig(man, garment(110, {}, { lengthCm: 80 }));
    const lowest = (f: ReturnType<typeof fig>) => Math.min(...part(f, 'shirt').rings.map((r) => r.y));
    expect(lowest(short)).toBeGreaterThan(lowest(long));
    expect(lowest(long)).toBeCloseTo(0.818 * 180 - 80, 0);
  });

  it('sleeve parts follow the sleeve style', () => {
    const len = (s: SleeveStyle, p = man) => {
      const f = fig(p, garment(110, { sleeveStyle: s }));
      const sl = f.parts.find((x) => x.name === 'sleeve-r');
      return sl ? Math.abs(sl.rings[sl.rings.length - 1].y) : 0;
    };
    expect(len('sleeveless')).toBe(0);
    expect(len('short')).toBeGreaterThan(0);
    expect(len('long')).toBeGreaterThan(len('three-quarter'));
    expect(len('three-quarter')).toBeGreaterThan(len('short'));
  });

  it('works for women', () => {
    const f = fig(woman, garment(100));
    expect(f.parts.some((p) => p.name === 'shirt')).toBe(true);
  });
});

describe('arm geometry', () => {
  it('hangs down from the shoulder (no ring above the joint by more than the 1 cm overlap)', () => {
    const f = fig(man, garment(110));
    for (const name of ['arm-r', 'arm-l']) {
      const arm = part(f, name);
      expect(Math.max(...arm.rings.map((r) => r.y))).toBeLessThanOrEqual(1.01);
      expect(Math.min(...arm.rings.map((r) => r.y))).toBeCloseTo(-0.33 * 180, 0);
    }
  });
});

describe('garment never sinks into the body', () => {
  it('stays outside the torso at every height for a narrow top on wide hips', () => {
    const f = fig(woman, garment(88, {}, { lengthCm: 70 })); // hips 99 > garment chest 88
    const shirt = part(f, 'shirt');
    const torso = part(f, 'torso');
    for (const r of shirt.rings) {
      // Skip the neckline (it opens around the neck) and anything above the shoulder line.
      if (r.y > 0.808 * 168 || r.y < torso.rings[torso.rings.length - 1].y) continue;
      const b = sampleRings(torso.rings, r.y);
      expect(r.a, `a at y=${r.y.toFixed(0)}`).toBeGreaterThanOrEqual(b.a - 0.3);
    }
  });
});
