import { useEffect, useMemo, useState } from 'react';
import { computeFit } from '../fit/engine';
import { loadProfile } from '../profile/storage';
import type { BodyProfile, Garment } from '../types';
import { FitFigure } from './FitFigure';

const SAMPLE_PROFILE: BodyProfile = {
  gender: 'women',
  heightCm: 168,
  weightKg: 62,
  chestCm: 92,
  waistCm: 74,
  hipsCm: 99,
  shoulderCm: 39,
  inseamCm: 76,
};

// Hard-coded garment for the renderer preview (replaced by scraped charts in a later milestone).
const SAMPLE_GARMENT: Garment = {
  title: 'Sample tee (preview)',
  chart: {
    convention: 'garment-circumference',
    rows: [
      { label: 'XS', chestCm: 88 },
      { label: 'S', chestCm: 94 },
      { label: 'M', chestCm: 102 },
      { label: 'L', chestCm: 112 },
      { label: 'XL', chestCm: 122 },
      { label: '2XL', chestCm: 132 },
    ],
  },
};

export function TryOnTab() {
  const [profile, setProfile] = useState<BodyProfile | null>(null);
  const [size, setSize] = useState('M');

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const fit = useMemo(
    () => computeFit(profile ?? SAMPLE_PROFILE, SAMPLE_GARMENT, size),
    [profile, size],
  );

  return (
    <div className="tryon">
      <p className="muted">{SAMPLE_GARMENT.title}</p>
      {!profile && <p className="note">Showing a sample body. Save your measurements in Profile.</p>}
      <label className="field">
        <span>Size</span>
        <select value={size} onChange={(e) => setSize(e.target.value)}>
          {SAMPLE_GARMENT.chart.rows.map((r) => (
            <option key={r.label}>{r.label}</option>
          ))}
        </select>
      </label>
      {fit && <FitFigure fit={fit} />}
    </div>
  );
}
