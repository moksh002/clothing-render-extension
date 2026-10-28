import { describe, expect, it } from 'vitest';
import { computeFit } from '../src/fit/engine';
import { parseCsvChart } from '../src/fit/csv';
import type { BodyProfile } from '../src/types';

describe('manual CSV chart (FR-8)', () => {
  it('parses a garment chart', () => {
    const r = parseCsvChart('Size,Chest,Waist,Length\nS,96,84,68\nM,102,90,70', 'garment');
    expect(r).toEqual({
      chart: {
        convention: 'garment-circumference',
        rows: [
          { label: 'S', chestCm: 96, waistCm: 84, lengthCm: 68 },
          { label: 'M', chestCm: 102, waistCm: 90, lengthCm: 70 },
        ],
      },
    });
  });

  it('detects a flat (pit to pit) garment chart', () => {
    const r = parseCsvChart('Size,Chest\nS,48\nM,52', 'garment');
    expect('chart' in r && r.chart.convention).toBe('garment-flat');
  });

  it('treats a body chart as body and reads ranges, tabs and inches', () => {
    const r = parseCsvChart('Size\tBust (in)\nM\t36-38', 'body');
    expect('chart' in r && r.chart.convention).toBe('body');
    expect('chart' in r && r.chart.rows[0].chestCm).toBeCloseTo(94, 0); // 37in
  });

  it('accepts semicolons and quotes', () => {
    const r = parseCsvChart('"Size";"Chest"\n"M";"100"', 'garment');
    expect('chart' in r && r.chart.rows).toEqual([{ label: 'M', chestCm: 100 }]);
  });

  it('gives clear errors', () => {
    expect(parseCsvChart('', 'body')).toHaveProperty('error');
    expect(parseCsvChart('just text', 'body')).toHaveProperty('error');
    expect(parseCsvChart('Size,Waist\nM,80', 'body')).toMatchObject({ error: expect.stringContaining('Chest') });
    expect(parseCsvChart('Size,Chest\nM,abc', 'body')).toMatchObject({ error: expect.stringContaining('numeric') });
  });

  it('feeds the fit engine', () => {
    const r = parseCsvChart('Size,Chest\nM,108', 'garment');
    if (!('chart' in r)) throw new Error('parse');
    const man: BodyProfile = { gender: 'men', heightCm: 180, weightKg: 80, chestCm: 100, waistCm: 85, hipsCm: 100, shoulderCm: 46, inseamCm: 82 };
    expect(computeFit(man, { title: 't', chart: r.chart }, 'M')!.label.chest).toBe('true');
  });
});
