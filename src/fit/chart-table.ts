import type { ChartConvention, SizeChart, SizeRow } from '../types';

const clean = (s: string | null | undefined) => (s ?? '').replace(/[ \s]+/g, ' ').trim();

/** Read an HTML table into header names (colspan/rowspan expanded) and body rows. */
export function readTable(table: Element): { headers: string[]; rows: string[][] } {
  const trs = [...table.querySelectorAll('tr')];
  const headRows = trs.filter((tr) => tr.closest('thead'));
  const bodyRows = trs.filter((tr) => !tr.closest('thead'));
  // Tables with no <thead>: treat a leading all-<th> row as the header.
  if (!headRows.length && bodyRows.length && [...bodyRows[0].children].every((c) => c.tagName === 'TH')) {
    headRows.push(bodyRows.shift()!);
  }

  const grid: string[][] = [];
  headRows.forEach((tr, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of tr.children) {
      while (grid[r][c] !== undefined) c++;
      const colspan = Number(cell.getAttribute('colspan') ?? 1) || 1;
      const rowspan = Number(cell.getAttribute('rowspan') ?? 1) || 1;
      for (let dr = 0; dr < rowspan; dr++) {
        grid[r + dr] ??= [];
        for (let dc = 0; dc < colspan; dc++) grid[r + dr][c + dc] = clean(cell.textContent);
      }
      c += colspan;
    }
  });
  const width = Math.max(0, ...grid.map((g) => g.length));
  const headers = Array.from({ length: width }, (_, c) => {
    const parts: string[] = [];
    for (const row of grid) if (row[c] && !parts.includes(row[c])) parts.push(row[c]);
    return parts.join(' ');
  });

  const rows = bodyRows
    .map((tr) => [...tr.children].map((c) => clean(c.textContent)))
    .filter((cells) => cells.length >= 2 && cells.some(Boolean));
  return { headers, rows };
}

/** '96.5', '103.5 cm', '77-81' (midpoint), '77 – 81'. */
export function parseNumber(text: string): number | undefined {
  const t = text.replace(/cm|in(ch(es)?)?|"/gi, '').trim();
  const range = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)$/.exec(t);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  return /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : undefined;
}

type Measure = 'chestCm' | 'waistCm' | 'hipsCm' | 'lengthCm' | 'shoulderCm' | 'sleeveCm';
const MEASURES: [Measure, RegExp][] = [
  ['chestCm', /chest|bust/i],
  ['waistCm', /waist/i],
  ['hipsCm', /\bhips?\b/i],
  ['lengthCm', /length/i],
  ['shoulderCm', /shoulder/i],
  ['sleeveCm', /sleeve/i],
];
const isInch = (h: string) => /\binch(es)?\b|\(in\)|\bin\b/i.test(h);

/**
 * Turn a parsed table into size rows. Label columns are those headed "Size".
 * Cells containing "/" (group labels such as "6/8") are ignored as aliases.
 */
export function tableToChart(
  headers: string[],
  rows: string[][],
  convention: ChartConvention,
): SizeChart | null {
  let labelCols = headers.flatMap((h, i) => (/^size\b/i.test(h) ? [i] : []));
  if (!labelCols.length) labelCols = [0];

  // Per measurement, prefer a cm column over an inch column.
  const cols: Partial<Record<Measure, { col: number; inch: boolean }>> = {};
  headers.forEach((h, col) => {
    if (labelCols.includes(col)) return;
    for (const [key, re] of MEASURES) {
      if (!re.test(h)) continue;
      const inch = isInch(h);
      const existing = cols[key];
      if (!existing || (existing.inch && !inch)) cols[key] = { col, inch };
    }
  });
  if (!cols.chestCm) return null;

  const out: SizeRow[] = [];
  for (const cells of rows) {
    const label = cells[labelCols[0]];
    if (!label) continue;
    const row: SizeRow = { label };
    const aliases = labelCols
      .slice(1)
      .map((c) => cells[c])
      .filter((v): v is string => !!v && !v.includes('/'));
    if (aliases.length) row.aliases = aliases;
    for (const [key, spec] of Object.entries(cols) as [Measure, { col: number; inch: boolean }][]) {
      const v = parseNumber(cells[spec.col] ?? '');
      if (v !== undefined) row[key] = spec.inch ? Math.round(v * 2.54 * 10) / 10 : v;
    }
    if (row.chestCm !== undefined) out.push(row);
  }
  return out.length ? { convention, rows: out } : null;
}
