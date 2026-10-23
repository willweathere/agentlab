import { ArrowLeft, ClipboardCopy, FileDown, FileQuestion, OctagonX } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'wouter';
import { ROLE_SPECS } from '../engine/contracts';
import { buildReport, exportReport, formatDuration, formatTimestamp } from '../engine/report';
import type { EvidenceSet } from '../engine/types';
import { downloadText, slug } from '../lib/hooks';
import { useStore } from '../state/store';
import { EvidenceTable, ReviewView, StatementList } from '../components/output/OutputView';
import { RoleChip } from '../components/ui/icons';
import { RUN_STATUS, STAGE_STATUS, StatusPill } from '../components/ui/status';
import { EmptyState, PageShell } from './PageShell';

function Block({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-line pt-6">
      <h2 className="t-section mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Missing({ reason }: { reason?: string }) {
  return <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-ink-3">{reason ?? 'Not produced.'}</p>;
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const history = useStore((s) => s.history);
  const live = useStore((s) => s.run);
  const toast = useStore((s) => s.toast);
  const run = history.find((r) => r.id === id) ?? (live?.id === id ? live : undefined);

  if (!run) {
    return (
      <PageShell title="Report not found" docTitle="Report">
        <EmptyState
          icon={<FileQuestion size={20} />}
          title="This run isn’t in your history"
          body="Reports are stored in the browser that ran them. It may have been cleared, or the link came from another device."
          action={
            <Link href="/history" className="btn btn-secondary">
              View execution history
            </Link>
          }
        />
      </PageShell>
    );
  }

  if (run.status === 'running') {
    return (
      <PageShell title={run.workflowName} docTitle="Report">
        <EmptyState icon={<FileQuestion size={20} />} title="Still running" body="The report is built once the last stage finishes. Watch progress in the workspace." action={<Link href="/" className="btn btn-secondary">Back to the workspace</Link>} />
      </PageShell>
    );
  }

  const report = buildReport(run);
  const st = RUN_STATUS[run.status];
  const evidence = run.stages.find((s) => s.output?.type === 'evidence')?.output?.data as EvidenceSet | undefined;
  const md = () => exportReport(report, 'md');

  return (
    <PageShell
      title={report.workflowName}
      docTitle={`Report: ${report.workflowName}`}
      lead={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusPill label={report.partial ? `${st.label}, partial results` : st.label} tone={st.tone} />
          <span className="t-mono text-[12px] text-ink-2">{formatTimestamp(report.startedAt)}</span>
          <span className="t-mono text-[12px] text-ink-2">{formatDuration(report.durationMs)}</span>
          <span className="t-mono text-[12px] text-ink-2">
            {report.stagesCompleted} of {report.stagesTotal} stages completed
          </span>
        </span>
      }
      actions={
        <>
          <Link href="/history" className="btn btn-ghost">
            <ArrowLeft size={15} aria-hidden="true" /> History
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => downloadText(`${slug(report.workflowName)}-report.md`, md(), 'text/markdown')}>
            <FileDown size={15} aria-hidden="true" /> Markdown
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => downloadText(`${slug(report.workflowName)}-report.txt`, exportReport(report, 'txt'), 'text/plain')}>
            <FileDown size={15} aria-hidden="true" /> Text
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(md());
                toast('Report copied as Markdown.', 'success');
              } catch {
                toast('The browser blocked clipboard access. Use the Markdown download instead.', 'error');
              }
            }}
          >
            <ClipboardCopy size={15} aria-hidden="true" /> Copy
          </button>
        </>
      }
    >
      <article className="max-w-[820px] space-y-8">
        {report.failure && (
          <div role="alert" className="flex gap-3 rounded-2xl border border-[oklch(0.7_0.19_25/0.4)] bg-[oklch(0.7_0.19_25/0.08)] p-4">
            <OctagonX size={18} className="mt-0.5 flex-none text-error" aria-hidden="true" />
            <div>
              <p className="text-[14px] font-[620] text-[oklch(0.9_0.07_25)]">
                {report.failure.kind === 'cancelled' ? 'The run was cancelled' : `The run failed at stage ${report.failure.stage}: ${report.failure.agentName}`}
              </p>
              <p className="mt-1 text-[13.5px] text-[oklch(0.86_0.06_25)]">{report.failure.message}</p>
              <p className="mt-2 text-[12.5px] text-ink-3">Everything below comes from the stages that finished. Sections a later stage would have produced are marked as missing.</p>
            </div>
          </div>
        )}

        <section aria-label="Input summary">
          <h2 className="t-section mb-3">Input</h2>
          <p className="text-[13px] text-ink-3">{report.input.kind}</p>
          <ul className="mt-2 space-y-1 text-[13.5px] text-ink-2">
            {report.input.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>

        {report.summary.available && report.summary.items && (
          <Block title="Summary">
            <p className="mb-3 text-[13.5px] text-ink-2">{report.summary.items.headline}</p>
            <StatementList items={report.summary.items.points} />
          </Block>
        )}

        <Block title="Findings">
          {!report.findings.available ? (
            <Missing reason={report.findings.missingReason} />
          ) : (
            <div className="space-y-6">
              {report.findings.items.map((g) => (
                <div key={g.group}>
                  <h3 className="mb-2.5 text-[13px] font-[620] text-ink-2">{g.group}</h3>
                  <StatementList items={g.items} linkFacts />
                </div>
              ))}
            </div>
          )}
        </Block>

        <Block title="Analysis">
          {!report.analysis.available ? (
            <Missing reason={report.analysis.missingReason} />
          ) : report.analysis.items.length ? (
            <>
              <p className="mb-3 text-[12.5px] text-ink-3">Possible interpretations. Each is hedged and cites the observation it interprets.</p>
              <StatementList items={report.analysis.items} />
            </>
          ) : (
            <p className="text-[13px] text-ink-3">No interpretations were made.</p>
          )}
        </Block>

        <Block title="Reviewer feedback">
          {!report.reviews.available ? (
            <Missing reason={report.reviews.missingReason} />
          ) : (
            <div className="space-y-6">
              {report.reviews.items.map((r) => (
                <div key={r.reviewerId}>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-[600]">{r.reviewerName}</span>
                    <StatusPill label={r.verdict === 'pass' ? 'Passed' : r.verdict === 'warn' ? 'Passed with warnings' : 'Failed'} tone={r.verdict === 'pass' ? 'success' : r.verdict === 'warn' ? 'warning' : 'error'} />
                  </div>
                  <p className="mb-3 text-[13.5px] text-ink-2">{r.summary}</p>
                  <ReviewView review={r} />
                </div>
              ))}
            </div>
          )}
        </Block>

        <Block title="Recommendations">
          {!report.recommendations.available ? (
            <Missing reason={report.recommendations.missingReason} />
          ) : report.recommendations.items.length ? (
            <StatementList items={report.recommendations.items} showPriority />
          ) : (
            <p className="text-[13px] text-ink-3">No recommendations were made.</p>
          )}
        </Block>

        <Block title="Limitations">
          <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-2 marker:text-ink-3">
            {report.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Block>

        <Block title="Stage trace">
          <ol className="space-y-2">
            {report.stages.map((s) => {
              const ss = STAGE_STATUS[s.status];
              return (
                <li key={s.index} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2.5 text-[13px]">
                  <span className="t-mono text-[11px] text-ink-3">{String(s.index + 1).padStart(2, '0')}</span>
                  <RoleChip role={s.role} size={12} />
                  <span className="min-w-0 flex-1">
                    <span className="text-ink">{s.agentName}</span> <span className="text-ink-3">{ROLE_SPECS[s.role].label}</span>
                    {s.output && <span className="block text-[12.5px] text-ink-3">{s.output.summary}</span>}
                    {s.error && <span className="block text-[12.5px] text-[oklch(0.84_0.1_25)]">{s.error}</span>}
                  </span>
                  <span className="t-mono text-[11.5px] text-ink-2">{s.processingMs !== undefined ? formatDuration(s.processingMs) : '–'}</span>
                  <StatusPill label={ss.label} tone={ss.tone} />
                </li>
              );
            })}
          </ol>
          <p className="t-mono mt-3 text-[11px] text-ink-3">
            Total {formatDuration(report.durationMs)}, processing {formatDuration(report.processingMs)}, step delay {formatDuration(report.pacingMs)}. Run {report.runId}.
          </p>
        </Block>

        {evidence && (
          <Block title={`Evidence (${evidence.facts.length} facts)`} id="evidence">
            <p className="mb-4 text-[12.5px] text-ink-3">Every figure in this report traces back to one of these facts. The ids in the statements above link here.</p>
            <EvidenceTable evidence={evidence} anchors />
          </Block>
        )}
      </article>
    </PageShell>
  );
}
