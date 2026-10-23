import { directiveValue } from '../directives';
import { formatValue } from '../numbers';
import { capitalise, listJoin, plural, sharedTerms, toTerms } from '../text';
import type { Analysis, EvidenceSet, Fact, Priority } from '../types';
import { PRIORITY_RANK, sortRecommendations, StatementBuilder, type StageContext } from './shared';

/**
 * Analyst rules for checklist-style evidence: website reviews and content checks. Failed
 * checks become issues with a hedged "why it may matter" and a concrete fix; passed checks
 * become strengths; anything the evidence couldn't assess is reported as unavailable.
 */

const str = (f: Fact, key: string) => String(f.meta?.[key] ?? '');
const num = (f: Fact, key: string) => Number(f.meta?.[key] ?? 0);
const quote = (items: string[]) => listJoin(items.map((i) => `“${i}”`));

// ---------------------------------------------------------------------------
// Website
// ---------------------------------------------------------------------------

const WEBSITE_WHY: { re: RegExp; why: string }[] = [
  { re: /weight|size|\bmb\b|\bkb\b|load/i, why: 'Pages this heavy may load slowly, especially on mobile connections.' },
  { re: /\balt\b/i, why: 'Screen-reader users may miss what the images show.' },
  { re: /call to action|\bcta\b/i, why: 'Visitors may not know what to do next.' },
  { re: /nav/i, why: 'Visitors may take longer to find the pages they need.' },
  { re: /meta/i, why: 'Search results may show auto-generated snippets for pages without one.' },
  { re: /form|field/i, why: 'Longer forms may reduce the number of people who finish them.' },
  { re: /contact|phone|email/i, why: 'Visitors who prefer another way to get in touch may give up.' },
  { re: /testimonial|review/i, why: 'New visitors may have less reason to trust the business.' },
  { re: /\bh1\b|heading/i, why: 'Screen readers and search engines may misread the page structure.' },
  { re: /https|ssl|secure/i, why: 'Browsers may warn visitors that the site is not secure.' },
  { re: /blog|update|news/i, why: 'Visitors may assume the site is no longer maintained.' },
  { re: /price|pricing|cost/i, why: 'Visitors may leave to ask about cost instead of booking.' },
  { re: /mobile|responsive/i, why: 'Phone visitors may struggle to use the site.' },
  { re: /contrast|colou?r/i, why: 'Some visitors may find the text hard to read.' },
];

function websiteIssue(f: Fact): string {
  const attr = str(f, 'attribute');
  const actual = str(f, 'actual');
  const condition = str(f, 'condition');
  switch (str(f, 'conditionKind')) {
    case 'all': return `${attr}: ${actual}; the checklist asks for all.`;
    case 'includes': return `${attr}: “${actual}”, which does not include ${str(f, 'conditionText')}.`;
    case 'excludes': return `${attr}: “${actual}”, which includes ${str(f, 'conditionText')}.`;
    case 'present': return `${attr}: “${actual}”; the checklist requires it.`;
    case 'absent': return `${attr}: “${actual}”; the checklist requires it to be absent.`;
    default: return `${attr}: ${actual}; the checklist asks for ${condition}.`;
  }
}

function websiteFix(f: Fact): string {
  const attr = str(f, 'attribute');
  const lower = /^[A-Z][A-Z0-9]/.test(attr) ? attr : attr.charAt(0).toLowerCase() + attr.slice(1);
  const actual = str(f, 'actual');
  const condition = str(f, 'condition');
  const missing = num(f, 'missing');
  if (/update|blog|news/i.test(attr) && /max|under/.test(str(f, 'conditionKind'))) {
    return `Publish fresh content: ${lower} is ${actual}, and the checklist asks for ${condition}.`;
  }
  switch (str(f, 'conditionKind')) {
    case 'all':
      if (/\balt\b/i.test(attr)) return `Add alt text to the ${missing} ${plural(missing, 'image')} that lack it.`;
      if (/meta/i.test(attr)) return `Write meta descriptions for the ${missing} ${plural(missing, 'page')} without one.`;
      return `Cover the remaining ${missing}: ${lower} is ${actual}.`;
    case 'max':
    case 'under': return `Reduce ${lower} from ${actual} to ${condition}.`;
    case 'min':
    case 'over': return `Increase ${lower} from ${actual} to ${condition}.`;
    case 'exactly': return `Change ${lower} from ${actual} to exactly ${num(f, 'amount')}.`;
    case 'includes': return `Add ${str(f, 'conditionText')} to ${lower}.`;
    case 'excludes': return `Remove ${str(f, 'conditionText')} from ${lower}.`;
    case 'present': return `Add ${lower} to the site.`;
    default: return `Remove ${lower}.`;
  }
}

export function analyseWebsite(ev: EvidenceSet, ctx: StageContext): Analysis {
  const maxRecs = directiveValue<number>(ctx.parsed, 'max recommendations', 6);
  const withInterpretations = directiveValue<boolean>(ctx.parsed, 'interpretations', true);
  const sb = new StatementBuilder();
  const checks = ev.facts.filter((f) => f.check);
  const summary = ev.facts.find((f) => f.meta?.stat === 'checklist');

  if (summary) {
    const assessed = num(summary, 'assessed');
    sb.add(
      'observation',
      assessed
        ? `${num(summary, 'pass')} of ${assessed} assessed checklist items passed and ${num(summary, 'fail')} failed.`
        : 'None of the checklist items could be assessed from the description.',
      [summary.id],
      { group: 'Overview', polarity: 'neutral', weight: 100 },
    );
  }

  const fails = checks
    .filter((f) => f.check === 'fail')
    .sort((a, b) => PRIORITY_RANK[b.priority ?? 'low'] - PRIORITY_RANK[a.priority ?? 'low']);
  for (const f of fails) {
    const priority = f.priority ?? 'medium';
    const o = sb.add('observation', websiteIssue(f), [f.id], { group: 'Issues', polarity: 'negative', priority, weight: PRIORITY_RANK[priority] * 10 });
    let i = '';
    if (withInterpretations) {
      const attr = str(f, 'attribute');
      const why = WEBSITE_WHY.find((w) => w.re.test(attr))?.why ?? 'This may affect how visitors use the site; the description does not show by how much.';
      i = sb.add('interpretation', why, [o]);
    }
    sb.add('recommendation', websiteFix(f), [o, i].filter(Boolean), { priority, weight: PRIORITY_RANK[priority] * 10 });
  }

  const passes = checks.filter((f) => f.check === 'pass');
  if (passes.length) {
    sb.add('observation', `Passing checks: ${listJoin(passes.map((f) => str(f, 'attribute')))}.`, passes.map((f) => f.id), {
      group: 'Passing checks', polarity: 'positive', weight: 20,
    });
  }

  for (const f of checks.filter((x) => x.check === 'not-assessed')) {
    sb.add('unavailable', `${capitalise(str(f, 'attribute'))}: not assessed, because ${str(f, 'reason')}.`, [], { priority: f.priority });
  }
  for (const gap of ev.gaps) sb.add('unavailable', gap, []);

  return finish(sb, ev, maxRecs);
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const CONTENT_PRIORITY: Record<string, Priority> = {
  figure: 'high', 'include-cta': 'high', 'max-chars': 'high', avoid: 'medium', hashtags: 'medium', 'max-sentence': 'medium',
  'max-words': 'medium', 'include-link': 'medium', 'include-question': 'low', 'include-text': 'medium',
  'max-exclamations': 'low', 'no-caps': 'low', 'max-emoji': 'low', 'max-long-words': 'low',
};

const CONTENT_WHY: Record<string, string> = {
  figure: 'An unverified figure may damage trust if a reader challenges it.',
  'include-cta': 'Readers may not know what to do next.',
  'max-chars': 'The post may be cut off in feeds that truncate long text.',
  'max-words': 'A long post may lose readers before they reach the point.',
  avoid: 'These words may read as hype and weaken trust.',
  hashtags: 'The hashtag count may make the post look spammy or hard to discover.',
  'max-sentence': 'Long sentences may be harder to read on a phone.',
  'max-exclamations': 'Several exclamation marks may come across as pushy.',
  'no-caps': 'All-caps words may read as shouting.',
  'max-emoji': 'Heavy emoji use may distract from the message.',
  'max-long-words': 'The post may feel dense to skim.',
  'include-link': 'Interested readers may not find where to go next.',
  'include-question': 'The post may get fewer replies without a prompt.',
  'include-text': 'The post may miss a message the brand wanted to include.',
};

function contentStrength(f: Fact): string {
  const v = num(f, 'value');
  const limit = num(f, 'limit');
  switch (str(f, 'rule')) {
    case 'max-chars': return `The post is ${v} characters, within the ${limit}-character limit.`;
    case 'max-words': return `The post is ${v} words, within the ${limit}-word limit.`;
    case 'hashtags': return `It uses ${v} ${plural(v, 'hashtag')}, within the allowed range.`;
    case 'include-cta': return `It includes a call to action (${quote((f.meta?.items as string[]) ?? [])}).`;
    case 'include-link': return 'It includes a link.';
    case 'include-question': return 'It asks the reader a question.';
    case 'include-text': return `It includes “${str(f, 'text')}”.`;
    case 'avoid': return 'It avoids every word on the avoid list.';
    case 'max-sentence': return `Its longest sentence is ${v} words, within the ${limit}-word limit.`;
    case 'max-exclamations': return `It uses ${v} exclamation ${plural(v, 'mark')}, within the limit.`;
    case 'no-caps': return 'It has no all-caps words.';
    case 'max-emoji': return v ? `It uses ${v} emoji, within the limit of ${limit}.` : `It uses no emoji (the limit is ${limit}).`;
    case 'max-long-words': return `Long words make up ${formatValue(v, 'percent')} of the text, within the limit.`;
    case 'figure': return `The figure “${str(f, 'figure')}” matches a verified note.`;
    default: return `${f.label} passed.`;
  }
}

function contentIssue(f: Fact): string {
  const v = num(f, 'value');
  const limit = num(f, 'limit');
  switch (str(f, 'rule')) {
    case 'max-chars': return `The post is ${v} characters, ${num(f, 'over')} over the ${limit}-character limit.`;
    case 'max-words': return `The post is ${v} words, ${num(f, 'over')} over the ${limit}-word limit.`;
    case 'hashtags':
      return v > num(f, 'max') && num(f, 'max') >= 0
        ? `It uses ${v} hashtags; the rule allows at most ${num(f, 'max')}.`
        : `It uses ${v} ${plural(v, 'hashtag')}; the rule asks for at least ${num(f, 'min')}.`;
    case 'include-cta': return 'It has no clear call to action.';
    case 'include-link': return 'It has no link.';
    case 'include-question': return 'It does not ask the reader anything.';
    case 'include-text': return `It does not include “${str(f, 'text')}”.`;
    case 'avoid': return `It uses ${v} ${plural(v, 'word')} from the avoid list: ${quote((f.meta?.items as string[]) ?? [])}.`;
    case 'max-sentence': return `Sentence ${num(f, 'index')} is ${v} words long, over the ${limit}-word limit.`;
    case 'max-exclamations': return `It uses ${v} exclamation ${plural(v, 'mark')}; the limit is ${limit}.`;
    case 'no-caps': return `It has ${v} all-caps ${plural(v, 'word')}: ${quote((f.meta?.items as string[]) ?? [])}.`;
    case 'max-emoji': return `It uses ${v} emoji; the limit is ${limit}.`;
    case 'max-long-words': return `Long words make up ${formatValue(v, 'percent')} of the text, above the ${limit}% limit.`;
    case 'figure': return `The figure “${str(f, 'figure')}” does not match any verified note.`;
    default: return `${f.label} failed.`;
  }
}

function contentFix(f: Fact): string {
  const limit = num(f, 'limit');
  switch (str(f, 'rule')) {
    case 'max-chars': return `Cut at least ${num(f, 'over')} characters to get within ${limit}.`;
    case 'max-words': return `Cut at least ${num(f, 'over')} words to get within ${limit}.`;
    case 'hashtags': {
      const d = num(f, 'delta');
      return num(f, 'value') > num(f, 'max') && num(f, 'max') >= 0
        ? `Remove ${d} ${plural(d, 'hashtag')} to stay within ${num(f, 'max')}.`
        : `Add ${d} relevant ${plural(d, 'hashtag')}.`;
    }
    case 'include-cta': return 'Add one clear call to action, such as a booking or sign-up prompt.';
    case 'include-link': return 'Add a link to the page you want readers to visit.';
    case 'include-question': return 'End with a question that invites replies.';
    case 'include-text': return `Work “${str(f, 'text')}” into the post.`;
    case 'avoid': return `Replace ${quote((f.meta?.items as string[]) ?? [])} with plain, specific wording.`;
    case 'max-sentence': return `Split sentence ${num(f, 'index')} into shorter sentences.`;
    case 'max-exclamations': return `Use at most ${limit} exclamation ${plural(limit, 'mark')}.`;
    case 'no-caps': return `Write ${quote((f.meta?.items as string[]) ?? [])} in normal case.`;
    case 'max-emoji': return `Cut the emoji to ${limit} or fewer.`;
    case 'max-long-words': return 'Swap some long words for shorter, everyday ones.';
    case 'figure': {
      const figure = str(f, 'figure');
      const notes = (f.meta?.notes as string[]) ?? [];
      const note = notes.find((n) => sharedTerms(toTerms(n), toTerms(figure)).length > 0);
      return note
        ? `Replace “${figure}” with the verified figure (“${note}”), or remove it.`
        : `Remove “${figure}”, or add a verified note that supports it.`;
    }
    default: return `Fix: ${f.label}.`;
  }
}

export function analyseContent(ev: EvidenceSet, ctx: StageContext): Analysis {
  const maxRecs = directiveValue<number>(ctx.parsed, 'max recommendations', 6);
  const withInterpretations = directiveValue<boolean>(ctx.parsed, 'interpretations', true);
  const sb = new StatementBuilder();
  const checks = ev.facts.filter((f) => f.check);
  const summary = ev.facts.find((f) => f.meta?.stat === 'checklist');
  if (summary) {
    sb.add('observation', `${num(summary, 'pass')} of ${num(summary, 'assessed')} checks passed and ${num(summary, 'fail')} failed.`, [summary.id], {
      group: 'Overview', polarity: 'neutral', weight: 100,
    });
  }

  for (const f of checks.filter((x) => x.check === 'pass')) {
    sb.add('observation', contentStrength(f), [f.id], { group: 'Strengths', polarity: 'positive', weight: 10 });
  }
  const fails = checks
    .filter((x) => x.check === 'fail')
    .map((f) => ({ f, priority: CONTENT_PRIORITY[str(f, 'rule')] ?? 'medium' }))
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
  for (const { f, priority } of fails) {
    const o = sb.add('observation', contentIssue(f), [f.id], { group: 'Issues', polarity: 'negative', priority, weight: PRIORITY_RANK[priority] * 10 });
    let i = '';
    if (withInterpretations) i = sb.add('interpretation', CONTENT_WHY[str(f, 'rule')] ?? 'This may weaken the post.', [o]);
    sb.add('recommendation', contentFix(f), [o, i].filter(Boolean), { priority, weight: PRIORITY_RANK[priority] * 10 });
  }

  for (const f of checks.filter((x) => x.check === 'not-assessed')) {
    sb.add('unavailable', `Rule “${str(f, 'rule')}”: not assessed, because it is ${str(f, 'reason')}.`, []);
  }
  for (const gap of ev.gaps) sb.add('unavailable', gap, []);

  return finish(sb, ev, maxRecs);
}

function finish(sb: StatementBuilder, ev: EvidenceSet, maxRecs: number): Analysis {
  const all = sb.of('recommendation');
  return {
    kind: ev.kind,
    subject: ev.subject,
    observations: sb.of('observation'),
    interpretations: sb.of('interpretation'),
    recommendations: sortRecommendations(all).slice(0, maxRecs),
    unavailable: sb.of('unavailable'),
    claims: ev.claims,
  };
}
