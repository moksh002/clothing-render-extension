import { describe, expect, it } from 'vitest';
import { computeFit } from '../src/fit/engine';
import { buildSvg } from '../src/render/svg-renderer';
import type { BodyProfile, Garment } from '../src/types';

const woman: BodyProfile = {
  gender: 'women', heightCm: 168, weightKg: 62, chestCm: 92, waistCm: 74, hipsCm: 99, shoulderCm: 39, inseamCm: 76,
};
const chart = {
  convention: 'garment-circumference' as const,
  rows: [
    { label: 'S', chestCm: 88 },
    { label: 'M', chestCm: 100 },
    { label: 'XL', chestCm: 124 },
  ],
};
const garment: Garment = { title: 't', chart };
const svg = (p: BodyProfile, size: string) => buildSvg(computeFit(p, garment, size)!);

describe('svg renderer', () => {
  it('draws body and garment', () => {
    const out = svg(woman, 'M');
    expect(out).toContain('id="body"');
    expect(out).toContain('id="garment"');
  });

  it('a tight size is tinted red, others are not', () => {
    expect(svg(woman, 'S')).toContain('#e5736f');
    expect(svg(woman, 'M')).not.toContain('#e5736f');
  });

  it('looser sizes change the garment drawing', () => {
    const garmentPath = (s: string) => /<path d="([^"]+)" fill="url\(#fitGrad\)"/.exec(s)![1];
    expect(garmentPath(svg(woman, 'M'))).not.toBe(garmentPath(svg(woman, 'XL')));
  });

  it('changing a measurement changes the body', () => {
    const bodyPath = (s: string) => /<path id="torso" d="([^"]+)"/.exec(s)![1];
    expect(bodyPath(svg(woman, 'M'))).not.toBe(bodyPath(svg({ ...woman, waistCm: 95 }, 'M')));
  });

  it('draws men and women differently', () => {
    expect(svg(woman, 'M')).not.toBe(svg({ ...woman, gender: 'men' }, 'M'));
  });
});
