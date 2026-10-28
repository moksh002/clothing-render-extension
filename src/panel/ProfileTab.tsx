import { useEffect, useState } from 'react';
import type { BodyProfile, Gender } from '../types';
import {
  FIELDS,
  toDisplay,
  unitLabel,
  validateProfile,
  type MeasurementKey,
  type Unit,
} from '../profile/profile';
import { clearProfile, loadProfile, loadUnit, saveProfile, saveUnit } from '../profile/storage';

type Texts = Record<MeasurementKey, string>;
const EMPTY = Object.fromEntries(FIELDS.map((f) => [f.key, ''])) as Texts;

function profileToTexts(p: BodyProfile, unit: Unit): Texts {
  const t = {} as Texts;
  for (const f of FIELDS) t[f.key] = String(toDisplay(f, p[f.key], unit));
  return t;
}

export function ProfileTab() {
  const [gender, setGender] = useState<Gender>('women');
  const [unit, setUnit] = useState<Unit>('cm');
  const [texts, setTexts] = useState<Texts>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<MeasurementKey, string>>>({});
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, u] = await Promise.all([loadProfile(), loadUnit()]);
      setUnit(u);
      if (p) {
        setGender(p.gender);
        setTexts(profileToTexts(p, u));
      }
      setLoaded(true);
    })();
  }, []);

  const changeUnit = (next: Unit) => {
    if (next === unit) return;
    // Convert whatever valid numbers are typed; leave blanks and junk alone.
    const converted = { ...texts };
    for (const f of FIELDS) {
      const n = Number(texts[f.key]);
      if (texts[f.key].trim() !== '' && Number.isFinite(n) && f.kind === 'length') {
        const cm = unit === 'in' ? n * 2.54 : n;
        converted[f.key] = String(toDisplay(f, cm, next));
      }
    }
    setTexts(converted);
    setErrors({});
    setUnit(next);
    saveUnit(next);
  };

  const onSave = async () => {
    const r = validateProfile(texts, unit);
    if ('errors' in r) {
      setErrors(r.errors);
      setStatus('');
      return;
    }
    setErrors({});
    await saveProfile({ gender, ...r.profile });
    setStatus('Saved');
  };

  const onReset = async () => {
    await clearProfile();
    setTexts(EMPTY);
    setErrors({});
    setStatus('Profile cleared');
  };

  if (!loaded) return null;

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      noValidate
    >
      <div className="row">
        <div className="segmented" role="group" aria-label="Fit type">
          {(['women', 'men'] as Gender[]).map((g) => (
            <button
              type="button"
              key={g}
              aria-pressed={gender === g}
              onClick={() => {
                setGender(g);
                setStatus('');
              }}
            >
              {g === 'women' ? 'Women' : 'Men'}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Units">
          {(['cm', 'in'] as Unit[]).map((u) => (
            <button type="button" key={u} aria-pressed={unit === u} onClick={() => changeUnit(u)}>
              {u}
            </button>
          ))}
        </div>
      </div>

      {FIELDS.map((f) => (
        <label key={f.key} className="field">
          <span>{f.label}</span>
          <span className="input-wrap">
            <input
              inputMode="decimal"
              value={texts[f.key]}
              aria-invalid={!!errors[f.key]}
              aria-describedby={errors[f.key] ? `err-${f.key}` : undefined}
              onChange={(e) => {
                setTexts({ ...texts, [f.key]: e.target.value });
                setStatus('');
              }}
            />
            <em>{unitLabel(f, unit)}</em>
          </span>
          {errors[f.key] && (
            <small id={`err-${f.key}`} className="error" role="alert">
              {errors[f.key]}
            </small>
          )}
        </label>
      ))}

      <div className="actions">
        <button type="submit" className="primary">
          Save
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
        <span className="status" role="status">
          {status}
        </span>
      </div>
    </form>
  );
}
