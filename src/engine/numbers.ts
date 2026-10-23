import type { FactNumber, NumberUnit } from './types';

/**
 * Number formatting and extraction.
 *
 * Processors format numbers with `formatValue`; the Reviewer pulls numbers back out of the
 * written text with `extractNumbers` and checks them against the evidence. Both sides use
 * this module so their rounding agrees.
 */

const GB = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const GB2 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GB1 = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const GBN = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

const MINUS = '−';

export function formatValue(value: number, unit: NumberUnit, opts: { signed?: boolean; symbol?: string } = {}): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : opts.signed && value > 0 ? '+' : '';
  switch (unit) {
    case 'currency': {
      const symbol = opts.symbol ?? '£';
      return `${sign}${symbol}${abs < 1000 && !Number.isInteger(abs) ? GB2.format(abs) : GB.format(Math.round(abs))}`;
    }
    case 'percent':
      return `${sign}${GB1.format(abs)}%`;
    case 'count':
      return `${sign}${GB.format(Math.round(abs))}`;
    default:
      return `${sign}${GBN.format(abs)}`;
  }
}

export function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

export type Comparator = 'gt' | 'gte' | 'lt' | 'lte';

export interface ExtractedNumber {
  raw: string;
  value: number;
  unit: NumberUnit | 'plain';
  /** Smallest step the text expresses, e.g. 0.1 for "18.4%" or 1000 for "£486k". */
  precision: number;
  approx: boolean;
  comparator?: Comparator;
  index: number;
}

const NUMBER_RE =
  /(?<![A-Za-z0-9_.,:/−-])([−-])?([£$€])?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?(k|m|bn)(?![A-Za-z]))?(\s?%|\s?per\s?cent)?/gi;

const APPROX_RE = /(about|around|roughly|approximately|nearly|almost|circa|~)\s*$/i;
const GT_RE = /(above|over|more than|greater than|exceeded|exceeding|exceeds|beyond)\s*$/i;
const GTE_RE = /(at least|no less than|or more)\s*$/i;
const LT_RE = /(below|under|less than|fewer than|short of)\s*$/i;
const LTE_RE = /(at most|no more than|up to)\s*$/i;

/** Pull numbers out of prose. Years, dates, times and letter-prefixed codes (Q3, H1) are skipped. */
export function extractNumbers(text: string): ExtractedNumber[] {
  const out: ExtractedNumber[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const [raw, sign, currency, intPart, decPart, suffix, percent] = m;
    const index = m.index ?? 0;
    const after = text.slice(index + raw.length, index + raw.length + 10);
    if (/^[-/:]\d/.test(after)) continue; // part of a date or time
    let value = Number(intPart.replace(/,/g, '') + (decPart ? `.${decPart}` : ''));
    if (!Number.isFinite(value)) continue;
    const isYear =
      !currency && !percent && !suffix && !decPart && !intPart.includes(',') && value >= 1900 && value <= 2100;
    if (isYear) continue;

    let precision = decPart ? 10 ** -decPart.length : 1;
    const mult = suffix ? { k: 1e3, m: 1e6, bn: 1e9 }[suffix.toLowerCase()] ?? 1 : 1;
    value *= mult;
    precision *= mult;

    let unit: ExtractedNumber['unit'] = 'plain';
    if (percent) unit = 'percent';
    else if (currency) unit = 'currency';
    else if (/^\s?(kb|mb|gb)\b/i.test(after)) unit = 'size';
    else if (/^\s?(ms|s|sec|secs|seconds|minutes|mins|months?|days?|weeks?)\b/i.test(after)) unit = 'duration';

    if (sign) value = -value;
    const before = text.slice(Math.max(0, index - 24), index);
    let comparator: Comparator | undefined;
    if (GTE_RE.test(before)) comparator = 'gte';
    else if (GT_RE.test(before)) comparator = 'gt';
    else if (LTE_RE.test(before)) comparator = 'lte';
    else if (LT_RE.test(before)) comparator = 'lt';
    if (!comparator && /^\s?(or more|plus)\b/i.test(after.replace(/^\s?%/, ''))) comparator = 'gte';

    out.push({ raw: raw.trim(), value, unit, precision, approx: APPROX_RE.test(before), comparator, index });
  }
  return out;
}

function unitsCompatible(text: ExtractedNumber['unit'], fact: NumberUnit): boolean {
  if (text === 'percent' || fact === 'percent') return text === fact;
  if (text === 'size' || fact === 'size') return text === fact || text === 'plain';
  if (text === 'duration' || fact === 'duration') return text === fact || text === 'plain';
  return true; // currency, count, number and plain figures are interchangeable
}

/** Does a number written in text equal a fact's number, allowing for the rounding the text shows? */
export function numberMatches(n: ExtractedNumber, f: FactNumber): boolean {
  if (!unitsCompatible(n.unit, f.unit)) return false;
  const a = Math.abs(n.value);
  const b = Math.abs(f.value);
  let tolerance = n.precision / 2 + 1e-9;
  if (n.approx) tolerance = Math.max(tolerance, b * 0.03);
  return Math.abs(a - b) <= tolerance;
}

/** For claims such as "above £480,000": is the fact's number on the stated side? */
export function comparisonHolds(n: ExtractedNumber, f: FactNumber): boolean {
  if (!n.comparator || !unitsCompatible(n.unit, f.unit)) return false;
  switch (n.comparator) {
    case 'gt': return f.value > n.value;
    case 'gte': return f.value >= n.value;
    case 'lt': return f.value < n.value;
    case 'lte': return f.value <= n.value;
  }
}

/** Parse a single cell or value such as "£1,200", "12%", "4.8 MB" or "n/a". */
export function parseLooseNumber(raw: string): { value: number; unit?: NumberUnit; symbol?: string } | null {
  const t = raw.trim();
  const m = /^([−-])?([£$€])?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(%|kb|mb|gb|ms|s)?$/i.exec(t);
  if (!m) return null;
  const [, sign, symbol, intPart, decPart, suffix] = m;
  let value = Number(intPart.replace(/,/g, '') + (decPart ? `.${decPart}` : ''));
  if (sign) value = -value;
  let unit: NumberUnit | undefined;
  if (symbol) unit = 'currency';
  else if (suffix === '%') unit = 'percent';
  else if (suffix && /b$/i.test(suffix)) unit = 'size';
  else if (suffix) unit = 'duration';
  return { value, unit, symbol };
}

const SIZE_FACTOR: Record<string, number> = { kb: 1 / 1024, mb: 1, gb: 1024 };
const TIME_FACTOR: Record<string, number> = { ms: 0.001, s: 1, sec: 1, secs: 1, seconds: 1, mins: 60, minutes: 60 };

/** Convert "512 KB" / "1.2 s" style quantities to a common base (MB, seconds) for comparison. */
export function toBaseQuantity(value: number, unitWord: string | undefined): { value: number; dimension: string } {
  const u = (unitWord ?? '').toLowerCase();
  if (u in SIZE_FACTOR) return { value: value * SIZE_FACTOR[u], dimension: 'size' };
  if (u in TIME_FACTOR) return { value: value * TIME_FACTOR[u], dimension: 'time' };
  if (/^months?$/.test(u)) return { value, dimension: 'months' };
  if (/^(days?|weeks?)$/.test(u)) return { value: u.startsWith('week') ? value * 7 : value, dimension: 'days' };
  return { value, dimension: u || 'number' };
}
