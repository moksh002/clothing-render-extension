// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildGarment } from '../src/adapters/garment';
import { targetAdapter } from '../src/adapters/target';
import { computeFit } from '../src/fit/engine';
import { detailFromFacts } from '../src/fit/detail';
import { parseBodyAssets } from '../src/render/body/assets';
import { fitBody, type BodyFit } from '../src/render/body/fit';
import { buildBodyGarment } from '../src/render/body/garment';
import type { BodyProfile, ProductFacts } from '../src/types';

const facts = (file: string, url: string): ProductFacts => {
  const doc = new DOMParser().parseFromString(readFileSync(`tests/fixtures/${file}`, 'utf8'), 'text/html');
  return targetAdapter.extract(doc, new URL(url))!.facts;
};

describe('garment detail from product text', () => {
  it('reads the real Target pages', () => {
    expect(detailFromFacts(facts('T1-target-men.html', 'https://www.target.com.au/p/a/73125303'))).toEqual({ neckline: 'crew', buttons: 'none', cuffs: false, pocket: false });
    expect(detailFromFacts(facts('T5-target-women-slub-tee.html', 'https://www.target.com.au/p/a/73068228')).neckline).toBe('v');
    const shirt = detailFromFacts(facts('T4-target-men-linen-shirt.html', 'https://www.target.com.au/p/a/73225584'));
    expect(shirt).toMatchObject({ neckline: 'collar', buttons: 'full', cuffs: true });
  });

  it('polos and henleys get a short placket; t-shirts are not collared', () => {
    const f = (title: string, leaf: string): ProductFacts => ({ store: 'target', url: '', title, breadcrumb: ['Men', 'Tops', leaf], sizeLabels: [], fitText: [], features: [] });
    expect(detailFromFacts(f('Pique Polo Top', 'Polos'))).toMatchObject({ neckline: 'collar', buttons: 'placket' });
    expect(detailFromFacts(f('Henley Top', 'Tops'))).toMatchObject({ neckline: 'henley', buttons: 'placket' });
    expect(detailFromFacts(f('Plain Tee', 'T-Shirts')).neckline).toBe('crew');
    expect(detailFromFacts(f('Plain Tee', 'T Shirts')).neckline).toBe('crew');
    expect(detailFromFacts({ ...f('Top', 'Tops'), features: ['Chest pocket', 'Scoop neck'] })).toMatchObject({ neckline: 'scoop', pocket: true });
  });
});

describe('neckline, trim and decorations', () => {
  const dir = 'public/body/';
  const buf = (f: string) => { const b = readFileSync(dir + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
  const man: BodyProfile = { gender: 'men', heightCm: 180, weightKg: 80, chestCm: 102, waistCm: 86, hipsCm: 100, shoulderCm: 46, inseamCm: 82 };
  let bf: BodyFit;
  beforeAll(() => {
    bf = fitBody(parseBodyAssets(JSON.parse(readFileSync(dir + 'body.json', 'utf8')), buf('body.bin'), buf('targets.bin')), man);
  }, 60000);

  const build = (detail: Partial<ReturnType<typeof detailFromFacts>>, extra: object = {}, sleeve?: 'long') => {
    const f: ProductFacts = { store: 'target', url: '', title: 'Top', breadcrumb: ['Men', 'Tops', 'T-Shirts'], sizeLabels: [], fitText: [], features: [] };
    const g = buildGarment(f, { convention: 'garment-circumference', rows: [{ label: 'M', chestCm: 110, lengthCm: 72, ...extra }] });
    g.detail = { ...detailFromFacts(f), ...detail };
    if (sleeve) g.sleeveStyle = sleeve;
    return buildBodyGarment(computeFit(man, g, 'M')!, bf);
  };

  const edge = (b: ReturnType<typeof build>) => {
    const shirt = b.parts.find((p) => p.name === 'shirt')!;
    const N = shirt.rings[0].radii!.length;
    const top = shirt.rings[0].ys!;
    return { front: top[Math.round(N / 4)], back: top[Math.round((3 * N) / 4)], side: top[0] };
  };

  it('cuts the neckline lower at the front, most for a V-neck', () => {
    const crew = edge(build({ neckline: 'crew' }));
    const v = edge(build({ neckline: 'v' }));
    expect(crew.front).toBeLessThan(crew.back);
    expect(v.front).toBeLessThan(crew.front - 5);
    expect(v.back).toBeGreaterThan(v.front + 8);
  });

  it('a collar stands up above the neck line', () => {
    expect(edge(build({ neckline: 'collar' })).back).toBeGreaterThan(edge(build({ neckline: 'crew' })).back + 1);
  });

  it('marks a rib band along the neckline and a hem band', () => {
    const shirt = build({ neckline: 'crew' }).parts.find((p) => p.name === 'shirt')!;
    expect(shirt.rings[0].trim!.every((t) => t === 1)).toBe(true);
    expect(shirt.rings[shirt.rings.length - 1].trim!.some((t) => t > 0)).toBe(true);
    expect(shirt.rings[Math.floor(shirt.rings.length / 2)].trim!.every((t) => t === 0)).toBe(true);
  });

  it('places buttons down a shirt front, a short placket on a polo, none on a tee', () => {
    const full = build({ neckline: 'collar', buttons: 'full' }).decorations.buttons;
    const placket = build({ neckline: 'collar', buttons: 'placket' }).decorations.buttons;
    expect(full.length).toBeGreaterThanOrEqual(4);
    expect(placket.length).toBe(3);
    expect(build({ neckline: 'crew', buttons: 'none' }).decorations.buttons.length).toBe(0);
    // down the centre front, in front of the body
    for (const [x, , z] of full) {
      expect(Math.abs(x)).toBeLessThan(4);
      expect(z).toBeGreaterThan(0);
    }
    expect(full[0][1]).toBeGreaterThan(full[full.length - 1][1]);
  });

  it('adds a chest pocket when the product has one', () => {
    expect(build({ pocket: true }).decorations.pockets.length).toBe(1);
    expect(build({ pocket: false }).decorations.pockets.length).toBe(0);
  });

  it('a cuffed long sleeve is banded at the wrist', () => {
    const sleeve = build({ cuffs: true }, {}, 'long').parts.find((p) => p.name === 'sleeve-r')!;
    const last = sleeve.rings[sleeve.rings.length - 1];
    const mid = sleeve.rings[Math.floor(sleeve.rings.length / 2)];
    expect(last.trim!.every((t) => t === 1)).toBe(true);
    expect(mid.trim!.every((t) => t === 0)).toBe(true);
    const plain = build({ cuffs: false }, {}, 'long').parts.find((p) => p.name === 'sleeve-r')!;
    expect(plain.rings[plain.rings.length - 1].trim!.every((t) => t < 1)).toBe(true);
  });
});
