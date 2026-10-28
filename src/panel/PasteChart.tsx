import { useState } from 'react';
import { parseCsvChart, type CsvBasis } from '../fit/csv';
import type { SizeChart } from '../types';

const EXAMPLE = 'Size,Chest,Waist,Length\nS,96,84,68\nM,102,90,70\nL,108,96,72';

interface Props {
  initialText?: string;
  initialBasis?: CsvBasis;
  onUse: (chart: SizeChart, text: string, basis: CsvBasis) => void;
  onCancel?: () => void;
}

/** Manual fallback (FR-8): paste a size chart as CSV so the render still works. */
export function PasteChart({ initialText = '', initialBasis = 'garment', onUse, onCancel }: Props) {
  const [text, setText] = useState(initialText);
  const [basis, setBasis] = useState<CsvBasis>(initialBasis);
  const [error, setError] = useState('');

  const submit = () => {
    const r = parseCsvChart(text, basis);
    if ('error' in r) setError(r.error);
    else {
      setError('');
      onUse(r.chart, text, basis);
    }
  };

  return (
    <div className="paste">
      <label htmlFor="csv">Paste the size chart as CSV</label>
      <textarea
        id="csv"
        rows={6}
        value={text}
        placeholder={EXAMPLE}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={!!error}
      />
      <label className="field">
        <span>The chart lists</span>
        <select value={basis} onChange={(e) => setBasis(e.target.value as CsvBasis)}>
          <option value="garment">Garment measurements</option>
          <option value="body">Body measurements (fits a body of…)</option>
        </select>
      </label>
      {error && (
        <small className="error" role="alert">
          {error}
        </small>
      )}
      <div className="actions">
        <button type="button" className="primary" onClick={submit}>
          Use this chart
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
