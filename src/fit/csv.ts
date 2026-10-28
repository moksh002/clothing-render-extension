import type { SizeChart } from '../types';
import { guessConvention } from './engine';
import { tableToChart } from './chart-table';

export type CsvBasis = 'body' | 'garment';

export type CsvResult = { chart: SizeChart } | { error: string };

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === delim && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/**
 * Parse a pasted size chart (FR-8). The first row is a header naming the columns, for example
 * `Size,Chest,Waist,Length` or `Size,Bust (cm),Waist (cm)`. Tab, semicolon or comma separated.
 * Values can be ranges ('96-101') and the header can say (in) for inches.
 */
export function parseCsvChart(text: string, basis: CsvBasis): CsvResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { error: 'Paste a header row and at least one size row.' };

  const delim = ['\t', ';', ','].find((d) => lines[0].includes(d));
  if (!delim) return { error: 'Separate the columns with commas, semicolons or tabs.' };

  const headers = splitLine(lines[0], delim);
  const rows = lines.slice(1).map((l) => splitLine(l, delim));
  if (!headers.some((h) => /chest|bust/i.test(h))) {
    return { error: 'The header row needs a Chest (or Bust) column, for example: Size,Chest,Waist.' };
  }

  const chart = tableToChart(headers, rows, basis === 'body' ? 'body' : 'garment-circumference');
  if (!chart) return { error: 'No size rows with a numeric chest value were found.' };
  if (basis === 'garment') chart.convention = guessConvention(chart.rows);
  return { chart };
}
