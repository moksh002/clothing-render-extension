export type Gender = 'men' | 'women';

export interface BodyProfile {
  gender: Gender;
  heightCm: number;
  weightKg: number;
  /** Chest for men, bust for women. */
  chestCm: number;
  waistCm: number;
  hipsCm: number;
  shoulderCm: number;
  inseamCm: number;
}
