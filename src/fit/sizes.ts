import type { SizeChart, SizeRow } from '../types';

const ALPHA = /^(\d*)(X*)(S|L|M)$/;

/** Canonical alpha size: XXL and 2XL both become '2XL'; XXS becomes '2XS'. */
function canonAlpha(s: string): string | null {
  if (s === 'XS' || s === 'XL' || s === 'S' || s === 'M' || s === 'L') return s;
  const m = ALPHA.exec(s);
  if (!m) return null;
  const [, digits, xs, base] = m;
  if (base === 'M') return null;
  const count = digits ? Number(digits) : xs.length;
  if (count < 2) return null;
  return `${count}X${base}`;
}

/**
 * Split a raw size label into canonical tokens (FR-21).
 * 'XS/14' -> ['XS','14'], 'XXXL' -> ['3XL'], '16+' -> ['16'], '10P' -> ['10P'].
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
