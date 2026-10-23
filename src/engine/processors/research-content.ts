import { directiveValue } from '../directives';
import { extractNumbers, formatValue, numberMatches } from '../numbers';
import { plural } from '../text';
import type { EvidenceSet, FactNumber, WorkflowInput } from '../types';
import { FactBuilder, parseClaims, StageError, type StageContext } from './shared';

/**
 * Researcher for a social post plus editorial rules. It measures the text, tests each rule,
 * and checks every figure in the post against the "verified:" notes supplied with the rules.
 */

const CTA_PHRASES = [
  'book', 'sign up', 'join', 'register', 'try', 'download', 'shop', 'buy', 'order', 'subscribe', 'follow',
  'learn more', 'read more', 'find out', 'get started', 'reserve', 'visit', 'apply', 'reply', 'comment',
  'share', 'message us', 'dm us', 'call us', 'email us', 'claim', 'grab',
];

function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w) && !w.startsWith('#') && !w.startsWith('@') && !/^https?:\/\//.test(w));
}

function sentences(text: string): string[] {
  return text
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0);
}

function count(re: RegExp, text: string): string[] {
  return Array.from(text.matchAll(re), (m) => m[0]);
}

type RuleSpec =
  | { kind: 'max-chars'; n: number }
  | { kind: 'max-words'; n: number }
  | { kind: 'hashtags'; min: number; max: number }
  | { kind: 'include-cta' }
  | { kind: 'include-link' }
  | { kind: 'include-question' }
  | { kind: 'include-text'; text: string }
  | { kind: 'avoid'; words: string[] }
  | { kind: 'max-sentence'; n: number }
  | { kind: 'max-exclamations'; n: number }
  | { kind: 'no-caps' }
  | { kind: 'max-emoji'; n: number }
  | { kind: 'max-long-words'; pct: number }
  | { kind: 'verified'; text: string };

export function parseRule(line: string): RuleSpec | null {
  const t = line.trim().toLowerCase().replace(/\s+/g, ' ');
  let m: RegExpExecArray | null;
  if ((m = /^(?:max(?:imum)? )?(?:length|characters)(?: limit)?: ?(\d+)(?: characters| chars)?$/.exec(t)))
    return { kind: 'max-chars', n: Number(m[1]) };
  if ((m = /^max(?:imum)? words: ?(\d+)$/.exec(t))) return { kind: 'max-words', n: Number(m[1]) };
  if ((m = /^hashtags: ?(\d+) ?(?:to|-|–) ?(\d+)$/.exec(t))) return { kind: 'hashtags', min: Number(m[1]), max: Number(m[2]) };
  if ((m = /^max(?:imum)? hashtags: ?(\d+)$/.exec(t))) return { kind: 'hashtags', min: 0, max: Number(m[1]) };
  if ((m = /^min(?:imum)? hashtags: ?(\d+)$/.exec(t))) return { kind: 'hashtags', min: Number(m[1]), max: Infinity };
  if ((m = /^must include: ?(.+)$/.exec(t))) {
    const what = m[1].trim();
    if (/^(a )?(call to action|cta)$/.test(what)) return { kind: 'include-cta' };
    if (/^(a )?link$/.test(what)) return { kind: 'include-link' };
    if (/^(a )?question$/.test(what)) return { kind: 'include-question' };
    const original = line.trim().slice(line.trim().indexOf(':') + 1).trim();
    return { kind: 'include-text', text: original.replace(/^["“]|["”]$/g, '') };
  }
  if ((m = /^(?:avoid|banned words|do not use): ?(.+)$/.exec(t)))
    return { kind: 'avoid', words: m[1].split(',').map((w) => w.trim()).filter(Boolean) };
  if ((m = /^max(?:imum)? sentence length: ?(\d+)(?: words)?$/.exec(t))) return { kind: 'max-sentence', n: Number(m[1]) };
  if ((m = /^max(?:imum)? exclamation marks?: ?(\d+)$/.exec(t))) return { kind: 'max-exclamations', n: Number(m[1]) };
  if (/^(no all caps|all caps: ?(none|no|off))$/.test(t)) return { kind: 'no-caps' };
  if ((m = /^max(?:imum)? emoji: ?(\d+)$/.exec(t))) return { kind: 'max-emoji', n: Number(m[1]) };
  if ((m = /^max(?:imum)? long words: ?(\d+(?:\.\d+)?)%?$/.exec(t))) return { kind: 'max-long-words', pct: Number(m[1]) };
  if (/^verified: ?\S/.test(t)) return { kind: 'verified', text: line.trim().slice(line.trim().indexOf(':') + 1).trim() };
  return null;
}

export function researchContent(input: WorkflowInput, ctx: StageContext): EvidenceSet {
  const post = input.primary.trim();
  if (!post) throw new StageError('The post is empty.');
  const f = new FactBuilder();
  const longLen = directiveValue<number>(ctx.parsed, 'long word length', 9);

  // --- Measurements ---------------------------------------------------------
  const chars = [...post].length;
  const w = words(post);
  const s = sentences(post);
  const sentenceLengths = s.map((x) => words(x).length);
  const longestIdx = sentenceLengths.indexOf(Math.max(...sentenceLengths));
  const avgSentence = sentenceLengths.reduce((a, b) => a + b, 0) / Math.max(sentenceLengths.length, 1);
  const hashtags = count(/(^|\s)#[\p{L}\p{N}_]+/gu, post).map((h) => h.trim());
  const mentions = count(/(^|\s)@[\p{L}\p{N}_]+/gu, post).map((h) => h.trim());
  const links = count(/https?:\/\/\S+|www\.\S+/g, post);
  const emoji = count(/\p{Extended_Pictographic}/gu, post);
  const exclamations = count(/!/g, post);
  const caps = Array.from(new Set(w.map((x) => x.replace(/[^\p{L}-]/gu, '')).filter((x) => x.length >= 3 && x === x.toUpperCase() && /\p{Lu}/u.test(x))));
  const longWords = w.filter((x) => x.replace(/[^\p{L}]/gu, '').length >= longLen);
  const longShare = w.length ? (longWords.length / w.length) * 100 : 0;
  const lower = post.toLowerCase();
  const ctas = CTA_PHRASES.filter((p) => new RegExp(`(^|[^\\p{L}])${p.replace(/ /g, '\\s+')}([^\\p{L}]|$)`, 'iu').test(lower));

  const metric = (label: string, display: string, numbers: FactNumber[], terms: string[], meta: Record<string, string | number | boolean | string[]>) =>
    f.add({ group: 'Measurements', label, display, numbers, source: 'Post text', terms, meta });
  metric('Length', `${chars} characters`, [{ value: chars, unit: 'count' }], ['length', 'characters'], { stat: 'chars', value: chars });
  metric('Words', `${w.length} words`, [{ value: w.length, unit: 'count' }], ['words'], { stat: 'words', value: w.length });
  metric('Sentences', `${s.length}; average ${formatValue(avgSentence, 'number')} words`, [{ value: s.length, unit: 'count' }, { value: avgSentence, unit: 'number' }], ['sentences'], { stat: 'sentences', value: s.length });
  metric('Hashtags', hashtags.length ? `${hashtags.length}: ${hashtags.join(' ')}` : 'None', [{ value: hashtags.length, unit: 'count' }], ['hashtags'], { stat: 'hashtags', value: hashtags.length, items: hashtags });
  metric('Links and mentions', `${links.length} ${plural(links.length, 'link')}, ${mentions.length} ${plural(mentions.length, 'mention')}`, [{ value: links.length, unit: 'count' }, { value: mentions.length, unit: 'count' }], ['links', 'mentions'], { stat: 'links', value: links.length });
  metric('Calls to action found', ctas.length ? ctas.map((c) => `“${c}”`).join(', ') : 'None', [], ['call to action', 'cta'], { stat: 'cta', items: ctas });

  // --- Rules ----------------------------------------------------------------
  const verified: { text: string; numbers: FactNumber[] }[] = [];
  const unrecognised: string[] = [];
  let pass = 0;
  let fail = 0;
  let notAssessed = 0;

  const rule = (line: number, raw: string, ok: boolean, display: string, numbers: FactNumber[], meta: Record<string, string | number | boolean | string[]>) => {
    if (ok) pass++;
    else fail++;
    f.add({
      group: 'Editorial rules', label: `Rule: ${raw}`, display: `${ok ? 'Pass' : 'Fail'}: ${display}`, numbers,
      source: `Editorial rules, line ${line}`, terms: [raw], check: ok ? 'pass' : 'fail', polarity: ok ? 'positive' : 'negative',
      meta,
    });
  };

  const ruleLines = input.secondary.split(/\r?\n/).map((t, i) => ({ t: t.trim(), line: i + 1 })).filter((x) => x.t);
  // Verified notes first, so figure checks can use them.
  for (const { t } of ruleLines) {
    const spec = parseRule(t);
    if (spec?.kind === 'verified') {
      verified.push({ text: spec.text, numbers: extractNumbers(spec.text).map((n) => ({ value: Math.abs(n.value), unit: n.unit === 'plain' ? 'number' : n.unit })) });
    }
  }

  for (const { t, line } of ruleLines) {
    const spec = parseRule(t);
    if (!spec) {
      unrecognised.push(t);
      notAssessed++;
      f.add({ group: 'Editorial rules', label: `Rule: ${t}`, display: 'Not assessed: this rule is not one the workflow can check', numbers: [], source: `Editorial rules, line ${line}`, check: 'not-assessed', meta: { rule: t, reason: 'not a rule this workflow can check' } });
      continue;
    }
    const n = (value: number): FactNumber => ({ value, unit: 'count' });
    switch (spec.kind) {
      case 'verified':
        break;
      case 'max-chars':
        rule(line, t, chars <= spec.n, `${chars} of ${spec.n} characters`, [n(chars), n(spec.n), n(Math.abs(chars - spec.n))], { rule: spec.kind, value: chars, limit: spec.n, over: chars - spec.n });
        break;
      case 'max-words':
        rule(line, t, w.length <= spec.n, `${w.length} of ${spec.n} words`, [n(w.length), n(spec.n), n(Math.abs(w.length - spec.n))], { rule: spec.kind, value: w.length, limit: spec.n, over: w.length - spec.n });
        break;
      case 'hashtags': {
        const ok = hashtags.length >= spec.min && hashtags.length <= spec.max;
        const range = spec.max === Infinity ? `at least ${spec.min}` : `${spec.min} to ${spec.max}`;
        const delta = hashtags.length > spec.max ? hashtags.length - spec.max : spec.min - hashtags.length;
        rule(line, t, ok, `${hashtags.length} ${plural(hashtags.length, 'hashtag')} (allowed: ${range})`, [n(hashtags.length), n(spec.min), ...(spec.max === Infinity ? [] : [n(spec.max)]), n(Math.max(delta, 0))], { rule: spec.kind, value: hashtags.length, min: spec.min, max: spec.max === Infinity ? -1 : spec.max, delta: Math.max(delta, 0) });
        break;
      }
      case 'include-cta':
        rule(line, t, ctas.length > 0, ctas.length ? `found ${ctas.map((c) => `“${c}”`).join(', ')}` : 'no call-to-action phrase found', [], { rule: spec.kind, items: ctas });
        break;
      case 'include-link':
        rule(line, t, links.length > 0, links.length ? `${links.length} ${plural(links.length, 'link')}` : 'no link found', [n(links.length)], { rule: spec.kind, value: links.length });
        break;
      case 'include-question':
        rule(line, t, post.includes('?'), post.includes('?') ? 'the post asks a question' : 'no question mark found', [], { rule: spec.kind });
        break;
      case 'include-text': {
        const ok = lower.includes(spec.text);
        rule(line, t, ok, ok ? `“${spec.text}” is present` : `“${spec.text}” is missing`, [], { rule: spec.kind, text: spec.text });
        break;
      }
      case 'avoid': {
        const found = spec.words.filter((x) => new RegExp(`(^|[^\\p{L}])${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-\s]+/g, '[-\\s]?')}([^\\p{L}]|$)`, 'iu').test(post));
        rule(line, t, found.length === 0, found.length ? `uses ${found.map((x) => `“${x}”`).join(', ')}` : 'none used', [n(found.length)], { rule: spec.kind, items: found, value: found.length });
        break;
      }
      case 'max-sentence': {
        const longest = sentenceLengths[longestIdx] ?? 0;
        rule(line, t, longest <= spec.n, `longest is sentence ${longestIdx + 1} with ${longest} words (limit ${spec.n})`, [n(longest), n(spec.n), n(longestIdx + 1), n(Math.abs(longest - spec.n))], { rule: spec.kind, value: longest, limit: spec.n, index: longestIdx + 1, preview: s[longestIdx]?.split(/\s+/).slice(0, 8).join(' ') ?? '' });
        break;
      }
      case 'max-exclamations':
        rule(line, t, exclamations.length <= spec.n, `${exclamations.length} used (limit ${spec.n})`, [n(exclamations.length), n(spec.n)], { rule: spec.kind, value: exclamations.length, limit: spec.n });
        break;
      case 'no-caps':
        rule(line, t, caps.length === 0, caps.length ? `${caps.map((c) => `“${c}”`).join(', ')}` : 'none found', [n(caps.length)], { rule: spec.kind, items: caps, value: caps.length });
        break;
      case 'max-emoji':
        rule(line, t, emoji.length <= spec.n, `${emoji.length} used (limit ${spec.n})`, [n(emoji.length), n(spec.n)], { rule: spec.kind, value: emoji.length, limit: spec.n });
        break;
      case 'max-long-words':
        rule(line, t, longShare <= spec.pct, `${formatValue(longShare, 'percent')} of words have ${longLen}+ letters (limit ${spec.pct}%)`, [{ value: longShare, unit: 'percent' }, { value: spec.pct, unit: 'percent' }, n(longLen)], { rule: spec.kind, value: longShare, limit: spec.pct });
        break;
    }
  }

  // --- Figures in the post --------------------------------------------------
  for (const fig of extractNumbers(post)) {
    const next = /^\s*([\p{L}'’-]+)?\s*([\p{L}'’-]+)?/u.exec(post.slice(fig.index + fig.raw.length));
    const phrase = [fig.raw, next?.[1], next?.[2]].filter(Boolean).join(' ');
    const match = verified.find((v) => v.numbers.some((vn) => numberMatches(fig, vn)));
    const ok = Boolean(match);
    if (ok) pass++;
    else fail++;
    f.add({
      group: 'Figures', label: `Figure “${phrase}”`,
      display: ok ? `Matches verified note “${match!.text}”` : verified.length ? `Not in the verified notes (${verified.map((v) => `“${v.text}”`).join(', ')})` : 'No verified notes were supplied',
      numbers: [{ value: Math.abs(fig.value), unit: fig.unit === 'plain' ? 'number' : fig.unit }, ...verified.flatMap((v) => v.numbers)],
      source: 'Post text and verified notes', terms: [phrase, 'figure', 'claim'], check: ok ? 'pass' : 'fail', polarity: ok ? 'positive' : 'negative',
      meta: { rule: 'figure', figure: phrase, note: match?.text ?? (verified[0]?.text ?? ''), notes: verified.map((v) => v.text) },
    });
  }

  if (ruleLines.length === 0) throw new StageError('There are no editorial rules to check the post against.');
  if (unrecognised.length) ctx.warn(`${unrecognised.length} editorial ${plural(unrecognised.length, 'rule')} could not be checked: ${unrecognised.map((u) => `“${u}”`).join(', ')}.`);

  f.add({
    group: 'Editorial rules', label: 'Rule result', display: `${pass} passed, ${fail} failed, ${notAssessed} not assessed`,
    numbers: [pass, fail, notAssessed, pass + fail].map((value) => ({ value, unit: 'count' as const })),
    source: 'Editorial rules and figures', terms: ['rules', 'result'], meta: { stat: 'checklist', pass, fail, notAssessed, assessed: pass + fail },
  });

  const gaps = [
    'Audience response: no engagement data was supplied, so likely performance is unknown.',
    'Accuracy beyond the verified notes: statements without figures were not fact-checked.',
    'Images, video and links: only the text was checked.',
  ];
  return { kind: 'content', subject: `“${post.split(/\s+/).slice(0, 8).join(' ')}…”`, facts: f.facts, claims: parseClaims(input.claims), gaps };
}
