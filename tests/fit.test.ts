import { describe, expect, it } from 'vitest';
import { classify, computeFit, deriveBody, guessConvention } from '../src/fit/engine';
import { findRow, sizeTokens, sortSizeLabels } from '../src/fit/sizes';
import { sleeveStyleFromText, styleEaseFromText } from '../src/fit/style';
import type { BodyProfile, Garment, SizeChart, StyleEase } from '../src/types';

const man: BodyProfile = {
  gender: 'men',
  heightCm: 180,
  weightKg: 80,
  chestCm: 100,
  waistCm: 85,
  hipsCm: 100,
  shoulderCm: 46,
  inseamCm: 82,
};

const garment = (chart: SizeChart, extra: Partial<Garment> = {}): Garment => ({ title: 'Test top', chart, ...extra });

const circ = (chest: number, extra = {}): SizeChart => ({
  convention: 'garment-circumference',
  rows: [{ label: 'M', chestCm: chest, ...extra }],
});

describe('chart conventions', () => {
  it('garment-circumference is used as is', () => {
    const r = computeFit(man, garment(circ(108)), 'M')!;
    expect(r.garment.chestCm).toBe(108);
    expect(r.easeCm.chest).toBe(8);
  });

  it('garment-flat doubles the chest', () => {
    const chart: SizeChart = { convention: 'garment-flat', rows: [{ label: 'M', chestCm: 54 }] };
    const r = computeFit(man, garment(chart), 'M')!;
    expect(r.garment.chestCm).toBe(108);
    expect(r.garment.convention).toBe('garment-flat');
  });

  it('body charts add the style ease to the body size', () => {
    const chart: SizeChart = { convention: 'body', rows: [{ label: 'M', chestCm: 100 }] };
    const expected: Record<StyleEase, number> = { slim: 104, regular: 110, relaxed: 116, oversized: 124 };
    for (const [style, chest] of Object.entries(expected)) {
      const r = computeFit(man, garment(chart, { styleEase: style as StyleEase }), 'M')!;
      expect(r.garment.chestCm).toBe(chest);
    }
    // defaults to regular
    expect(computeFit(man, garment(chart), 'M')!.garment.styleEase).toBe('regular');
  });

  it('guesses flat when every chest is under 80 cm', () => {
    expect(guessConvention([{ label: 'S', chestCm: 50 }, { label: 'M', chestCm: 54 }])).toBe('garment-flat');
    expect(guessConvention([{ label: 'S', chestCm: 96 }])).toBe('garment-circumference');
  });
});

describe('chest ease bands', () => {
  // body chest 100, so garment chest = 100 + ease
  const cases: [number, string][] = [
    [-2, 'tight'],
    [0, 'fitted'],
    [5.9, 'fitted'],
    [6, 'true'],
    [13.9, 'true'],
    [14, 'loose'],
    [21.9, 'loose'],
    [22, 'oversized'],
    [30, 'oversized'],
  ];
  for (const [ease, label] of cases) {
    it(`ease ${ease} is ${label}`, () => {
      const r = computeFit(man, garment(circ(100 + ease)), 'M')!;
      expect(r.easeCm.chest).toBeCloseTo(ease);
      expect(r.label.chest).toBe(label);
    });
  }
});

describe('other regions', () => {
  it('classifies each region from its own thresholds', () => {
    expect(classify('shoulder', -1)).toBe('tight');
    expect(classify('shoulder', 3)).toBe('true');
    expect(classify('shoulder', 9)).toBe('oversized');
    expect(classify('length', 17)).toBe('true');
    expect(classify('length', 35)).toBe('oversized');
    expect(classify('sleeve', -6)).toBe('tight');
    expect(classify('sleeve', 0)).toBe('true');
    expect(classify('sleeve', 8)).toBe('oversized');
  });

  it('uses chart waist, shoulder, length and sleeve when given', () => {
    const r = computeFit(
      man,
      garment(circ(110, { waistCm: 100, shoulderCm: 50, lengthCm: 72, sleeveCm: 60 }), { sleeveStyle: 'long' }),
      'M',
    )!;
    expect(r.easeCm.waist).toBe(15);
    expect(r.easeCm.shoulder).toBe(4);
    expect(r.garment.estimated).toEqual({ waist: false, shoulder: false, length: false, sleeve: false });
    expect(r.easeCm.length).toBeCloseTo(72 - 54);
    expect(r.easeCm.sleeve).toBeCloseTo(60 - 59.4);
  });

  it('flags estimated values when the chart lacks them', () => {
    const r = computeFit(man, garment(circ(110)), 'M')!;
    expect(r.garment.estimated).toEqual({ waist: true, shoulder: true, length: true, sleeve: true });
  });
});

describe('hem and sleeve positions', () => {
  it('places the hem by garment length / torso length', () => {
    const at = (lengthCm: number) => computeFit(man, garment(circ(110, { lengthCm })), 'M')!.hemAt;
    // torso = 54
    expect(at(35)).toBe('waist');
    expect(at(54)).toBe('hip');
    expect(at(70)).toBe('upper-thigh');
    expect(at(90)).toBe('mid-thigh');
  });

  it('places the sleeve end by sleeve / arm length', () => {
    const at = (s: 'sleeveless' | 'short' | 'three-quarter' | 'long') =>
      computeFit(man, garment(circ(110), { sleeveStyle: s }), 'M')!.sleeveEndsAt;
    expect(at('sleeveless')).toBe('shoulder');
    expect(at('short')).toBe('upper-arm');
    expect(at('three-quarter')).toBe('forearm');
    expect(at('long')).toBe('wrist');
  });
});

describe('derived body dimensions (FR-4)', () => {
  it('fills missing shoulder and inseam from height and gender', () => {
    const { shoulderCm: _s, inseamCm: _i, ...rest } = man;
    const b = deriveBody(rest);
    expect(b.shoulderCm).toBeCloseTo(180 * 0.255);
    expect(b.inseamCm).toBeCloseTo(180 * 0.46);
    expect(b.torsoLengthCm).toBeCloseTo(54);
    expect(b.armLengthCm).toBeCloseTo(59.4);
  });
});

describe('size labels (FR-21)', () => {
  it('normalises labels to tokens', () => {
    expect(sizeTokens('XS/14').sort()).toEqual(['14', 'XS']);
    expect(sizeTokens('3XL')).toEqual(['3XL']);
    expect(sizeTokens('XXXL')).toEqual(['3XL']);
    expect(sizeTokens('XXL')).toEqual(['2XL']);
    expect(sizeTokens('16+')).toEqual(['16']);
    expect(sizeTokens('10')).toEqual(['10']);
    expect(sizeTokens('XXS')).toEqual(['2XS']);
  });

  it('matches by alias and numeric column', () => {
    const chart: SizeChart = {
      convention: 'body',
      rows: [
        { label: '10', aliases: ['S'], chestCm: 91 },
        { label: '12', aliases: ['M'], chestCm: 96 },
        { label: '20', aliases: ['XXXL'], chestCm: 117 },
      ],
    };
    expect(findRow(chart, 'S')!.label).toBe('10');
    expect(findRow(chart, 'M/12')!.label).toBe('12');
    expect(findRow(chart, '3XL')!.label).toBe('20');
    expect(findRow(chart, '10')!.label).toBe('10');
    expect(findRow(chart, 'XL')).toBeNull();
  });

  it('sorts an unordered size list', () => {
    expect(sortSizeLabels(['24', '12', '22', '26', '16', '18', '14', '10', '20'])).toEqual([
      '10', '12', '14', '16', '18', '20', '22', '24', '26',
    ]);
    expect(sortSizeLabels(['XL', 'S', '3XL', 'M', '2XL', 'XS', 'L'])).toEqual(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']);
  });

  it('returns null for a size not in the chart', () => {
    expect(computeFit(man, garment(circ(108)), 'XXL')).toBeNull();
  });
});

describe('fit keywords (FR-25)', () => {
  it('maps keywords to style ease', () => {
    expect(styleEaseFromText(['Slim fit'])).toBe('slim');
    expect(styleEaseFromText(['Fitted'])).toBe('slim');
    expect(styleEaseFromText(['Regular fit'])).toBe('regular');
    expect(styleEaseFromText(['Relaxed shape through body'])).toBe('relaxed');
    expect(styleEaseFromText(['Loose'])).toBe('relaxed');
    expect(styleEaseFromText(['Oversized fit'])).toBe('oversized');
    expect(styleEaseFromText(['Drop shoulder design'])).toBe('oversized');
    expect(styleEaseFromText(['Cotton tee'])).toBe('regular');
  });

  it('reads sleeve style from the title', () => {
    expect(sleeveStyleFromText(['Linen 3/4 Sleeve Blouse'])).toBe('three-quarter');
    expect(sleeveStyleFromText(['Long Sleeve Top'])).toBe('long');
    expect(sleeveStyleFromText(['Relaxed T-Shirt'])).toBe('short');
    expect(sleeveStyleFromText(['Mystery top'])).toBeUndefined();
  });
});
