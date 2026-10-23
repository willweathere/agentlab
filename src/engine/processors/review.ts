import { verifyClaims } from '../claims';
import { directiveValue } from '../directives';
import { extractNumbers, numberMatches } from '../numbers';
import { hasHedge, plural } from '../text';
import type { Analysis, CheckStatus, EvidenceSet, Fact, Review, ReviewCheck, Statement, Summary } from '../types';
import { StageError, type StageContext } from './shared';

/**
 * The Reviewer. It doesn't trust the Analyst: it re-reads the written statements and checks
 * them against the evidence with explicit rules. Any failed check fails the review, and the
 * engine then stops the run at this stage.
 */

const SECTION_OF: Record<string, keyof Pick<Analysis, 'observations' | 'interpretations' | 'recommendations' | 'unavailable'>> = {
  observations: 'observations',
  interpretations: 'interpretations',
  recommendations: 'recommendations',
  limitations: 'unavailable',
};

export function review(analysis: Analysis, evidence: EvidenceSet, summary: Summary | undefined, ctx: StageContext): Review {
  if (!analysis || !evidence) throw new StageError('The Reviewer needs an analysis and the evidence behind it.');

  const required = directiveValue<string[]>(ctx.parsed, 'require', ['observations', 'recommendations', 'limitations']);
  const claimMode = directiveValue<string>(ctx.parsed, 'unsupported claims', 'fail');
  const maxMissing = directiveValue<number>(ctx.parsed, 'max missing', 10);
  const unassessedMode = directiveValue<string>(ctx.parsed, 'unassessed', 'warn');
  const strict = directiveValue<boolean>(ctx.parsed, 'strict', false);

  const facts = new Map(evidence.facts.map((f) => [f.id, f]));
  const statements = new Map<string, Statement>();
  for (const s of [...analysis.observations, ...analysis.interpretations, ...analysis.recommendations, ...analysis.unavailable]) {
    statements.set(s.id, s);
  }

  /** Every fact a statement rests on, following references through other statements. */
  const factsBehind = (refs: string[], seen = new Set<string>()): Fact[] => {
    const out: Fact[] = [];
    for (const r of refs) {
      if (seen.has(r)) continue;
      seen.add(r);
      const fact = facts.get(r);
      if (fact) out.push(fact);
      const st = statements.get(r);
      if (st) out.push(...factsBehind(st.refs, seen));
    }
    return out;
  };

  const checks: ReviewCheck[] = [];

  // 1. Numbers supported by the data --------------------------------------------
  {
    const findings: ReviewCheck['findings'] = [];
    const written: { s: Statement; label: string }[] = [
      ...analysis.observations, ...analysis.interpretations, ...analysis.recommendations, ...analysis.unavailable,
    ].map((s) => ({ s, label: s.id }));
    if (summary) for (const s of [...summary.points, ...summary.next]) written.push({ s, label: `${s.id} (summary)` });
    let figures = 0;
    for (const { s, label } of written) {
      const behind = factsBehind(s.refs);
      for (const n of extractNumbers(s.text)) {
        figures++;
        if (!behind.some((f) => f.numbers.some((fn) => numberMatches(n, fn)))) {
          findings.push({ ref: s.id, message: `${label}: “${n.raw}” isn't in the evidence it cites${s.refs.length ? ` (${s.refs.join(', ')})` : ' (it cites nothing)'}.` });
        }
      }
    }
    checks.push({
      id: 'numbers', label: 'Figures match the evidence',
      status: findings.length ? 'fail' : 'pass',
      detail: findings.length
        ? `${findings.length} of ${figures} ${plural(figures, 'figure')} could not be traced to the facts they cite.`
        : `All ${figures} ${plural(figures, 'figure')} in the written statements trace back to cited facts.`,
      findings,
    });
  }

  // 2. Required sections present -----------------------------------------------
  {
    const missing = required.filter((r) => SECTION_OF[r] && analysis[SECTION_OF[r]].length === 0);
    checks.push({
      id: 'sections', label: 'Required sections are present',
      status: missing.length ? 'fail' : 'pass',
      detail: missing.length ? `Missing: ${missing.join(', ')}.` : `Present: ${required.join(', ')}.`,
      findings: missing.map((m) => ({ message: `The analysis has no ${m}.` })),
    });
  }

  // 3. Observations separated from assumptions ----------------------------------
  {
    const findings: ReviewCheck['findings'] = [];
    for (const o of analysis.observations) {
      if (!o.refs.some((r) => facts.has(r))) findings.push({ ref: o.id, message: `${o.id} is presented as an observation but cites no evidence.` });
      if (hasHedge(o.text)) findings.push({ ref: o.id, message: `${o.id} uses hedged language, so it belongs with the interpretations.` });
    }
    for (const i of analysis.interpretations) {
      if (!hasHedge(i.text)) findings.push({ ref: i.id, message: `${i.id} is an interpretation stated as fact; it should be hedged.` });
      if (!i.refs.some((r) => statements.get(r)?.kind === 'observation')) findings.push({ ref: i.id, message: `${i.id} doesn't say which observation it interprets.` });
    }
    const claimTexts = new Set(analysis.claims.map((c) => c.text.toLowerCase()));
    for (const o of analysis.observations) {
      if (claimTexts.has(o.text.toLowerCase())) findings.push({ ref: o.id, message: `${o.id} repeats a claim from the input as if it were an observation.` });
    }
    checks.push({
      id: 'separation', label: 'Observations are kept apart from assumptions',
      status: findings.length ? 'fail' : 'pass',
      detail: findings.length
        ? `${findings.length} ${plural(findings.length, 'statement')} mix evidence and assumption.`
        : `${analysis.observations.length} observations cite evidence; ${analysis.interpretations.length} interpretations are hedged and linked.`,
      findings,
    });
  }

  // 4. Recommendations linked to findings ---------------------------------------
  {
    const findings: ReviewCheck['findings'] = [];
    for (const r of analysis.recommendations) {
      const links = r.refs.filter((x) => ['observation', 'interpretation'].includes(statements.get(x)?.kind ?? ''));
      const broken = r.refs.filter((x) => !statements.has(x) && !facts.has(x));
      if (links.length === 0) findings.push({ ref: r.id, message: `${r.id} isn't linked to any observation or interpretation.` });
      if (broken.length) findings.push({ ref: r.id, message: `${r.id} links to ${broken.join(', ')}, which ${broken.length === 1 ? "doesn't" : "don't"} exist.` });
    }
    checks.push({
      id: 'links', label: 'Recommendations are linked to findings',
      status: findings.length ? 'fail' : 'pass',
      detail: findings.length
        ? `${findings.length} ${plural(findings.length, 'problem')} with recommendation links.`
        : analysis.recommendations.length
          ? `Each of the ${analysis.recommendations.length} recommendations links to a finding.`
          : 'There are no recommendations to link.',
      findings,
    });
  }

  // 5. Claims verified -----------------------------------------------------------
  const claimVerdicts = verifyClaims(analysis.claims, evidence.facts);
  {
    const bad = claimVerdicts.filter((c) => c.status !== 'supported');
    checks.push({
      id: 'claims', label: 'Unsupported claims are flagged',
      status: bad.length ? (claimMode === 'warn' ? 'warn' : 'fail') : 'pass',
      detail: claimVerdicts.length === 0
        ? 'No claims were supplied with the input.'
        : bad.length
          ? `${bad.length} of ${claimVerdicts.length} ${plural(claimVerdicts.length, 'claim')} ${bad.length === 1 ? 'is' : 'are'} not supported by the evidence.`
          : `All ${claimVerdicts.length} ${plural(claimVerdicts.length, 'claim')} are supported by the evidence.`,
      findings: bad.map((c) => ({ ref: c.claimId, message: `${c.claimId} “${c.text}” is ${c.status}: ${c.reason}` })),
    });
  }

  // 6. Data quality (datasets) ---------------------------------------------------
  if (evidence.kind === 'dataset') {
    const missing = evidence.facts.find((f) => f.meta?.stat === 'missing');
    const share = missing ? Number(missing.meta?.share ?? 0) : 0;
    checks.push({
      id: 'data-quality', label: 'Missing data is within limits',
      status: share > maxMissing ? 'warn' : 'pass',
      detail: missing ? `${missing.display} missing; the limit is ${maxMissing}%.` : 'No data-quality facts were produced.',
      findings: share > maxMissing && missing ? [{ ref: missing.id, message: `Missing values exceed ${maxMissing}% of analysed cells.` }] : [],
    });
  }

  // 7. Coverage (checklists and rules) -------------------------------------------
  if (evidence.kind !== 'dataset') {
    const unassessed = evidence.facts.filter((f) => f.check === 'not-assessed');
    const status: CheckStatus = unassessed.length && unassessedMode !== 'ignore' ? (unassessedMode === 'fail' ? 'fail' : 'warn') : 'pass';
    const noun = evidence.kind === 'website' ? 'checklist item' : 'rule';
    checks.push({
      id: 'coverage', label: `Every ${noun} was assessed`,
      status,
      detail: unassessed.length
        ? `${unassessed.length} ${plural(unassessed.length, noun)} could not be assessed from the input${unassessedMode === 'ignore' ? ' (ignored by instruction)' : ''}.`
        : `Every ${noun} was assessed.`,
      findings: unassessed.map((f) => ({ ref: f.id, message: `${f.label}: ${f.display}` })),
    });
  }

  if (strict) for (const c of checks) if (c.status === 'warn') c.status = 'fail';

  const failed = checks.filter((c) => c.status === 'fail');
  const warned = checks.filter((c) => c.status === 'warn');
  const verdict: CheckStatus = failed.length ? 'fail' : warned.length ? 'warn' : 'pass';
  const summaryText =
    verdict === 'fail'
      ? `Failed ${failed.length} of ${checks.length} checks: ${failed.map((c) => c.label.toLowerCase()).join('; ')}.`
      : verdict === 'warn'
        ? `Passed with ${warned.length} ${plural(warned.length, 'warning')}: ${warned.map((c) => c.label.toLowerCase()).join('; ')}.`
        : `Passed all ${checks.length} checks.`;

  return { reviewerId: ctx.agent.id, reviewerName: ctx.agent.name, verdict, checks, claims: claimVerdicts, summary: summaryText };
}
