import { useEffect, useMemo, useState } from 'react';
import { computeFit } from '../fit/engine';
import { findRow } from '../fit/sizes';
import { parseCsvChart } from '../fit/csv';
import { LABEL_WORDS, summarise } from '../fit/summary';
import { buildGarment } from '../adapters/garment';
import {
  clearManualChart,
  loadManualChart,
  loadProfile,
  loadSize,
  saveManualChart,
  saveSize,
  type ManualChart,
} from '../profile/storage';
import type { BodyProfile, ChartSource, FitResult, Garment } from '../types';
import { FitFigure } from './FitFigure';
import { PasteChart } from './PasteChart';
import { usePageState } from './usePageState';
import { parseProductLink } from '../adapters/link';
import type { LinkMessage } from '../types/page';

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

const manualSource = (store: ChartSource['store'], url: string): ChartSource => ({
  store,
  chartName: 'Pasted chart',
  url,
  method: 'manual',
  retrievedAt: new Date().toISOString().slice(0, 10),
  step: 7,
});

export function TryOnTab({ goProfile }: { goProfile: () => void }) {
  const [link, setLink] = useState<string | undefined>();
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState('');
  const page = usePageState(link);
  const [profile, setProfile] = useState<BodyProfile | null | undefined>(undefined);
  const [size, setSize] = useState('');
  const [manual, setManual] = useState<ManualChart | null>(null);
  const [pasting, setPasting] = useState(false);
  const [usePhoto, setUsePhoto] = useState(true);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  const product = page.kind === 'product' ? page : null;

  // A chart pasted earlier for this product.
  const url = product?.url;
  useEffect(() => {
    setPasting(false);
    setManual(null);
    if (url) loadManualChart(url).then(setManual);
  }, [url]);

  const manualChart = useMemo(() => (manual ? parseCsvChart(manual.text, manual.basis) : null), [manual]);
  const manualGarment: Garment | null =
    product && manualChart && 'chart' in manualChart
      ? buildGarment(product.facts, {
          ...manualChart.chart,
          source: manualSource(product.facts.store, product.url),
        })
      : null;
  const garment = manualGarment ?? product?.garment;
  const source = manualGarment ? manualSource(product!.facts.store, product!.url) : product?.source;

  const labels = useMemo(
    () => (product?.facts.sizeLabels.length ? product.facts.sizeLabels : garment?.chart.rows.map((r) => r.label)) ?? [],
    [product, garment],
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

  const photoLook = product?.look;
  const look = useMemo(() => (usePhoto && photoLook ? photoLook : undefined), [usePhoto, photoLook]);

  const fit = useMemo(
    () => (profile && garment && size ? computeFit(profile, garment, size) : null),
    [profile, garment, size],
  );

  const submitLink = () => {
    const r = parseProductLink(linkText);
    if (!r.ok) {
      setLinkError(r.message);
      return;
    }
    setLinkError('');
    setLink(r.url);
    const msg: LinkMessage = { type: 'open-link', url: r.url };
    chrome.runtime.sendMessage(msg).catch(() => {});
  };

  const linkBox = (
    <form
      className="linkbox"
      onSubmit={(e) => {
        e.preventDefault();
        submitLink();
      }}
    >
      <input
        value={linkText}
        onChange={(e) => setLinkText(e.target.value)}
        placeholder="Paste a Target or Kmart product link"
        aria-label="Product link"
        aria-invalid={!!linkError}
      />
      <button type="submit" className="primary">
        Show
      </button>
      {linkError && (
        <small className="error" role="alert">
          {linkError}
        </small>
      )}
      {link && (
        <p className="muted small">
          Showing the pasted link.{' '}
          <button type="button" className="link" onClick={() => setLink(undefined)}>
            Use the current tab instead
          </button>
        </p>
      )}
    </form>
  );

  if (page.kind === 'loading') {
    return (
      <div className="tryon">
        {linkBox}
        <p className="muted">{link ? 'Loading the link in a background tab…' : 'Reading the product page…'}</p>
      </div>
    );
  }
  if (page.kind !== 'product') {
    return (
      <div className="tryon">
        {linkBox}
        <p className="empty">{page.message}</p>
      </div>
    );
  }

  return (
    <div className="tryon">
      {linkBox}
      <h2 className="product-title">{page.facts.title}</h2>

      {page.failure && !garment && <p className="warn">{page.failure.message}</p>}

      {(!garment || pasting) && (
        <PasteChart
          initialText={manual?.text}
          initialBasis={manual?.basis}
          onCancel={garment ? () => setPasting(false) : undefined}
          onUse={(_chart, text, basis) => {
            const m = { text, basis };
            setManual(m);
            setPasting(false);
            saveManualChart(page.url, m);
          }}
        />
      )}

      {garment && !pasting && (
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
          <FitFigure fit={fit} look={look} />
          {photoLook && (
            <label className="photo-look">
              <input type="checkbox" checked={usePhoto} onChange={(e) => setUsePhoto(e.target.checked)} />
              <span className="swatch" style={{ background: photoLook.colour }} aria-hidden="true" />
              Use {photoLook.textureDataUrl ? 'colour and print' : 'colour'} from the product photo
            </label>
          )}
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
          {source && <SourceInfo source={source} fit={fit} />}
        </>
      )}

      {garment && !pasting && (
        <p className="muted small">
          {manualGarment ? (
            <button
              type="button"
              className="link"
              onClick={() => {
                setManual(null);
                clearManualChart(page.url);
              }}
            >
              {product?.garment ? 'Use the store’s chart instead' : 'Remove pasted chart'}
            </button>
          ) : (
            <button type="button" className="link" onClick={() => setPasting(true)}>
              Chart looks wrong? Paste your own
            </button>
          )}
          {manualGarment && (
            <>
              {' · '}
              <button type="button" className="link" onClick={() => setPasting(true)}>
                Edit pasted chart
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
