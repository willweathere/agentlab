import { CsvError, isMissing, parseCsv } from '../csv';
import { directiveValue } from '../directives';
import { formatValue, parseLooseNumber, pctChange } from '../numbers';
import { capitalise, listJoin, MONTH_LABELS, plural } from '../text';
import type { EvidenceSet, FactNumber, NumberUnit, WorkflowInput } from '../types';
import { FactBuilder, parseClaims, StageError, type StageContext } from './shared';

/**
 * Researcher for CSV datasets. Pure arithmetic: totals, averages, first-to-last changes,
 * period-on-period moves, highs and lows, group shares, target attainment, a derived ratio
 * and missing values. Every figure becomes a fact with an id the later stages cite.
 */

interface Column {
  name: string;
  index: number;
  kind: 'numeric' | 'period' | 'category';
  unit: NumberUnit;
  symbol: string;
}

const PERIOD_NAME = /^(month|date|period|week|quarter|year|day)$/i;
const PERIOD_VALUE = /^(\d{4}-\d{2}(-\d{2})?|q[1-4]\s?\d{4}|\d{4}\s?q[1-4]|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s?\d{2,4}|week\s?\d+)$/i;
const CURRENCY_NAME = /revenue|sales|price|cost|target|amount|value|spend|income|profit|budget|turnover|£|\$|€/i;

function periodLabel(raw: string): string {
  const iso = /^(\d{4})-(\d{2})$/.exec(raw);
  if (iso) {
    const m = Number(iso[2]);
    if (m >= 1 && m <= 12) return `${MONTH_LABELS[m - 1]} ${iso[1]}`;
  }
  return raw;
}

function num(cell: string): number | null {
  if (isMissing(cell)) return null;
  const parsed = parseLooseNumber(cell.replace(/\s/g, ''));
  return parsed ? parsed.value : null;
}

function classify(headers: string[], rows: string[][]): Column[] {
  return headers.map((name, index) => {
    const cells = rows.map((r) => r[index]).filter((c) => !isMissing(c));
    const parsed = cells.map((c) => parseLooseNumber(c.replace(/\s/g, '')));
    const numericShare = cells.length ? parsed.filter(Boolean).length / cells.length : 0;
    const looksPeriod = PERIOD_NAME.test(name) || (cells.length > 0 && cells.every((c) => PERIOD_VALUE.test(c)));
    const symbol = parsed.find((p) => p?.symbol)?.symbol ?? '£';
    if (looksPeriod) return { name, index, kind: 'period', unit: 'number', symbol };
    if (numericShare >= 0.8) {
      const anyPercent = parsed.some((p) => p?.unit === 'percent');
      const anyCurrency = parsed.some((p) => p?.unit === 'currency') || CURRENCY_NAME.test(name);
      const allIntegers = parsed.every((p) => !p || Number.isInteger(p.value));
      const unit: NumberUnit = anyPercent ? 'percent' : anyCurrency ? 'currency' : allIntegers ? 'count' : 'number';
      return { name, index, kind: 'numeric', unit, symbol };
    }
    return { name, index, kind: 'category', unit: 'number', symbol };
  });
}

function singular(word: string): string {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function researchDataset(input: WorkflowInput, ctx: StageContext): EvidenceSet {
  let table;
  try {
    table = parseCsv(input.primary);
  } catch (e) {
    if (e instanceof CsvError) throw new StageError(`The dataset could not be read: ${e.message}`);
    throw e;
  }
  const { headers, rows, rejectedLines } = table;
  if (rejectedLines.length) {
    ctx.warn(
      `Skipped ${rejectedLines.length} ${plural(rejectedLines.length, 'row')} with the wrong number of fields (line ${rejectedLines.slice(0, 5).join(', ')}${rejectedLines.length > 5 ? '…' : ''}).`,
    );
  }

  const columns = classify(headers, rows);
  const byName = (name: string) => columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  const numeric = columns.filter((c) => c.kind === 'numeric');
  if (numeric.length === 0) throw new StageError('The dataset has no numeric columns to summarise.');

  const period = columns.find((c) => c.kind === 'period');
  const categories = columns.filter((c) => c.kind === 'category');

  // --- Directives -----------------------------------------------------------
  const focusNames = directiveValue<string[]>(ctx.parsed, 'focus', []);
  const compare = directiveValue<string[]>(ctx.parsed, 'compare', []);
  const ratio = directiveValue<string[]>(ctx.parsed, 'ratio', []);
  const groupName = directiveValue<string>(ctx.parsed, 'group by', '');

  const numericByName = (name: string, purpose: string): Column | undefined => {
    const col = byName(name);
    if (!col) {
      ctx.warn(`${purpose}: there is no column named “${name}”.`);
      return undefined;
    }
    if (col.kind !== 'numeric') {
      ctx.warn(`${purpose}: “${name}” is not a numeric column.`);
      return undefined;
    }
    return col;
  };

  let targetCol: Column | undefined;
  let actualCol: Column | undefined;
  if (compare.length === 2) {
    actualCol = numericByName(compare[0], 'Compare');
    targetCol = numericByName(compare[1], 'Compare');
  } else {
    targetCol = numeric.find((c) => /target|goal|budget|plan/i.test(c.name));
  }

  let focus: Column[];
  if (focusNames.length) {
    focus = focusNames.map((n) => numericByName(n, 'Focus')).filter((c): c is Column => Boolean(c));
    if (focus.length === 0) throw new StageError(`None of the focus columns (${focusNames.join(', ')}) are numeric columns in the dataset.`);
  } else {
    focus = numeric.filter((c) => c !== targetCol);
    if (focus.length === 0) focus = numeric;
  }
  if (!actualCol && targetCol) actualCol = focus.find((c) => c !== targetCol);

  let group: Column | undefined;
  if (groupName) {
    group = byName(groupName);
    if (!group || group.kind !== 'category') {
      ctx.warn(`Group by: “${groupName}” is not a text column, so the first text column is used instead.`);
      group = categories[0];
    }
  } else {
    group = categories[0];
  }

  let ratioCols: [Column, Column] | undefined;
  if (ratio.length === 2) {
    const a = numericByName(ratio[0], 'Ratio');
    const b = numericByName(ratio[1], 'Ratio');
    if (a && b) ratioCols = [a, b];
  }

  // --- Periods --------------------------------------------------------------
  let periods: string[] = [];
  if (period) {
    const seen: string[] = [];
    for (const r of rows) if (!seen.includes(r[period.index]) && !isMissing(r[period.index])) seen.push(r[period.index]);
    periods = seen.every((p) => /^\d{4}-\d{2}(-\d{2})?$/.test(p)) ? [...seen].sort() : seen;
  }
  const labels = periods.map(periodLabel);
  const first = labels[0];
  const last = labels[labels.length - 1];

  const f = new FactBuilder();
  const metricTerms = (c: Column) => [c.name];

  // --- Coverage -------------------------------------------------------------
  f.add({
    group: 'Coverage', label: 'Rows analysed', display: `${rows.length} ${plural(rows.length, 'row')} × ${headers.length} columns`,
    numbers: [{ value: rows.length, unit: 'count' }, { value: headers.length, unit: 'count' }],
    source: 'Dataset', terms: ['rows', 'records', 'dataset'],
    meta: { rows: rows.length, columns: headers.length },
  });
  const periodsId = period && periods.length
    ? f.add({
        group: 'Coverage', label: 'Periods covered', display: `${periods.length} (${first} to ${last})`,
        numbers: [{ value: periods.length, unit: 'count' }], source: `Column ${period.name}`,
        terms: ['periods', 'months', ...labels], meta: { count: periods.length, first, last },
      })
    : undefined;
  let groupValues: string[] = [];
  if (group) {
    groupValues = Array.from(new Set(rows.map((r) => r[group.index]).filter((v) => !isMissing(v))));
    f.add({
      group: 'Coverage', label: `${capitalise(group.name)} values`, display: `${groupValues.length}: ${groupValues.join(', ')}`,
      numbers: [{ value: groupValues.length, unit: 'count' }], source: `Column ${group.name}`,
      terms: [group.name, ...groupValues], meta: { column: group.name, values: groupValues },
    });
  }

  const sumWhere = (col: Column, pred: (r: string[]) => boolean) =>
    rows.filter(pred).reduce((s, r) => s + (num(r[col.index]) ?? 0), 0);
  const fmt = (v: number, col: Column, signed = false) => formatValue(v, col.unit, { symbol: col.symbol, signed });

  // --- Per metric -----------------------------------------------------------
  focus.forEach((col, metricIndex) => {
    const values = rows.map((r) => num(r[col.index])).filter((v): v is number => v !== null);
    const total = values.reduce((s, v) => s + v, 0);
    const metric = col.name;
    f.add({
      group: 'Totals', label: `Total ${metric}`, display: fmt(total, col), numbers: [{ value: total, unit: col.unit }],
      source: `Column ${metric}, ${values.length} values`, terms: ['total', ...metricTerms(col)],
      meta: { metric, stat: 'total', value: total, primary: metricIndex === 0 },
    });

    if (period && periods.length) {
      const perPeriod = periods.map((p) => sumWhere(col, (r) => r[period.index] === p));
      const avg = total / periods.length;
      f.add({
        group: 'Totals', label: `Average ${metric} per period`, display: fmt(avg, col), numbers: [{ value: avg, unit: col.unit }],
        source: `Total ÷ ${periods.length} periods`, terms: ['average', 'mean', ...metricTerms(col)],
        meta: { metric, stat: 'average', value: avg },
      });
      let hi = 0;
      let lo = 0;
      perPeriod.forEach((v, i) => {
        if (v > perPeriod[hi]) hi = i;
        if (v < perPeriod[lo]) lo = i;
      });
      f.add({
        group: 'Highs and lows', label: `Highest period for ${metric}`, display: `${labels[hi]} (${fmt(perPeriod[hi], col)})`,
        numbers: [{ value: perPeriod[hi], unit: col.unit }], source: `Column ${metric}, summed by ${period.name}`,
        terms: ['highest', 'peak', 'best', labels[hi], ...metricTerms(col)],
        meta: { metric, stat: 'high', period: labels[hi], value: perPeriod[hi] },
      });
      f.add({
        group: 'Highs and lows', label: `Lowest period for ${metric}`, display: `${labels[lo]} (${fmt(perPeriod[lo], col)})`,
        numbers: [{ value: perPeriod[lo], unit: col.unit }], source: `Column ${metric}, summed by ${period.name}`,
        terms: ['lowest', 'weakest', labels[lo], ...metricTerms(col)],
        meta: { metric, stat: 'low', period: labels[lo], value: perPeriod[lo] },
      });
      if (periods.length >= 2) {
        const a = perPeriod[0];
        const b = perPeriod[perPeriod.length - 1];
        const pct = pctChange(a, b);
        if (pct !== null) {
          f.add({
            group: 'Changes', label: `Change in ${metric}, ${first} to ${last}`,
            display: `${fmt(a, col)} → ${fmt(b, col)} (${formatValue(pct, 'percent', { signed: true })})`,
            numbers: [{ value: a, unit: col.unit }, { value: b, unit: col.unit }, { value: pct, unit: 'percent' }],
            source: `Column ${metric}, first and last period`, terms: ['change', 'growth', first, last, ...metricTerms(col)],
            polarity: pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral',
            meta: { metric, stat: 'change', pct, from: a, to: b },
          });
        }
      }
      if (periods.length >= 3) {
        let rise = { pct: -Infinity, i: 0 };
        let fall = { pct: Infinity, i: 0 };
        for (let i = 1; i < perPeriod.length; i++) {
          const pct = pctChange(perPeriod[i - 1], perPeriod[i]);
          if (pct === null) continue;
          if (pct > rise.pct) rise = { pct, i };
          if (pct < fall.pct) fall = { pct, i };
        }
        if (rise.pct > 0) {
          f.add({
            group: 'Changes', label: `Largest period-on-period rise in ${metric}`,
            display: `${formatValue(rise.pct, 'percent', { signed: true })} (${labels[rise.i - 1]} to ${labels[rise.i]})`,
            numbers: [{ value: rise.pct, unit: 'percent' }, { value: perPeriod[rise.i - 1], unit: col.unit }, { value: perPeriod[rise.i], unit: col.unit }],
            source: `Column ${metric}, consecutive periods`, terms: ['rise', 'increase', labels[rise.i - 1], labels[rise.i], ...metricTerms(col)],
            polarity: 'positive', meta: { metric, stat: 'rise', pct: rise.pct, fromPeriod: labels[rise.i - 1], toPeriod: labels[rise.i] },
          });
        }
        if (fall.pct < 0) {
          f.add({
            group: 'Changes', label: `Largest period-on-period fall in ${metric}`,
            display: `${formatValue(fall.pct, 'percent', { signed: true })} (${labels[fall.i - 1]} to ${labels[fall.i]})`,
            numbers: [{ value: fall.pct, unit: 'percent' }, { value: perPeriod[fall.i - 1], unit: col.unit }, { value: perPeriod[fall.i], unit: col.unit }],
            source: `Column ${metric}, consecutive periods`, terms: ['fall', 'drop', 'dip', labels[fall.i - 1], labels[fall.i], ...metricTerms(col)],
            polarity: 'negative', meta: { metric, stat: 'fall', pct: fall.pct, fromPeriod: labels[fall.i - 1], toPeriod: labels[fall.i] },
          });
        }
      }
    } else {
      const avg = total / Math.max(values.length, 1);
      f.add({
        group: 'Totals', label: `Average ${metric} per row`, display: fmt(avg, col), numbers: [{ value: avg, unit: col.unit }],
        source: `Total ÷ ${values.length} values`, terms: ['average', 'mean', ...metricTerms(col)],
        meta: { metric, stat: 'average', value: avg },
      });
    }

    // Group breakdown for the primary metric only, to keep the evidence focused.
    if (group && metricIndex === 0 && groupValues.length >= 2 && total !== 0) {
      const totals = groupValues.map((g) => ({ g, v: sumWhere(col, (r) => r[group.index] === g) }));
      totals.forEach(({ g, v }) => {
        const share = (v / total) * 100;
        f.add({
          group: 'Breakdown', label: `${capitalise(metric)} from ${g}`, display: `${fmt(v, col)} (${formatValue(share, 'percent')} of total)`,
          numbers: [{ value: v, unit: col.unit }, { value: share, unit: 'percent' }],
          source: `Column ${metric}, rows where ${group.name} is ${g}`, terms: [g, group.name, 'share', ...metricTerms(col)],
          meta: { metric, stat: 'group-total', category: g, value: v, share },
        });
      });
      const sorted = [...totals].sort((a, b) => b.v - a.v);
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      f.add({
        group: 'Breakdown', label: `Largest ${group.name} by ${metric}`,
        display: `${top.g} (${fmt(top.v, col)}, ${formatValue((top.v / total) * 100, 'percent')})`,
        numbers: [{ value: top.v, unit: col.unit }, { value: (top.v / total) * 100, unit: 'percent' }],
        source: `Ranking of ${group.name} totals`, terms: [top.g, group.name, 'largest', 'top', ...metricTerms(col)],
        meta: { metric, stat: 'rank', rank: 'top', category: top.g, share: (top.v / total) * 100, column: group.name },
      });
      f.add({
        group: 'Breakdown', label: `Smallest ${group.name} by ${metric}`,
        display: `${bottom.g} (${fmt(bottom.v, col)}, ${formatValue((bottom.v / total) * 100, 'percent')})`,
        numbers: [{ value: bottom.v, unit: col.unit }, { value: (bottom.v / total) * 100, unit: 'percent' }],
        source: `Ranking of ${group.name} totals`, terms: [bottom.g, group.name, 'smallest', 'bottom', ...metricTerms(col)],
        meta: { metric, stat: 'rank', rank: 'bottom', category: bottom.g, share: (bottom.v / total) * 100, column: group.name },
      });
      if (period && periods.length >= 2) {
        groupValues.forEach((g) => {
          const a = sumWhere(col, (r) => r[group.index] === g && r[period.index] === periods[0]);
          const b = sumWhere(col, (r) => r[group.index] === g && r[period.index] === periods[periods.length - 1]);
          const pct = pctChange(a, b);
          if (pct === null) return;
          f.add({
            group: 'Breakdown', label: `Change in ${metric} for ${g}, ${first} to ${last}`,
            display: `${fmt(a, col)} → ${fmt(b, col)} (${formatValue(pct, 'percent', { signed: true })})`,
            numbers: [{ value: a, unit: col.unit }, { value: b, unit: col.unit }, { value: pct, unit: 'percent' }],
            source: `Column ${metric}, ${group.name} ${g}, first and last period`,
            terms: [g, group.name, 'change', first, last, ...metricTerms(col)],
            polarity: pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral',
            meta: { metric, stat: 'group-change', category: g, pct, from: a, to: b },
          });
        });
      }
    }
  });

  // --- Target comparison ----------------------------------------------------
  if (actualCol && targetCol && actualCol !== targetCol) {
    const totalA = sumWhere(actualCol, () => true);
    const totalT = sumWhere(targetCol, () => true);
    if (totalT !== 0) {
      const attainment = (totalA / totalT) * 100;
      f.add({
        group: 'Targets', label: `${capitalise(actualCol.name)} against ${targetCol.name}`,
        display: `${formatValue(attainment, 'percent')} of ${targetCol.name} (${fmt(totalA, actualCol)} of ${fmt(totalT, targetCol)})`,
        numbers: [{ value: attainment, unit: 'percent' }, { value: totalA, unit: actualCol.unit }, { value: totalT, unit: targetCol.unit }],
        source: `Columns ${actualCol.name} and ${targetCol.name}`, terms: ['target', 'attainment', actualCol.name, targetCol.name],
        polarity: attainment >= 100 ? 'positive' : 'negative', meta: { metric: actualCol.name, stat: 'attainment', pct: attainment },
      });
      if (period && periods.length) {
        const below = periods.filter((p) => sumWhere(actualCol!, (r) => r[period.index] === p) < sumWhere(targetCol!, (r) => r[period.index] === p));
        const belowLabels = below.map(periodLabel);
        f.add({
          group: 'Targets', label: `Periods below ${targetCol.name}`,
          display: below.length ? `${below.length} of ${periods.length}: ${belowLabels.join(', ')}` : `None of ${periods.length}`,
          numbers: [{ value: below.length, unit: 'count' }, { value: periods.length, unit: 'count' }],
          source: `Columns ${actualCol.name} and ${targetCol.name}, summed by ${period.name}`, terms: ['below', 'target', 'missed', ...belowLabels],
          polarity: below.length ? 'negative' : 'positive',
          meta: { metric: actualCol.name, stat: 'below-target', count: below.length, of: periods.length, periods: belowLabels },
        });
      }
    }
  }

  // --- Ratio ----------------------------------------------------------------
  if (ratioCols) {
    const [a, b] = ratioCols;
    const both = (r: string[]) => num(r[a.index]) !== null && num(r[b.index]) !== null;
    const ratioFor = (pred: (r: string[]) => boolean) => {
      const sa = sumWhere(a, (r) => pred(r) && both(r));
      const sb = sumWhere(b, (r) => pred(r) && both(r));
      return sb === 0 ? null : sa / sb;
    };
    const overall = ratioFor(() => true);
    const unit: NumberUnit = a.unit === 'currency' ? 'currency' : 'number';
    const fmtR = (v: number, signed = false) => formatValue(v, unit, { symbol: a.symbol, signed });
    const name = `${a.name} per ${singular(b.name)}`;
    if (overall !== null) {
      const numbers: FactNumber[] = [{ value: overall, unit }];
      let display = fmtR(overall);
      const meta: Record<string, string | number> = { stat: 'ratio', name, overall };
      if (period && periods.length >= 2) {
        const r1 = ratioFor((r) => r[period.index] === periods[0]);
        const r2 = ratioFor((r) => r[period.index] === periods[periods.length - 1]);
        if (r1 !== null && r2 !== null) {
          const pct = pctChange(r1, r2) ?? 0;
          numbers.push({ value: r1, unit }, { value: r2, unit }, { value: pct, unit: 'percent' });
          display = `${fmtR(overall)} overall; ${fmtR(r1)} in ${first}, ${fmtR(r2)} in ${last} (${formatValue(pct, 'percent', { signed: true })})`;
          Object.assign(meta, { first: r1, last: r2, pct });
        }
      }
      f.add({
        group: 'Derived', label: capitalise(name), display, numbers, source: `${a.name} ÷ ${b.name}, rows where both are present`,
        terms: [a.name, b.name, 'ratio', 'per'], meta,
      });
    }
  }

  // --- Missing values -------------------------------------------------------
  const audited = Array.from(new Set([...focus, ...(targetCol ? [targetCol] : []), ...(ratioCols ?? [])]));
  const cells = rows.length * audited.length;
  const details: string[] = [];
  let missing = 0;
  audited.forEach((col) => {
    const where = rows.filter((r) => isMissing(r[col.index]));
    if (!where.length) return;
    missing += where.length;
    const described = where.map((r) =>
      [group ? r[group.index] : null, period ? periodLabel(r[period.index]) : null].filter(Boolean).join(', ') || 'one row',
    );
    details.push(...described.map((d) => `${col.name} for ${d}`));
    f.add({
      group: 'Data quality', label: `Missing ${col.name} values`, display: `${where.length}: ${described.join('; ')}`,
      numbers: [{ value: where.length, unit: 'count' }], source: `Column ${col.name}`,
      terms: ['missing', 'gap', col.name, ...described], polarity: 'negative',
      meta: { column: col.name, count: where.length },
    });
  });
  const share = cells ? (missing / cells) * 100 : 0;
  f.add({
    group: 'Data quality', label: 'Missing values in analysed columns',
    display: `${missing} of ${cells} cells (${formatValue(share, 'percent')})`,
    numbers: [{ value: missing, unit: 'count' }, { value: cells, unit: 'count' }, { value: share, unit: 'percent' }],
    source: `Columns ${audited.map((c) => c.name).join(', ')}`, terms: ['missing', 'gaps', 'data quality'],
    polarity: missing ? 'negative' : 'positive',
    meta: { stat: 'missing', count: missing, cells, share, details, columns: audited.map((c) => c.name) },
  });

  // --- Gaps -----------------------------------------------------------------
  const names = headers.map((h) => h.toLowerCase()).join(' ');
  const gaps: string[] = [];
  if (!/cost|profit|margin|expense/.test(names)) gaps.push('Profit and margin: the dataset has no cost or profit column.');
  if (!/customer|client|account/.test(names)) gaps.push('Customer behaviour: the dataset has no customer column, so repeat buying and churn are unknown.');
  if (!period) gaps.push('Trends over time: there is no period column, so changes over time cannot be measured.');
  else if (periods.length < 24) gaps.push('Seasonality: the data covers less than two years, so seasonal patterns cannot be separated from other changes.');
  gaps.push('Causes: the data records outcomes, not the reasons behind them.');
  if (missing > 0) gaps.push(`Complete figures for ${listJoin(Array.from(new Set(details.map((d) => d.split(' for ')[0]))))}: some values are missing.`);

  const subject = `${rows.length} ${plural(rows.length, 'row')} of ${listJoin(focus.map((c) => c.name))}` + (periodsId ? ` over ${periods.length} periods` : '');
  return { kind: 'dataset', subject, facts: f.facts, claims: parseClaims(input.claims), gaps };
}
