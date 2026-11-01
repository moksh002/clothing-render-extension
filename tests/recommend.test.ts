import { describe, expect, it } from 'vitest';
import { compareWithModel, recommendSize, smallerFirst } from '../src/fit/recommend';
import type { BodyProfile, Garment, SizeChart, StyleEase } from '../src/types';

const man: BodyProfile = { gender: 'men', heightCm: 180, weightKg: 80, chestCm: 100, waistCm: 85, hipsCm: 100, shoulderCm: 46, inseamCm: 82 };

const body: SizeChart = {
  convention: 'body',
  rows: [
    { label: 'S', chestCm: 92 },
    { label: 'M', chestCm: 97 },
    { label: 'L', chestCm: 102 },
    { label: 'XL', chestCm: 107 },
  ],
};
const garment = (chart: SizeChart, styleEase?: StyleEase): Garment => ({ title: 'Test top', chart, ...(styleEase ? { styleEase } : {}) });
const labels = ['S', 'M', 'L', 'XL'];

describe('size recommendation', () => {
  it('picks the size cut closest to the body on a body chart', () => {
    // chest 100 sits between M (97) and L (102); L is closer
    const a = recommendSize(man, garment(body), labels)!;
    expect(a.best).toBe('L');
    expect(a.ranking.map((r) => r.size)[0]).toBe('L');
  });

  it('says when the next size is nearly as good', () => {
    const a = recommendSize({ ...man, chestCm: 99.5 }, garment(body), labels)!;
    expect(a.alsoConsider).toBeDefined();
    expect(new Set([a.best, a.alsoConsider])).toEqual(new Set(['M', 'L']));
  });

  it('does not offer an alternative when one size is clearly right', () => {
    const a = recommendSize({ ...man, chestCm: 92 }, garment(body), labels)!;
    expect(a.best).toBe('S');
    expect(a.alsoConsider).toBeUndefined();
  });

  it('wants a bigger size for a relaxed cut on a garment chart, a smaller one for slim', () => {
    const chart: SizeChart = {
      convention: 'garment-circumference',
      rows: [
        { label: 'S', chestCm: 104 },
        { label: 'M', chestCm: 110 },
        { label: 'L', chestCm: 116 },
        { label: 'XL', chestCm: 122 },
      ],
    };
    // body 100: relaxed wants about 116, slim wants about 104
    expect(recommendSize(man, garment(chart, 'relaxed'), labels)!.best).toBe('L');
    expect(recommendSize(man, garment(chart, 'slim'), labels)!.best).toBe('S');
  });

  it('punishes a tight size more than a loose one', () => {
    // body chest 98.5 would be 2.5 off either side of the chart, but under-sized costs double
    const chart: SizeChart = { convention: 'body', rows: [{ label: 'M', chestCm: 96 }, { label: 'L', chestCm: 101 }] };
    expect(recommendSize({ ...man, chestCm: 98.5 }, garment(chart), ['M', 'L'])!.best).toBe('L');
  });

  it('skips sizes that are not in the chart and returns null when none fit', () => {
    expect(recommendSize(man, garment(body), ['XXS', 'XL'])!.ranking.map((r) => r.size)).toEqual(['XL']);
    expect(recommendSize(man, garment(body), ['XXXL'])).toBeNull();
  });

  it('orders two sizes smaller first', () => {
    expect(smallerFirst('L', 'M')).toEqual(['M', 'L']);
  });
});

describe('comparison with the model', () => {
  it('uses the body size of the row the model wears', () => {
    const c = compareWithModel(man, garment(body), 'L')!;
    expect(c.chestCm).toBe(102);
    expect(c.youMinusModelCm).toBe(-2);
  });

  it('takes the cut ease off a garment chart to get the body it is made for', () => {
    const chart: SizeChart = { convention: 'garment-circumference', rows: [{ label: 'L', chestCm: 116 }] };
    // relaxed: 116 - 16 = 100
    expect(compareWithModel(man, garment(chart, 'relaxed'), 'L')!.chestCm).toBe(100);
  });

  it('halves nothing: flat charts are doubled first', () => {
    const chart: SizeChart = { convention: 'garment-flat', rows: [{ label: 'L', chestCm: 58 }] };
    expect(compareWithModel(man, garment(chart, 'regular'), 'L')!.chestCm).toBe(106);
  });

  it('is null without a model size or a matching row', () => {
    expect(compareWithModel(man, garment(body), undefined)).toBeNull();
    expect(compareWithModel(man, garment(body), '5XL')).toBeNull();
  });
});
