/** A small, strict CSV reader: quoted fields, escaped quotes, comma/semicolon/tab delimiters. */

export interface CsvTable {
  headers: string[];
  rows: string[][];
  /** 1-based line numbers of rows dropped because their field count didn't match the header. */
  rejectedLines: number[];
  delimiter: string;
}

export class CsvError extends Error {}

function detectDelimiter(headerLine: string): string {
  const counts = [',', ';', '\t'].map((d) => ({ d, n: headerLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ',';
}

function splitRecords(text: string): { line: number; text: string }[] {
  // Split on newlines that are not inside quotes.
  const records: { line: number; text: string }[] = [];
  let current = '';
  let inQuotes = false;
  let line = 1;
  let startLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      records.push({ line: startLine, text: current });
      current = '';
      line++;
      startLine = line;
      continue;
    }
    if (ch === '\n') line++;
    current += ch;
  }
  if (current.length > 0) records.push({ line: startLine, text: current });
  if (inQuotes) throw new CsvError(`A quoted field that starts on line ${startLine} is never closed.`);
  return records.filter((r) => r.text.trim().length > 0);
}

function splitFields(record: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < record.length; i++) {
    const ch = record[i];
    if (inQuotes) {
      if (ch === '"' && record[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseCsv(text: string): CsvTable {
  const records = splitRecords(text.replace(/^﻿/, ''));
  if (records.length === 0) throw new CsvError('The dataset is empty.');
  const delimiter = detectDelimiter(records[0].text);
  const headers = splitFields(records[0].text, delimiter);
  if (headers.length < 2) throw new CsvError('The first row needs at least two column names.');
  if (headers.some((h) => h.length === 0)) throw new CsvError('Every column in the first row needs a name.');
  if (headers.every((h) => /^[\d.,£$€%\s-]+$/.test(h))) {
    throw new CsvError('The first row looks like data. Add a row of column names at the top.');
  }
  const lower = headers.map((h) => h.toLowerCase());
  const dup = lower.find((h, i) => lower.indexOf(h) !== i);
  if (dup) throw new CsvError(`The column name "${dup}" appears more than once.`);

  const rows: string[][] = [];
  const rejectedLines: number[] = [];
  for (const record of records.slice(1)) {
    const fields = splitFields(record.text, delimiter);
    if (fields.length !== headers.length) {
      rejectedLines.push(record.line);
      continue;
    }
    rows.push(fields);
  }
  if (rows.length === 0) throw new CsvError('The dataset has column names but no complete rows of data.');
  return { headers, rows, rejectedLines, delimiter };
}

const MISSING = new Set(['', 'na', 'n/a', 'null', 'none', '-', '—', '?', 'nan', 'missing']);

export function isMissing(cell: string): boolean {
  return MISSING.has(cell.trim().toLowerCase());
}
