import { describe, expect, it } from 'vitest';
import { FIELDS, TEST_PROFILE, TEST_PROFILES, fromDisplay, parseField, toDisplay, validateProfile } from '../src/profile/profile';

const height = FIELDS.find((f) => f.key === 'heightCm')!;
const weight = FIELDS.find((f) => f.key === 'weightKg')!;

describe('profile validation', () => {
  it('accepts values in range and rejects outside it', () => {
    expect(parseField(height, '175', 'cm')).toEqual({ value: 175 });
    expect(parseField(height, '139', 'cm')).toHaveProperty('error');
    expect(parseField(height, '211', 'cm')).toHaveProperty('error');
    expect(parseField(height, '', 'cm')).toEqual({ error: 'Required' });
    expect(parseField(height, 'abc', 'cm')).toEqual({ error: 'Enter a number' });
  });

  it('converts inches to cm and back', () => {
    expect(fromDisplay(height, 70, 'in')).toBe(177.8);
    expect(toDisplay(height, 177.8, 'in')).toBe(70);
    expect(parseField(height, '70', 'in')).toEqual({ value: 177.8 });
  });

  it('never converts weight', () => {
    expect(fromDisplay(weight, 70, 'in')).toBe(70);
  });

  it('reports every invalid field and blocks the profile', () => {
    const texts = Object.fromEntries(FIELDS.map((f) => [f.key, '1'])) as never;
    const r = validateProfile(texts, 'cm');
    expect('errors' in r && Object.keys(r.errors).length).toBe(FIELDS.length);
  });
});

describe('test profile', () => {
  it('has a valid made-up profile for both genders', () => {
    for (const g of ['men', 'women'] as const) {
      const p = TEST_PROFILES[g];
      expect(p.gender).toBe(g);
      expect(p.heightCm).toBe(170);
      const texts = Object.fromEntries(FIELDS.map((f) => [f.key, String(p[f.key])])) as never;
      expect('profile' in validateProfile(texts, 'cm')).toBe(true);
    }
  });

  it('passes validation in both units', () => {
    for (const unit of ['cm', 'in'] as const) {
      const texts = Object.fromEntries(FIELDS.map((f) => [f.key, String(toDisplay(f, TEST_PROFILE[f.key], unit))])) as never;
      expect('profile' in validateProfile(texts, unit)).toBe(true);
    }
  });

  it('is 170 cm with a waist close to the chest (a slightly bigger belly)', () => {
    expect(TEST_PROFILE.heightCm).toBe(170);
    expect(TEST_PROFILE.waistCm).toBeGreaterThan(TEST_PROFILE.chestCm - 10);
  });
});
