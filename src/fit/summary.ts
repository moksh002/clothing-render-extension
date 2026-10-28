import type { BodyLandmark, FitLabel, FitResult, Region } from '../types';

export interface SummaryLine {
  region: Region;
  title: string;
  text: string;
  label: FitLabel;
  estimated: boolean;
}

export const LABEL_WORDS: Record<FitLabel, string> = {
  tight: 'Tight',
  fitted: 'Fitted',
  true: 'True to size',
  loose: 'Loose',
  oversized: 'Oversized',
};

const HEM: Partial<Record<BodyLandmark, string>> = {
  waist: 'Ends at the waist',
  hip: 'Ends at the hip',
  'upper-thigh': 'Ends at the upper thigh',
  'mid-thigh': 'Ends at the mid thigh',
};

const SLEEVE: Partial<Record<BodyLandmark, string>> = {
  shoulder: 'Sleeveless',
  'upper-arm': 'Ends at the upper arm',
  elbow: 'Ends at the elbow',
  forearm: 'Ends at the forearm',
  wrist: 'Ends at the wrist',
  hand: 'Ends past the wrist',
};

const signed = (cm: number) => `${cm >= 0 ? '+' : '−'}${Math.abs(Math.round(cm * 10) / 10)} cm`;

/** Short per-region fit lines for the Try on tab. */
export function summarise(fit: FitResult): SummaryLine[] {
  const est = fit.garment.estimated;
  const chestName = fit.body.gender === 'women' ? 'Bust' : 'Chest';
  const measured = (region: 'chest' | 'waist' | 'shoulder') =>
    `${signed(fit.easeCm[region])} · ${LABEL_WORDS[fit.label[region]].toLowerCase()}`;

  const lines: SummaryLine[] = [
    { region: 'chest', title: chestName, text: measured('chest'), label: fit.label.chest, estimated: false },
    { region: 'waist', title: 'Waist', text: measured('waist'), label: fit.label.waist, estimated: est.waist },
    { region: 'shoulder', title: 'Shoulders', text: measured('shoulder'), label: fit.label.shoulder, estimated: est.shoulder },
    { region: 'length', title: 'Length', text: HEM[fit.hemAt] ?? fit.hemAt, label: fit.label.length, estimated: est.length },
    { region: 'sleeve', title: 'Sleeves', text: SLEEVE[fit.sleeveEndsAt] ?? fit.sleeveEndsAt, label: fit.label.sleeve, estimated: est.sleeve },
  ];
  // Charts that list only a chest give no waist to compare with (tops are cut straight), so say nothing.
  return lines.filter((l) => !(l.region === 'waist' && l.estimated));
}
