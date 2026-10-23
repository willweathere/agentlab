import { comparisonHolds, extractNumbers, numberMatches } from './numbers';
import { direction, toTerms } from './text';
import type { Claim, ClaimVerdict, Fact } from './types';

/**
 * Claim verification. A claim is supported only when every figure in it matches a fact that
 * is about the same things (same metric, group, period or attribute). Named superlatives
 * ("North was the strongest region") are checked against ranking facts. Anything else is
 * unsupported, and a claim that names the right subject with the wrong figure or direction
 * is contradicted.
 */

const GENERIC = new Set([
  'period', 'change', 'average', 'mean', 'highest', 'lowest', 'largest', 'smallest', 'value', 'missing', 'row',
  'record', 'column', 'share', 'top', 'bottom', 'peak', 'best', 'weakest', 'growth', 'rise', 'fall', 'drop',
  'dip', 'increase', 'result', 'check', 'rule', 'figure', 'claim', 'dataset', 'per', 'gap', 'ratio',
]);

const TOP_WORDS = ['strongest', 'largest', 'biggest', 'best', 'top', 'highest', 'leading', 'most'];
const BOTTOM_WORDS = ['weakest', 'smallest', 'lowest', 'worst', 'bottom', 'least'];

function vocabulary(facts: Fact[]): Set<string> {
  const v = new Set<string>();
  for (const f of facts) for (const t of f.terms) if (!GENERIC.has(t)) v.add(t);
  return v;
}

export function verifyClaims(claims: Claim[], facts: Fact[]): ClaimVerdict[] {
  const vocab = vocabulary(facts);
  return claims.map((c) => verifyClaim(c, facts, vocab));
}

function verifyClaim(claim: Claim, facts: Fact[], vocab: Set<string>): ClaimVerdict {
  const base = { claimId: claim.id, text: claim.text };
  const terms = toTerms(claim.text);
  const entities = terms.filter((t) => vocab.has(t));
  const words = claim.text.toLowerCase().split(/[^a-z]+/);
  const nums = extractNumbers(claim.text);
  const dir = direction(claim.text);

  // Facts about everything the claim names.
  const about = entities.length ? facts.filter((f) => entities.every((e) => f.terms.includes(e))) : [];

  if (nums.length === 0) {
    const rank = words.some((w) => TOP_WORDS.includes(w)) ? 'top' : words.some((w) => BOTTOM_WORDS.includes(w)) ? 'bottom' : null;
    if (rank) {
      const ranked = facts.filter((f) => f.meta?.stat === 'rank' && f.meta?.rank === rank);
      const named = ranked.find((f) => terms.includes(String(f.meta?.category).toLowerCase()) && (entities.every((e) => f.terms.includes(e))));
      if (named) return { ...base, status: 'supported', refs: [named.id], reason: `Matches “${named.label}”: ${named.display}.` };
      const sameColumn = ranked.find((f) => {
        const values = facts.find((x) => x.meta?.column === f.meta?.column && Array.isArray(x.meta?.values))?.meta?.values as string[] | undefined;
        return values?.some((v) => terms.includes(v.toLowerCase()));
      });
      if (sameColumn) return { ...base, status: 'contradicted', refs: [sameColumn.id], reason: `The evidence ranks ${sameColumn.meta?.category} first on this measure (${sameColumn.display}).` };
    }
    return {
      ...base,
      status: 'unsupported',
      refs: [],
      reason: about.length
        ? 'It names things the evidence covers, but contains no figure or ranking the evidence can confirm.'
        : 'It contains no figure, and nothing in the evidence covers it.',
    };
  }

  if (about.length === 0) {
    return { ...base, status: 'unsupported', refs: [], reason: entities.length ? 'No single fact covers everything this claim names.' : 'Nothing in the evidence covers this claim.' };
  }

  const matched: Fact[] = [];
  for (const n of nums) {
    const hit = about.find((f) => f.numbers.some((fn) => (n.comparator ? comparisonHolds(n, fn) : numberMatches(n, fn))));
    if (!hit) {
      const closest = about.find((f) => f.numbers.some((fn) => (n.unit === 'percent') === (fn.unit === 'percent'))) ?? about[0];
      return { ...base, status: 'contradicted', refs: [closest.id], reason: `“${n.raw}” doesn't match the evidence: “${closest.label}” is ${closest.display}.` };
    }
    if (!matched.includes(hit)) matched.push(hit);
  }

  if (dir) {
    const against = matched.find((f) => typeof f.meta?.pct === 'number' && ((dir === 'up' && Number(f.meta.pct) < 0) || (dir === 'down' && Number(f.meta.pct) > 0)));
    if (against) return { ...base, status: 'contradicted', refs: [against.id], reason: `The figure matches, but the direction doesn't: ${against.display}.` };
  }

  return { ...base, status: 'supported', refs: matched.map((f) => f.id), reason: `Matches ${matched.map((f) => `“${f.label}” (${f.display})`).join('; ')}.` };
}
