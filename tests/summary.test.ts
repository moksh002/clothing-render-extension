import { describe, expect, it } from 'vitest';
import { computeFit } from '../src/fit/engine';
import { summarise } from '../src/fit/summary';
import type { BodyProfile, Garment } from '../src/types';

const woman: BodyProfile = { gender: 'women', heightCm: 168, weightKg: 62, chestCm: 92, waistCm: 74, hipsCm: 99, shoulderCm: 39, inseamCm: 76 };
const garment = (row: object): Garment => ({ title: 't', chart: { convention: 'garment-circumference', rows: [{ label: 'M', chestCm: 104, ...row }] } });

describe('fit summary', () => {
  it('uses Bust for women and lists regions with signed ease', () => {
    const lines = summarise(computeFit(woman, garment({ waistCm: 90, shoulderCm: 42, lengthCm: 60, sleeveCm: 22 }), 'M')!);
    expect(lines.map((l) => l.title)).toEqual(['Bust', 'Waist', 'Shoulders', 'Length', 'Sleeves']);
    expect(lines[0].text).toBe('+12 cm · true to size');
    expect(lines.every((l) => !l.estimated)).toBe(true);
  });

  it('drops the waist line when the chart has no waist, and flags estimated values', () => {
    const lines = summarise(computeFit(woman, garment({}), 'M')!);
    expect(lines.map((l) => l.region)).toEqual(['chest', 'shoulder', 'length', 'sleeve']);
    expect(lines.filter((l) => l.estimated).map((l) => l.region)).toEqual(['shoulder', 'length', 'sleeve']);
  });

  it('describes where the hem and sleeve end', () => {
    const lines = summarise(computeFit(woman, garment({ lengthCm: 50, sleeveCm: 0 }), 'M')!);
    expect(lines.find((l) => l.region === 'length')!.text).toBe('Ends at the hip');
    expect(lines.find((l) => l.region === 'sleeve')!.text).toBe('Sleeveless');
  });
});
