/** Small text utilities shared by processors and the reviewer. */

const STOPWORDS = new Set(
  `a an and are as at be been by for from had has have in into is it its of on or our over per
  than that the their there this those to was were which while with within across between
  during each total all also not only very more most less least about around roughly
  approximately nearly almost will would should can could might`
    .split(/\s+/)
    .filter(Boolean),
);

const MONTHS: Record<string, string> = {
  january: 'jan', february: 'feb', march: 'mar', april: 'apr', may: 'may', june: 'jun',
  july: 'jul', august: 'aug', september: 'sep', sept: 'sep', october: 'oct', november: 'nov',
  december: 'dec', jan: 'jan', feb: 'feb', mar: 'mar', apr: 'apr', jun: 'jun', jul: 'jul',
  aug: 'aug', sep: 'sep', oct: 'oct', nov: 'nov', dec: 'dec',
};

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function normaliseWord(word: string): string {
  const month = MONTHS[word];
  if (month) return month;
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.length > 4 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Lower-case content words, with months and simple plurals normalised. */
export function toTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return Array.from(new Set(words.map(normaliseWord)));
}

export function sharedTerms(a: string[], b: string[]): string[] {
  const set = new Set(b);
  return a.filter((t) => set.has(t));
}

/** Split text into non-empty trimmed lines, keeping 1-based line numbers. */
export function lines(text: string): { line: number; text: string }[] {
  return text
    .split(/\r?\n/)
    .map((t, i) => ({ line: i + 1, text: t.trim() }))
    .filter((l) => l.text.length > 0);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** "a, b and c" */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const HEDGE_WORDS = [
  'may', 'might', 'could', 'possibly', 'perhaps', 'likely', 'unlikely', 'suggests', 'suggest',
  'appears', 'seems', 'probably',
];

/** True when the text uses hedged language. A capitalised "May" is treated as the month. */
export function hasHedge(text: string): boolean {
  const words = text.split(/[^A-Za-z]+/).filter((w) => w !== 'May').map((w) => w.toLowerCase());
  return HEDGE_WORDS.some((h) => words.includes(h));
}

export const RISE_WORDS = ['rose', 'rise', 'grew', 'grow', 'growth', 'increase', 'increased', 'up', 'higher', 'gain', 'gained', 'improved', 'climbed'];
export const FALL_WORDS = ['fell', 'fall', 'declined', 'decline', 'decrease', 'decreased', 'down', 'lower', 'drop', 'dropped', 'shrank', 'worse'];

export function direction(text: string): 'up' | 'down' | null {
  const words = text.toLowerCase().split(/[^a-z]+/);
  const up = RISE_WORDS.some((w) => words.includes(w));
  const down = FALL_WORDS.some((w) => words.includes(w));
  if (up && !down) return 'up';
  if (down && !up) return 'down';
  return null;
}
