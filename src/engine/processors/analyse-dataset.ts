import { directiveValue } from '../directives';
import { formatValue } from '../numbers';
import { capitalise, listJoin, plural } from '../text';
import type { Analysis, EvidenceSet, Fact, NumberUnit } from '../types';
import { sortRecommendations, StatementBuilder, type StageContext } from './shared';

/**
 * Analyst rules for dataset evidence. Each rule reads facts by their metadata, writes a
 * statement from a template, and cites the facts it used. Interpretations are always hedged
 * and cite observations; recommendations cite the observations or interpretations that
 * prompted them. Nothing here introduces a figure that isn't in the evidence.
 */

function m(f: Fact, key: string): number {
  return Number(f.meta?.[key] ?? 0);
}
function s(f: Fact, key: string): string {
  return String(f.meta?.[key] ?? '');
}

/** Format a number the way the fact formats its own first number. */
function like(f: Fact, value: number, signed = false): string {
  const unit: NumberUnit = f.numbers[0]?.unit ?? 'number';
  const symbol = /^[−-]?([£$€])/.exec(f.display)?.[1];
  return formatValue(value, unit, { symbol, signed });
}
const pct = (v: number, signed = false) => formatValue(v, 'percent', { signed });

export function analyseDataset(ev: EvidenceSet, ctx: StageContext): Analysis {
  const threshold = directiveValue<number>(ctx.parsed, 'threshold', 10);
  const concentration = directiveValue<number>(ctx.parsed, 'concentration', 35);
  const maxRecs = directiveValue<number>(ctx.parsed, 'max recommendations', 5);
  const withInterpretations = directiveValue<boolean>(ctx.parsed, 'interpretations', true);

  const facts = ev.facts;
  const one = (pred: (f: Fact) => boolean) => facts.find(pred);
  const all = (pred: (f: Fact) => boolean) => facts.filter(pred);
  const stat = (metric: string, name: string) => one((f) => f.meta?.metric === metric && f.meta?.stat === name);

  const sb = new StatementBuilder();
  const periods = one((f) => f.label === 'Periods covered');
  const first = periods ? s(periods, 'first') : '';
  const last = periods ? s(periods, 'last') : '';

  const totals = all((f) => f.meta?.stat === 'total');
  const primaryMetric = s(totals.find((f) => f.meta?.primary) ?? totals[0], 'metric');

  // Ids of statements later rules link to.
  const ref = {
    total: '', change: '', changePct: 0, highLow: '', high: '', fall: '', fallPeriod: '', share: '', topCategory: '',
    topShare: 0, target: '', belowCount: 0, belowOf: 0, ratio: '', ratioPct: 0, ratioName: '', ratioParts: ['', ''],
    missing: '', missingCount: 0, missingColumns: [] as string[], declines: [] as { id: string; category: string }[], avg: '',
  };

  // --- Observations ---------------------------------------------------------
  for (const total of totals) {
    const metric = s(total, 'metric');
    const isPrimary = metric === primaryMetric;
    const avg = stat(metric, 'average');
    const refs = [total.id, ...(periods ? [periods.id] : []), ...(avg ? [avg.id] : [])];
    const text = periods
      ? `${capitalise(metric)} totalled ${total.display} across ${m(periods, 'count')} periods (${first} to ${last})${avg ? `, an average of ${avg.display} per period` : ''}.`
      : `${capitalise(metric)} totalled ${total.display}${avg ? `, an average of ${avg.display} per row` : ''}.`;
    const id = sb.add('observation', text, refs, { group: 'Totals and trends', polarity: 'neutral', weight: isPrimary ? 100 : 60 });
    if (isPrimary) {
      ref.total = id;
      ref.avg = avg?.display ?? '';
    }

    const change = stat(metric, 'change');
    if (change) {
      const p = m(change, 'pct');
      const from = like(change, m(change, 'from'));
      const to = like(change, m(change, 'to'));
      const notable = Math.abs(p) >= threshold;
      const text2 = notable
        ? `${capitalise(metric)} ${p > 0 ? 'rose' : 'fell'} ${pct(Math.abs(p))} from ${from} in ${first} to ${to} in ${last}.`
        : `${capitalise(metric)} moved ${pct(p, true)} between ${first} (${from}) and ${last} (${to}).`;
      const cid = sb.add('observation', text2, [change.id], {
        group: 'Totals and trends', polarity: notable ? (p > 0 ? 'positive' : 'negative') : 'neutral', weight: (isPrimary ? 50 : 30) + Math.abs(p),
      });
      if (isPrimary) {
        ref.change = cid;
        ref.changePct = notable ? p : 0;
      }
    }

    if (isPrimary) {
      const hi = stat(metric, 'high');
      const lo = stat(metric, 'low');
      if (hi && lo && s(hi, 'period') !== s(lo, 'period')) {
        ref.highLow = sb.add(
          'observation',
          `${capitalise(metric)} peaked in ${s(hi, 'period')} at ${like(hi, m(hi, 'value'))}; the lowest period was ${s(lo, 'period')} at ${like(lo, m(lo, 'value'))}.`,
          [hi.id, lo.id],
          { group: 'Totals and trends', polarity: 'neutral', weight: 40 },
        );
        ref.high = s(hi, 'period');
      }
      const fall = stat(metric, 'fall');
      if (fall && Math.abs(m(fall, 'pct')) >= threshold / 2) {
        ref.fall = sb.add(
          'observation',
          `The largest period-on-period fall in ${metric} was ${pct(Math.abs(m(fall, 'pct')))}, from ${s(fall, 'fromPeriod')} to ${s(fall, 'toPeriod')}.`,
          [fall.id],
          { group: 'Totals and trends', polarity: 'negative', weight: 30 + Math.abs(m(fall, 'pct')) },
        );
        ref.fallPeriod = s(fall, 'toPeriod');
      }
    }
  }

  // Breakdown of the primary metric
  const top = one((f) => f.meta?.stat === 'rank' && f.meta?.rank === 'top');
  const bottom = one((f) => f.meta?.stat === 'rank' && f.meta?.rank === 'bottom');
  if (top && bottom) {
    ref.share = sb.add(
      'observation',
      `${s(top, 'category')} contributed the most ${primaryMetric}: ${like(top, top.numbers[0].value)} (${pct(m(top, 'share'))} of the total). ` +
        `${s(bottom, 'category')} contributed the least: ${like(bottom, bottom.numbers[0].value)} (${pct(m(bottom, 'share'))}).`,
      [top.id, bottom.id],
      { group: 'Breakdown', polarity: 'neutral', weight: 45 },
    );
    ref.topCategory = s(top, 'category');
    ref.topShare = m(top, 'share');
  }
  const primaryChange = stat(primaryMetric, 'change');
  const totalRose = primaryChange ? m(primaryChange, 'pct') > 0 : false;
  const groupChanges = all((f) => f.meta?.stat === 'group-change');
  for (const gc of groupChanges.filter((g) => m(g, 'pct') <= -threshold).sort((a, b) => m(a, 'pct') - m(b, 'pct'))) {
    const category = s(gc, 'category');
    const id = sb.add(
      'observation',
      `${category} ${primaryMetric} fell ${pct(Math.abs(m(gc, 'pct')))}, from ${like(gc, m(gc, 'from'))} in ${first} to ${like(gc, m(gc, 'to'))} in ${last}${totalRose ? ', while the overall total rose' : ''}.`,
      totalRose && primaryChange ? [gc.id, primaryChange.id] : [gc.id],
      { group: 'Breakdown', polarity: 'negative', weight: 50 + Math.abs(m(gc, 'pct')) },
    );
    ref.declines.push({ id, category });
  }
  const riser = [...groupChanges].sort((a, b) => m(b, 'pct') - m(a, 'pct'))[0];
  if (riser && m(riser, 'pct') >= threshold) {
    sb.add(
      'observation',
      `${s(riser, 'category')} grew fastest: ${primaryMetric} rose ${pct(m(riser, 'pct'))}, from ${like(riser, m(riser, 'from'))} to ${like(riser, m(riser, 'to'))}.`,
      [riser.id],
      { group: 'Breakdown', polarity: 'positive', weight: 40 + m(riser, 'pct') },
    );
  }

  // Targets
  const attainment = one((f) => f.meta?.stat === 'attainment');
  const below = one((f) => f.meta?.stat === 'below-target');
  if (attainment) {
    const actual = s(attainment, 'metric');
    const target = attainment.label.split(' against ')[1] ?? 'target';
    const [share, totalA, totalT] = attainment.numbers;
    const symbol = /([£$€])/.exec(attainment.display)?.[1];
    let text =
      `${capitalise(actual)} reached ${pct(share.value)} of ${target} overall ` +
      `(${formatValue(totalA.value, totalA.unit, { symbol })} against ${formatValue(totalT.value, totalT.unit, { symbol })})`;
    const refs = [attainment.id];
    if (below) {
      ref.belowCount = m(below, 'count');
      ref.belowOf = m(below, 'of');
      text += ref.belowCount
        ? `; ${ref.belowCount} of ${ref.belowOf} periods were below ${target}.`
        : `; every period met or beat ${target}.`;
      refs.push(below.id);
    } else {
      text += '.';
    }
    ref.target = sb.add('observation', text, refs, {
      group: 'Targets', polarity: attainment.numbers[0].value >= 100 && !ref.belowCount ? 'positive' : ref.belowCount ? 'negative' : 'neutral', weight: 45,
    });
  }

  // Ratio
  const ratio = one((f) => f.meta?.stat === 'ratio');
  if (ratio) {
    const name = s(ratio, 'name');
    ref.ratioName = name;
    ref.ratioParts = [name.split(' per ')[0], name.split(' per ')[1]];
    if (ratio.meta?.first !== undefined) {
      ref.ratioPct = m(ratio, 'pct');
      ref.ratio = sb.add(
        'observation',
        `${capitalise(name)} moved from ${like(ratio, m(ratio, 'first'))} in ${first} to ${like(ratio, m(ratio, 'last'))} in ${last} (${pct(m(ratio, 'pct'), true)}).`,
        [ratio.id],
        { group: 'Totals and trends', polarity: 'neutral', weight: 35 + Math.abs(m(ratio, 'pct')) },
      );
    } else {
      ref.ratio = sb.add('observation', `${capitalise(name)} was ${like(ratio, m(ratio, 'overall'))} overall.`, [ratio.id], { group: 'Totals and trends', weight: 20 });
    }
  }

  // Data quality
  const missing = one((f) => f.meta?.stat === 'missing');
  if (missing) {
    const count = m(missing, 'count');
    ref.missingCount = count;
    const details = (missing.meta?.details as string[]) ?? [];
    const perColumn = all((f) => f.group === 'Data quality' && f.meta?.column !== undefined);
    ref.missingColumns = perColumn.map((f) => s(f, 'column'));
    ref.missing = sb.add(
      'observation',
      count
        ? `${count} ${plural(count, 'value')} ${count === 1 ? 'is' : 'are'} missing from the analysed columns: ${listJoin(details)}.`
        : 'No values are missing from the analysed columns.',
      [missing.id, ...perColumn.map((f) => f.id)],
      { group: 'Data quality', polarity: count ? 'negative' : 'positive', weight: count ? 55 : 5 },
    );
  }

  // --- Interpretations ------------------------------------------------------
  const interp = { growth: '', mix: '', conc: '', target: '', missing: '', dip: '', local: new Map<string, string>() };
  if (withInterpretations) {
    if (ref.change && ref.changePct > 0) {
      interp.growth = sb.add('interpretation', 'Demand may be growing, or prices may have risen; this data alone cannot separate the two.', [ref.change]);
      if (ref.ratio && ref.ratioPct >= threshold / 2) {
        interp.mix = sb.add(
          'interpretation',
          `Part of the growth in ${ref.ratioParts[0]} may come from higher ${ref.ratioName} rather than from selling more.`,
          [ref.change, ref.ratio],
        );
      }
    }
    if (ref.change && ref.changePct < 0) {
      interp.growth = sb.add('interpretation', `${capitalise(primaryMetric)} may be softening; the data does not show whether this is seasonal or lasting.`, [ref.change]);
    }
    if (ref.share && ref.topShare >= concentration) {
      interp.conc = sb.add('interpretation', `Results may depend heavily on ${ref.topCategory}; a change there would move the total noticeably.`, [ref.share]);
    }
    for (const d of ref.declines) {
      const id = sb.add(
        'interpretation',
        totalRose
          ? `The fall in ${d.category} may be a local issue rather than a market-wide one, since the total still grew.`
          : `The fall in ${d.category} may be part of a wider decline across the business.`,
        [d.id],
      );
      interp.local.set(d.category, id);
    }
    if (ref.target && ref.belowCount && ref.belowCount * 2 >= ref.belowOf) {
      interp.target = sb.add('interpretation', 'Targets may be set above the recent run-rate, or performance may be lagging the plan; the data cannot say which.', [ref.target]);
    }
    if (ref.missing && ref.missingCount) {
      interp.missing = sb.add('interpretation', `Totals for ${listJoin(ref.missingColumns)} may be understated if the missing rows had activity.`, [ref.missing]);
    }
    if (ref.fall) {
      interp.dip = sb.add('interpretation', `The ${ref.fallPeriod} dip may be a one-off; the data covers too few periods to confirm a seasonal pattern.`, [ref.fall]);
    }
  }

  // --- Recommendations ------------------------------------------------------
  const link = (...ids: string[]) => ids.filter(Boolean);
  if (ref.missingCount) {
    sb.add('recommendation', `Fill in the ${ref.missingCount} missing ${plural(ref.missingCount, 'value')} before relying on per-period or per-unit figures.`, link(ref.missing, interp.missing), { priority: 'high', weight: 60 });
  }
  for (const d of ref.declines) {
    sb.add('recommendation', `Review what changed in ${d.category} between ${first} and ${last} before the next planning cycle.`, link(d.id, interp.local.get(d.category) ?? ''), { priority: 'high', weight: 55 });
  }
  if (ref.change && ref.changePct < 0) {
    sb.add('recommendation', `Investigate the fall in ${primaryMetric} from ${first} to ${last}, starting with the largest period-on-period drop.`, link(ref.change, ref.fall, interp.growth), { priority: 'high', weight: 58 });
  }
  if (ref.target && ref.belowCount && ref.avg) {
    sb.add('recommendation', `Compare the next targets with the recent average of ${ref.avg} per period before setting them.`, link(ref.target, ref.total, interp.target), { priority: 'medium', weight: 45 });
  }
  if (ref.share && ref.topShare >= concentration) {
    sb.add('recommendation', `Report ${ref.topCategory} separately each period so changes there are visible early.`, link(ref.share, interp.conc), { priority: 'medium', weight: 40 });
  }
  if (ref.ratio && Math.abs(ref.ratioPct) >= threshold / 2) {
    sb.add('recommendation', `Check whether price changes or product mix explain the change in ${ref.ratioName}.`, link(ref.ratio, interp.mix), { priority: 'low', weight: 30 });
  }
  if (ref.highLow && ref.changePct > 0) {
    sb.add('recommendation', `Identify what drove the ${ref.high} peak and test whether it can be repeated.`, link(ref.highLow, interp.growth), { priority: 'low', weight: 25 });
  }
  if (ref.fall) {
    sb.add('recommendation', `Look into the ${ref.fallPeriod} dip and note any one-off causes so future comparisons are fair.`, link(ref.fall, interp.dip), { priority: 'low', weight: 20 });
  }

  // --- Unavailable ----------------------------------------------------------
  for (const gap of ev.gaps) sb.add('unavailable', gap, []);
  sb.add('unavailable', 'Forecasts: this workflow describes the data it was given; it does not predict future periods.', []);

  const recommendations = sortRecommendations(sb.of('recommendation')).slice(0, maxRecs);
  return {
    kind: 'dataset',
    subject: ev.subject,
    observations: sb.of('observation'),
    interpretations: sb.of('interpretation'),
    recommendations,
    unavailable: sb.of('unavailable'),
    claims: ev.claims,
  };
}
