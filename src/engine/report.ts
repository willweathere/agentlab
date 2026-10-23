import { INPUT_LABELS, ROLE_SPECS } from './contracts';
import type { Analysis, EvidenceSet, Review, RunRecord, RunStatus, StageRecord, Statement, Summary } from './types';

/**
 * Builds the final report purely from what the stages recorded. Sections a stage never
 * produced are marked as missing rather than filled in, and a failed or cancelled run is
 * never labelled a success.
 */

export interface ReportSection<T> {
  available: boolean;
  /** Why the section is empty when it is unavailable. */
  missingReason?: string;
  items: T;
}

export interface Report {
  runId: string;
  workflowName: string;
  status: RunStatus;
  statusLabel: string;
  partial: boolean;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  processingMs: number;
  pacingMs: number;
  stagesCompleted: number;
  stagesTotal: number;
  failure?: { stage: number; agentName: string; message: string; kind: string };
  input: { kind: string; lines: string[] };
  summary: ReportSection<Summary | null>;
  findings: ReportSection<{ group: string; items: Statement[] }[]>;
  analysis: ReportSection<Statement[]>;
  reviews: ReportSection<Review[]>;
  recommendations: ReportSection<Statement[]>;
  limitations: string[];
  stages: StageRecord[];
}

export const STATUS_LABELS: Record<RunStatus, string> = {
  running: 'Running',
  completed: 'Completed',
  warning: 'Completed with warnings',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const GROUP_ORDER: Record<Analysis['kind'], string[]> = {
  dataset: ['Totals and trends', 'Breakdown', 'Targets', 'Data quality'],
  website: ['Overview', 'Issues', 'Passing checks'],
  content: ['Overview', 'Issues', 'Strengths'],
};

function outputOf<T>(run: RunRecord, type: string): T | undefined {
  const stage = [...run.stages].reverse().find((s) => s.output?.type === type);
  return stage?.output?.data as T | undefined;
}

function missingReason(run: RunRecord, role: string, what: string): string {
  const stage = run.stages.find((s) => s.role === role);
  if (!stage) return `No ${ROLE_SPECS[role as keyof typeof ROLE_SPECS].label} in this workflow, so there are no ${what}.`;
  if (stage.status === 'skipped') return `Not produced: ${stage.agentName} was skipped after an earlier stage failed.`;
  if (stage.status === 'cancelled') return `Not produced: the run was cancelled before ${stage.agentName} finished.`;
  if (stage.status === 'failed') return `Not produced: ${stage.agentName} failed.`;
  return `Not produced.`;
}

export function buildReport(run: RunRecord): Report {
  const evidence = outputOf<EvidenceSet>(run, 'evidence');
  const analysis = outputOf<Analysis>(run, 'analysis');
  const summary = outputOf<Summary>(run, 'summary');
  const reviews = run.stages.filter((s) => s.output?.type === 'review').map((s) => s.output!.data as Review);
  const { input } = run.definition;
  const labels = INPUT_LABELS[input.kind];

  const inputLines: string[] = [];
  if (evidence) inputLines.push(`Subject: ${evidence.subject}.`, `Evidence extracted: ${evidence.facts.length} facts.`);
  const nonEmpty = (t: string) => t.split(/\r?\n/).filter((l) => l.trim()).length;
  const lineCount = (t: string) => `${nonEmpty(t)} ${nonEmpty(t) === 1 ? 'line' : 'lines'}`;
  inputLines.push(`${labels.primary}: ${lineCount(input.primary)}.`);
  if (labels.secondary) inputLines.push(`${labels.secondary}: ${lineCount(input.secondary)}.`);
  const claims = nonEmpty(input.claims);
  inputLines.push(claims ? `Claims to verify: ${claims}.` : 'No claims to verify were supplied.');

  const groups = analysis
    ? (() => {
        const order = GROUP_ORDER[analysis.kind];
        const byGroup = new Map<string, Statement[]>();
        for (const o of analysis.observations) {
          const g = o.group ?? 'Findings';
          byGroup.set(g, [...(byGroup.get(g) ?? []), o]);
        }
        const rank = (g: string) => (order.includes(g) ? order.indexOf(g) : order.length);
        return [...byGroup.entries()]
          .sort(([a], [b]) => rank(a) - rank(b))
          .map(([group, items]) => ({ group, items }));
      })()
    : [];

  const limitations = [
    ...(analysis ? analysis.unavailable.map((u) => u.text) : evidence ? evidence.gaps : []),
    'All processing in this run was deterministic and rule-based. No AI model was used.',
  ];

  const stagesCompleted = run.stages.filter((s) => s.status === 'passed' || s.status === 'warning').length;
  const failure = run.failure
    ? { stage: run.failure.stageIndex + 1, agentName: run.failure.agentName, message: run.failure.message, kind: run.failure.kind }
    : undefined;

  return {
    runId: run.id,
    workflowName: run.workflowName,
    status: run.status,
    statusLabel: STATUS_LABELS[run.status],
    partial: run.status === 'failed' || run.status === 'cancelled' || run.status === 'running',
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationMs: run.durationMs,
    processingMs: run.processingMs,
    pacingMs: run.pacingMs,
    stagesCompleted,
    stagesTotal: run.stages.length,
    failure,
    input: { kind: labels.kind, lines: inputLines },
    summary: summary ? { available: true, items: summary } : { available: false, items: null, missingReason: missingReason(run, 'summariser', 'summary') },
    findings: analysis ? { available: true, items: groups } : { available: false, items: [], missingReason: missingReason(run, 'analyst', 'findings') },
    analysis: analysis ? { available: true, items: analysis.interpretations } : { available: false, items: [], missingReason: missingReason(run, 'analyst', 'interpretations') },
    reviews: reviews.length ? { available: true, items: reviews } : { available: false, items: [], missingReason: missingReason(run, 'reviewer', 'reviewer notes') },
    recommendations: analysis ? { available: true, items: analysis.recommendations } : { available: false, items: [], missingReason: missingReason(run, 'analyst', 'recommendations') },
    limitations,
    stages: run.stages,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return 'n/a';
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatTimestamp(iso: string | undefined): string {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${date}, ${time}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

const CHECK_MARK = { pass: 'Pass', warn: 'Warning', fail: 'Fail' } as const;

interface Writer {
  h1(t: string): void;
  h2(t: string): void;
  h3(t: string): void;
  p(t: string): void;
  li(t: string): void;
  gap(): void;
  done(): string;
}

function writer(kind: 'md' | 'txt'): Writer {
  const out: string[] = [];
  return {
    h1: (t) => out.push(kind === 'md' ? `# ${t}` : `${t}\n${'='.repeat(t.length)}`, ''),
    h2: (t) => out.push(kind === 'md' ? `## ${t}` : `${t}\n${'-'.repeat(t.length)}`, ''),
    h3: (t) => out.push(kind === 'md' ? `### ${t}` : `${t}:`, ''),
    p: (t) => out.push(t, ''),
    li: (t) => out.push(kind === 'md' ? `- ${t}` : `  * ${t}`),
    gap: () => out.push(''),
    done: () => out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n',
  };
}

function cite(s: Statement, md: boolean): string {
  const refs = s.refs.length ? ` [${s.refs.join(', ')}]` : '';
  const id = md ? `\`${s.id}\`` : s.id;
  return `${id} ${s.text}${refs}`;
}

export function exportReport(report: Report, kind: 'md' | 'txt'): string {
  const md = kind === 'md';
  const w = writer(kind);
  w.h1(report.workflowName);
  w.p(
    [
      `Status: ${report.statusLabel}${report.partial ? ' (partial results)' : ''}`,
      `Started: ${formatTimestamp(report.startedAt)}`,
      `Duration: ${formatDuration(report.durationMs)} (processing ${formatDuration(report.processingMs)}, pacing ${formatDuration(report.pacingMs)})`,
      `Stages completed: ${report.stagesCompleted} of ${report.stagesTotal}`,
      `Run id: ${report.runId}`,
    ].join(md ? '  \n' : '\n'),
  );
  if (report.failure) {
    w.p(`${md ? '**' : ''}Run stopped at stage ${report.failure.stage} (${report.failure.agentName}): ${report.failure.message}${md ? '**' : ''}`);
  }

  w.h2('Input');
  w.p(`Type: ${report.input.kind}`);
  for (const l of report.input.lines) w.li(l);
  w.gap();

  if (report.summary.available && report.summary.items) {
    w.h2('Summary');
    w.p(report.summary.items.headline);
    for (const s of report.summary.items.points) w.li(s.text);
    w.gap();
  }

  w.h2('Findings');
  if (!report.findings.available) w.p(report.findings.missingReason ?? '');
  for (const g of report.findings.items) {
    w.h3(g.group);
    for (const s of g.items) w.li(cite(s, md));
    w.gap();
  }

  w.h2('Analysis');
  if (!report.analysis.available) w.p(report.analysis.missingReason ?? '');
  else if (report.analysis.items.length === 0) w.p('No interpretations were made.');
  for (const s of report.analysis.items) w.li(cite(s, md));
  w.gap();

  w.h2('Reviewer feedback');
  if (!report.reviews.available) w.p(report.reviews.missingReason ?? '');
  for (const r of report.reviews.items) {
    w.h3(`${r.reviewerName}: ${CHECK_MARK[r.verdict]}`);
    w.p(r.summary);
    for (const c of r.checks) {
      w.li(`${CHECK_MARK[c.status]}: ${c.label}. ${c.detail}`);
      for (const f of c.findings) w.li(`${md ? '  ' : '    '}${f.message}`);
    }
    if (r.claims.length) {
      w.gap();
      w.p('Claims:');
      for (const c of r.claims) w.li(`${c.claimId} (${c.status}) “${c.text}”: ${c.reason}`);
    }
    w.gap();
  }

  w.h2('Recommendations');
  if (!report.recommendations.available) w.p(report.recommendations.missingReason ?? '');
  else if (report.recommendations.items.length === 0) w.p('No recommendations were made.');
  for (const s of report.recommendations.items) w.li(`${s.priority ? `[${s.priority}] ` : ''}${cite(s, md)}`);
  w.gap();

  w.h2('Limitations');
  for (const l of report.limitations) w.li(l);
  w.gap();

  w.h2('Stage trace');
  for (const s of report.stages) {
    w.li(
      `${s.index + 1}. ${s.agentName} (${ROLE_SPECS[s.role].label}): ${s.status}` +
        (s.processingMs !== undefined ? `, ${formatDuration(s.processingMs)}` : '') +
        (s.output ? `. Output: ${s.output.summary}` : '') +
        (s.error ? `. Error: ${s.error}` : ''),
    );
  }
  w.gap();
  w.p('Generated by AgentLab, a workflow engine with deterministic processing. References in brackets are evidence (F) and statement (O, I, R) ids.');
  return w.done();
}
