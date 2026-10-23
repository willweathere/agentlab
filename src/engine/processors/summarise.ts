import { directiveValue } from '../directives';
import type { Analysis, Review, Statement, Summary } from '../types';
import { PRIORITY_RANK, type StageContext } from './shared';

/**
 * The Summariser keeps the strongest findings and recommendations verbatim, so a later
 * Reviewer can trace every figure in the brief back to the evidence.
 */
export function summarise(analysis: Analysis, reviews: Review[], ctx: StageContext): Summary {
  const points = directiveValue<number>(ctx.parsed, 'points', 3);
  const withNext = directiveValue<boolean>(ctx.parsed, 'next steps', true);

  const rank = (s: Statement) =>
    (s.priority ? PRIORITY_RANK[s.priority] * 100 : 0) + (s.polarity === 'negative' ? 20 : 0) + (s.weight ?? 0);
  const top = [...analysis.observations].sort((a, b) => rank(b) - rank(a)).slice(0, points);
  const next = withNext ? analysis.recommendations.slice(0, 2) : [];

  const last = reviews[reviews.length - 1];
  const headline = !last
    ? 'Not reviewed: this summary was written before any Reviewer checked the analysis.'
    : last.verdict === 'pass'
      ? `Reviewed by ${last.reviewerName}: every check passed.`
      : `Reviewed by ${last.reviewerName}: passed with warnings.`;

  return {
    headline,
    points: top.map((s, i) => ({ id: `S${i + 1}`, kind: 'observation', text: s.text, refs: [s.id], polarity: s.polarity, priority: s.priority })),
    next: next.map((s, i) => ({ id: `N${i + 1}`, kind: 'recommendation', text: s.text, refs: [s.id], priority: s.priority })),
  };
}
