import { directiveValue } from '../directives';
import { extractNumbers, toBaseQuantity } from '../numbers';
import { plural, sharedTerms, toTerms } from '../text';
import type { EvidenceSet, FactNumber, Priority, WorkflowInput } from '../types';
import { FactBuilder, parseClaims, PRIORITY_RANK, StageError, type StageContext } from './shared';

/**
 * Researcher for written website descriptions. It reads "attribute: value" lines and tests
 * each checklist item against them. It never fetches anything: the description is the only
 * source, and the evidence says so.
 */

interface Attribute {
  key: string;
  value: string;
  factId: string;
  terms: string[];
}

export type ConditionKind = 'present' | 'absent' | 'all' | 'max' | 'min' | 'under' | 'over' | 'exactly' | 'includes' | 'excludes';

interface Condition {
  kind: ConditionKind;
  amount?: number;
  unitWord?: string;
  text?: string;
  raw: string;
}

const TRUTHY = /^(yes|true|present|included|enabled|on|available)\b/i;
const FALSY = /^(no|none|false|absent|missing|not\b|disabled|off|n\/a|0\b)/i;

export function parseCondition(raw: string): Condition | null {
  const t = raw.trim().toLowerCase();
  if (/^(present|yes|exists|included|required)$/.test(t)) return { kind: 'present', raw };
  if (/^(absent|no|none|not present)$/.test(t)) return { kind: 'absent', raw };
  if (/^(all|every|100%)$/.test(t)) return { kind: 'all', raw };
  const quantity = /^(at most|no more than|max(?:imum)?|≤|<=|at least|no fewer than|min(?:imum)?|≥|>=|under|below|less than|over|above|more than|exactly|=)\s*(\d+(?:\.\d+)?)\s*([a-z%]+)?$/.exec(t);
  if (quantity) {
    const [, op, amount, unitWord] = quantity;
    const kind: ConditionKind = /at most|no more|max|≤|<=/.test(op)
      ? 'max'
      : /at least|no fewer|min|≥|>=/.test(op)
        ? 'min'
        : /under|below|less/.test(op)
          ? 'under'
          : /over|above|more/.test(op)
            ? 'over'
            : 'exactly';
    return { kind, amount: Number(amount), unitWord, raw };
  }
  const inc = /^(includes|mentions|contains|has)\s+(.+)$/.exec(t);
  if (inc) return { kind: 'includes', text: inc[2].trim(), raw };
  const exc = /^(excludes|does not include|no)\s+(.+)$/.exec(t);
  if (exc) return { kind: 'excludes', text: exc[2].trim(), raw };
  return null;
}

function findAttribute(attrs: Attribute[], name: string): Attribute | undefined {
  const n = name.trim().toLowerCase();
  const exact = attrs.find((a) => a.key.toLowerCase() === n);
  if (exact) return exact;
  const contains = attrs.find((a) => a.key.toLowerCase().includes(n) || n.includes(a.key.toLowerCase()));
  if (contains) return contains;
  const terms = toTerms(name);
  let best: { a: Attribute; score: number } | undefined;
  for (const a of attrs) {
    const score = sharedTerms(terms, a.terms).length;
    if (score > 0 && score >= Math.ceil(terms.length * 0.6) && (!best || score > best.score)) best = { a, score };
  }
  return best?.a;
}

/** "9 of 14 images" → { x: 9, y: 14 } */
function fraction(value: string): { x: number; y: number } | null {
  const m = /(\d+(?:,\d{3})*)\s*(?:of|\/|out of)\s*(\d+(?:,\d{3})*)/i.exec(value);
  return m ? { x: Number(m[1].replace(/,/g, '')), y: Number(m[2].replace(/,/g, '')) } : null;
}

function firstQuantity(value: string): { amount: number; unitWord?: string } | null {
  const m = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*([a-z%]+)?/i.exec(value);
  return m ? { amount: Number(m[1].replace(/,/g, '')), unitWord: m[2]?.toLowerCase() } : null;
}

type Outcome = { result: 'pass' | 'fail'; actual: string; numbers: FactNumber[]; missing?: number } | { result: 'not-assessed'; reason: string };

function evaluate(attr: Attribute, cond: Condition): Outcome {
  const v = attr.value.trim();
  const numbers = extractNumbers(v).map((n) => ({ value: Math.abs(n.value), unit: n.unit === 'plain' ? 'number' : n.unit }) as FactNumber);
  switch (cond.kind) {
    case 'present':
    case 'absent': {
      const has = TRUTHY.test(v) || (!FALSY.test(v) && v.length > 0);
      const pass = cond.kind === 'present' ? has : !has;
      return { result: pass ? 'pass' : 'fail', actual: v, numbers };
    }
    case 'all': {
      const fr = fraction(v);
      if (fr) {
        const missing = fr.y - fr.x;
        return { result: missing <= 0 ? 'pass' : 'fail', actual: `${fr.x} of ${fr.y}`, numbers: [...numbers, { value: missing, unit: 'count' }], missing };
      }
      if (/^(all|every|yes)\b/i.test(v)) return { result: 'pass', actual: v, numbers };
      if (FALSY.test(v)) return { result: 'fail', actual: v, numbers };
      return { result: 'not-assessed', reason: `the value “${v}” isn't in a form like “9 of 14”, so coverage can't be checked` };
    }
    case 'includes':
    case 'excludes': {
      const has = v.toLowerCase().includes(cond.text ?? '');
      const pass = cond.kind === 'includes' ? has : !has;
      return { result: pass ? 'pass' : 'fail', actual: v, numbers };
    }
    default: {
      const q = firstQuantity(v);
      if (!q) return { result: 'not-assessed', reason: `the value “${v}” has no number to compare` };
      const actual = toBaseQuantity(q.amount, q.unitWord);
      const limit = toBaseQuantity(cond.amount ?? 0, cond.unitWord ?? q.unitWord);
      if (cond.unitWord && q.unitWord && actual.dimension !== limit.dimension) {
        return { result: 'not-assessed', reason: `“${v}” and “${cond.raw}” use different units` };
      }
      const a = actual.value;
      const l = limit.value;
      const pass =
        cond.kind === 'max' ? a <= l
        : cond.kind === 'min' ? a >= l
        : cond.kind === 'under' ? a < l
        : cond.kind === 'over' ? a > l
        : a === l;
      const extra: FactNumber[] = [{ value: cond.amount ?? 0, unit: numbers[0]?.unit ?? 'number' }];
      if (!pass && q.unitWord === (cond.unitWord ?? q.unitWord)) extra.push({ value: Math.abs(q.amount - (cond.amount ?? 0)), unit: numbers[0]?.unit ?? 'number' });
      return { result: pass ? 'pass' : 'fail', actual: v, numbers: [...numbers, ...extra] };
    }
  }
}

export function researchWebsite(input: WorkflowInput, ctx: StageContext): EvidenceSet {
  const f = new FactBuilder();
  const attrs: Attribute[] = [];
  let subject = 'the described website';
  const unparsed: number[] = [];

  input.primary.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return;
    const m = /^([^:]{2,60}):\s*(.+)$/.exec(t);
    if (!m) {
      unparsed.push(i + 1);
      return;
    }
    const key = m[1].trim();
    const value = m[2].trim();
    if (/^(site|name|website|business)$/i.test(key)) subject = value;
    const fr = fraction(value);
    const numbers: FactNumber[] = extractNumbers(value).map((n) => ({ value: Math.abs(n.value), unit: n.unit === 'plain' ? 'number' : n.unit }));
    if (fr) numbers.push({ value: fr.y - fr.x, unit: 'count' });
    const factId = f.add({
      group: 'Description', label: key, display: value, numbers, source: `Site description, line ${i + 1}`,
      terms: [key, value], meta: { attribute: key, value },
    });
    attrs.push({ key, value, factId, terms: toTerms(key) });
  });

  if (attrs.length === 0) {
    throw new StageError('The site description has no “attribute: value” lines to check, e.g. “Page weight (home): 4.8 MB”.');
  }
  if (unparsed.length) {
    ctx.warn(`Ignored ${unparsed.length} description ${plural(unparsed.length, 'line')} without an “attribute: value” form (line ${unparsed.slice(0, 5).join(', ')}).`);
  }

  const minPriority = directiveValue<Priority>(ctx.parsed, 'min priority', 'low');
  let skippedByPriority = 0;
  let pass = 0;
  let fail = 0;
  let notAssessed = 0;

  input.secondary.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return;
    const parts = t.split('|').map((p) => p.trim());
    const line = i + 1;
    if (parts.length !== 3 || !parts[1]) {
      notAssessed++;
      f.add({
        group: 'Checklist', label: t, display: 'Not assessed: write it as “priority | attribute | condition”',
        numbers: [], source: `Checklist, line ${line}`, check: 'not-assessed', priority: 'medium',
        meta: { attribute: t, reason: 'the line is not in “priority | attribute | condition” form' },
      });
      return;
    }
    const [p, attribute, conditionRaw] = parts;
    const priority: Priority = (['high', 'medium', 'low'] as const).find((x) => x === p.toLowerCase()) ?? 'medium';
    if (priority !== p.toLowerCase()) ctx.warn(`Checklist line ${line}: priority “${p}” isn't high, medium or low, so medium is used.`);
    if (PRIORITY_RANK[priority] < PRIORITY_RANK[minPriority]) {
      skippedByPriority++;
      return;
    }
    const cond = parseCondition(conditionRaw);
    const attr = findAttribute(attrs, attribute);
    const base = { group: 'Checklist', source: `Checklist, line ${line}`, priority, terms: [attribute] };
    if (!cond || !attr) {
      notAssessed++;
      const reason = !cond ? `the condition “${conditionRaw}” isn't one this workflow can test` : `the description doesn't mention “${attribute}”`;
      f.add({ ...base, label: `${attribute}: ${conditionRaw}`, display: `Not assessed: ${reason}`, numbers: [], check: 'not-assessed', meta: { attribute, condition: conditionRaw, reason } });
      return;
    }
    const outcome = evaluate(attr, cond);
    if (outcome.result === 'not-assessed') {
      notAssessed++;
      f.add({ ...base, label: `${attribute}: ${conditionRaw}`, display: `Not assessed: ${outcome.reason}`, numbers: [], check: 'not-assessed', meta: { attribute, condition: conditionRaw, reason: outcome.reason, basis: attr.factId } });
      return;
    }
    if (outcome.result === 'pass') pass++;
    else fail++;
    f.add({
      ...base,
      label: `${attr.key}: ${conditionRaw}`,
      display: `${outcome.result === 'pass' ? 'Pass' : 'Fail'}: ${outcome.actual} (checklist: ${conditionRaw})`,
      numbers: outcome.numbers,
      check: outcome.result,
      polarity: outcome.result === 'pass' ? 'positive' : 'negative',
      meta: {
        attribute: attr.key, condition: conditionRaw, conditionKind: cond.kind, actual: outcome.actual,
        basis: attr.factId, ...(outcome.missing !== undefined ? { missing: outcome.missing } : {}),
        ...(cond.text ? { conditionText: cond.text } : {}), ...(cond.amount !== undefined ? { amount: cond.amount } : {}),
      },
    });
  });

  const assessed = pass + fail;
  if (assessed + notAssessed === 0) throw new StageError('The checklist has no items to check.');
  f.add({
    group: 'Checklist', label: 'Checklist result',
    display: `${pass} passed, ${fail} failed, ${notAssessed} not assessed`,
    numbers: [pass, fail, notAssessed, assessed, assessed + notAssessed].map((value) => ({ value, unit: 'count' as const })),
    source: 'Checklist', terms: ['checklist', 'result'], meta: { stat: 'checklist', pass, fail, notAssessed, assessed },
  });

  const gaps = [
    'Live behaviour: this review uses the supplied description only. No website was visited, crawled or measured.',
    'Visitor behaviour: no analytics were supplied, so the effect of each issue on visitors is unknown.',
  ];
  if (skippedByPriority) gaps.push(`Lower-priority checklist items were skipped because of the “min priority: ${minPriority}” instruction.`);

  return { kind: 'website', subject, facts: f.facts, claims: parseClaims(input.claims), gaps };
}
