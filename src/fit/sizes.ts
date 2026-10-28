import type { SizeChart, SizeRow } from '../types';

/**
 * Canonical alpha size. XXL and 2XL are the same size ('2XL'), and so are XXS and 2XS.
 * Three or more X's stay literal: Target's men's chart lists XXXL (chest 120) and 3XL (chest 122)
 * as different rows, so they must not be merged.
 */
function canonAlpha(s: string): string | null {
  if (['XS', 'S', 'M', 'L', 'XL'].includes(s)) return s;
  if (s === 'XXS') return '2XS';
  if (s === 'XXL') return '2XL';
  if (/^\d+X[SL]$/.test(s) || /^X{3,}[SL]$/.test(s)) return s;
  return null;
}

/**
 * Split a raw size label into canonical tokens (FR-21).
 * 'XS/14' -> ['XS','14'], 'XXL' -> ['2XL'], 'XXXL' stays, '16+' -> ['16'], '10P' -> ['10P'].
 */
export function sizeTokens(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.toUpperCase().split(/[\/,\s]+/)) {
    const p = part.trim().replace(/\+$/, '');
    if (!p) continue;
    if (/^\d+$/.test(p)) out.add(String(Number(p)));
    else if (/^\d+P$/.test(p)) out.add(p);
    else {
      const a = canonAlpha(p);
      if (a) out.add(a);
    }
  }
  return [...out];
}

/** Sort an unordered size list (alpha ascending, then numerics ascending). */
export function sortSizeLabels(labels: string[]): string[] {
  const ALPHA_ORDER = ['2XS', '3XS', 'XS', 'S', 'M', 'L', 'XL'];
  const key = (l: string): [number, number] => {
    const t = sizeTokens(l);
    const num = t.find((x) => /^\d+$/.test(x));
    if (num) return [1, Number(num)];
    const alpha = t[0];
    if (!alpha) return [2, 0];
    const xl = /^(\d+)XL$/.exec(alpha);
    if (xl) return [0, 10 + Number(xl[1])];
    const many = /^(X{3,})L$/.exec(alpha);
    if (many) return [0, 10 + many[1].length];
    const xs = /^(\d+)XS$/.exec(alpha);
    if (xs) return [0, -Number(xs[1])];
    const i = ALPHA_ORDER.indexOf(alpha);
    return [0, i >= 3 ? i - 2 : i - 3];
  };
  return [...labels].sort((a, b) => {
    const [ka, va] = key(a);
    const [kb, vb] = key(b);
    return ka - kb || va - vb;
  });
}

/** Find the chart row for a selected size, or null. */
export function findRow(chart: SizeChart, selected: string): SizeRow | null {
  const want = sizeTokens(selected);
  if (!want.length) return null;
  const exact = chart.rows.find((r) => r.label.trim().toUpperCase() === selected.trim().toUpperCase());
  if (exact) return exact;
  // A row whose label or aliases share any token. Prefer the row sharing the most tokens.
  let best: SizeRow | null = null;
  let bestScore = 0;
  for (const row of chart.rows) {
    const have = new Set([row.label, ...(row.aliases ?? [])].flatMap(sizeTokens));
    const score = want.filter((t) => have.has(t)).length;
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}
