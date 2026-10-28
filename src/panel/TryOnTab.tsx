import { useEffect, useMemo, useState } from 'react';
import { computeFit } from '../fit/engine';
import { findRow } from '../fit/sizes';
import { LABEL_WORDS, summarise } from '../fit/summary';
import { loadProfile, loadSize, saveSize } from '../profile/storage';
import type { BodyProfile, ChartSource, FitResult } from '../types';
import { FitFigure } from './FitFigure';
import { usePageState } from './usePageState';

const CONVENTION_TEXT = {
  body: 'The chart lists body measurements, so the garment is the body size plus style ease.',
  'garment-circumference': 'The chart lists garment measurements (circumference).',
  'garment-flat': 'The chart lists flat garment widths (doubled to circumference).',
} as const;

function SourceInfo({ source, fit }: { source: ChartSource; fit: FitResult }) {
  return (
    <div className="source">
      {source.method !== 'live' && (
        <p className="warn" role="note">
          {source.method === 'snapshot'
            ? `Could not read the live size guide, so this uses saved data from ${source.retrievedAt}.`
            : source.method === 'rule'
              ? 'This chart was chosen by rule rather than read from the product page. Check it is right.'
              : 'This is the size chart you pasted.'}
        </p>
      )}
      <p className="muted">
        Chart: <a href={source.url} target="_blank" rel="noreferrer">{source.chartName}</a> ({source.method})
      </p>
      <p className="muted">
        {CONVENTION_TEXT[fit.garment.convention]}
        {fit.garment.convention === 'body' && ` Style: ${fit.garment.styleEase}.`}
      </p>
    </div>
  );
}

export function TryOnTab({ goProfile }: { goProfile: () => void }) {
  const page = usePageState();
  const [profile, setProfile] = useState<BodyProfile | null | undefined>(undefined);
  const [size, setSize] = useState('');

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const product = page.kind === 'product' ? page : null;
  const labels = useMemo(
    () => (product?.facts.sizeLabels.length ? product.facts.sizeLabels : product?.garment?.chart.rows.map((r) => r.label)) ?? [],
    [product],
  );

  // Pick the starting size: last used for this product, else the one selected on the page.
  const productUrl = product?.url;
  useEffect(() => {
    if (!productUrl) return;
    let cancelled = false;
    loadSize(productUrl).then((saved) => {
      if (cancelled) return;
      const first = [saved, product?.pageSize, labels[0]].find((s) => s && labels.includes(s));
      setSize(first ?? '');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productUrl]);

  // Following the shopper's own click on the page.
  const pageSize = product?.pageSize;
  useEffect(() => {
    if (pageSize && labels.includes(pageSize)) setSize(pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  const garment = product?.garment;
  const fit = useMemo(
    () => (profile && garment && size ? computeFit(profile, garment, size) : null),
    [profile, garment, size],
  );

  if (page.kind === 'loading') return <p className="muted">Reading the product page…</p>;
  if (page.kind !== 'product') return <p className="empty">{page.message}</p>;

  return (
    <div className="tryon">
      <h2 className="product-title">{page.facts.title}</h2>

      {page.failure && <p className="warn">{page.failure.message}</p>}

      {garment && (
        <label className="field">
          <span>Size</span>
          <select
            value={size}
            onChange={(e) => {
              setSize(e.target.value);
              saveSize(page.url, e.target.value);
            }}
          >
            {labels.map((l) => (
              <option key={l} value={l} disabled={!findRow(garment.chart, l)}>
                {l}
                {findRow(garment.chart, l) ? '' : ' (not in chart)'}
              </option>
            ))}
          </select>
        </label>
      )}

      {garment && profile === null && (
        <p className="note">
          Add your measurements to see the fit.{' '}
          <button type="button" className="link" onClick={goProfile}>
            Go to Profile
          </button>
        </p>
      )}

      {garment && profile && !fit && size && <p className="warn">Size {size} is not in this size chart.</p>}

      {fit && (
        <>
          <FitFigure fit={fit} />
          <ul className="summary">
            {summarise(fit).map((l) => (
              <li key={l.region} className={`label-${l.label}`}>
                <span className="s-title">{l.title}</span>
                <span className="s-text">
                  {l.text}
                  {l.estimated && <em title="The chart does not list this, so it is estimated."> (estimated)</em>}
                </span>
                <span className={`chip chip-${l.label}`}>{l.region === 'length' || l.region === 'sleeve' ? '' : LABEL_WORDS[l.label]}</span>
              </li>
            ))}
          </ul>
          {page.source && <SourceInfo source={page.source} fit={fit} />}
        </>
      )}
    </div>
  );
}
