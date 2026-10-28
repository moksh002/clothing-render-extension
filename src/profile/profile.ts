import type { BodyProfile } from '../types';

export type MeasurementKey = Exclude<keyof BodyProfile, 'gender'>;
export type Unit = 'cm' | 'in';

export interface FieldSpec {
  key: MeasurementKey;
  label: string;
  /** Weight is always kg; everything else is a length. */
  kind: 'length' | 'weight';
  min: number;
  max: number;
}

export const FIELDS: FieldSpec[] = [
  { key: 'heightCm', label: 'Height', kind: 'length', min: 140, max: 210 },
  { key: 'weightKg', label: 'Weight', kind: 'weight', min: 35, max: 200 },
  { key: 'chestCm', label: 'Chest / bust', kind: 'length', min: 70, max: 150 },
  { key: 'waistCm', label: 'Waist', kind: 'length', min: 50, max: 140 },
  { key: 'hipsCm', label: 'Hips', kind: 'length', min: 70, max: 150 },
  { key: 'shoulderCm', label: 'Shoulder width', kind: 'length', min: 30, max: 65 },
  { key: 'inseamCm', label: 'Inseam', kind: 'length', min: 55, max: 95 },
];

const CM_PER_IN = 2.54;

export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inch: number) => inch * CM_PER_IN;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Value as shown in the UI for the chosen unit. Weight is never converted. */
export function toDisplay(spec: FieldSpec, internal: number, unit: Unit): number {
  return spec.kind === 'length' && unit === 'in' ? round1(cmToIn(internal)) : round1(internal);
}

/** Convert a typed value back to internal cm / kg. */
export function fromDisplay(spec: FieldSpec, shown: number, unit: Unit): number {
  return spec.kind === 'length' && unit === 'in' ? round1(inToCm(shown)) : shown;
}

export function unitLabel(spec: FieldSpec, unit: Unit): string {
  return spec.kind === 'weight' ? 'kg' : unit;
}

/** Validate a typed string; returns the internal value or an error message. */
export function parseField(
  spec: FieldSpec,
  text: string,
  unit: Unit,
): { value: number } | { error: string } {
  if (text.trim() === '') return { error: 'Required' };
  const shown = Number(text);
  if (!Number.isFinite(shown)) return { error: 'Enter a number' };
  const value = fromDisplay(spec, shown, unit);
  // Allow 0.1 slack for rounding when converting inches.
  if (value < spec.min - 0.1 || value > spec.max + 0.1) {
    const lo = toDisplay(spec, spec.min, unit);
    const hi = toDisplay(spec, spec.max, unit);
    return { error: `Between ${lo} and ${hi} ${unitLabel(spec, unit)}` };
  }
  return { value };
}

export function validateProfile(
  texts: Record<MeasurementKey, string>,
  unit: Unit,
): { profile: Record<MeasurementKey, number> } | { errors: Partial<Record<MeasurementKey, string>> } {
  const errors: Partial<Record<MeasurementKey, string>> = {};
  const profile = {} as Record<MeasurementKey, number>;
  for (const spec of FIELDS) {
    const r = parseField(spec, texts[spec.key] ?? '', unit);
    if ('error' in r) errors[spec.key] = r.error;
    else profile[spec.key] = r.value;
  }
  return Object.keys(errors).length ? { errors } : { profile };
}
