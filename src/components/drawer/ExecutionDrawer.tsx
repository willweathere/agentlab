import { ChevronDown, CircleAlert, FileText, Play, Square, TriangleAlert } from 'lucide-react';
import { Link } from 'wouter';
import { ROLE_SPECS } from '../../engine/contracts';
import { formatDuration } from '../../engine/report';
import type { Review, RunRecord } from '../../engine/types';
import { timeOfDay, useTicker } from '../../lib/hooks';
import { isRunning, isRunStale, useStore, validationOf } from '../../state/store';
import { RoleChip } from '../ui/icons';
import { RUN_STATUS, STAGE_STATUS, StatusPill } from '../ui/status';

const SEGMENT: Record<string, string> = {
  queued: 'bg-slab-3',
  receiving: 'bg-activity',
  running: 'bg-activity',
  passed: 'bg-success',
  warning: 'bg-warning',
  failed: 'bg-error',
  skipped: 'bg-slab-3 opacity-50',
  cancelled: 'bg-slab-3 opacity-50',
};

export function ExecutionDrawer() {
  const run = useStore((s) => s.run);
  const open = useStore((s) => s.settings.drawerOpen);
  const update = useStore((s) => s.updateSettings);
  const running = useStore(isRunning);
  const stale = useStore(isRunStale);
  const select = useStore((s) => s.select);
  const cancel = useStore((s) => s.cancelRun);
  const runWorkflow = useStore((s) => s.runWorkflow);
  const runError = useStore((s) => s.runError);
  const valid = useStore((s) => validationOf(s.workflow).ok);
  useTicker(running, 100);

  const st = run ? RUN_STATUS[run.status] : null;
  const done = run?.stages.filter((s) => s.status === 'passed' || s.status === 'warning').length ?? 0;
  const elapsed = run ? (run.durationMs ?? Date.now() - Date.parse(run.startedAt)) : 0;
  const reviews = run?.stages.filter((s) => s.output?.type === 'review').map((s) => s.output!.data as Review) ?? [];

  return (
    <section aria-label="Execution" className="relative z-10 flex-none border-t border-line bg-slab">
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:px-4">
        <button
          type="button"
          className="flex items-center gap-2 rounded-md text-[13px] font-[620] text-ink"
          aria-expanded={open}
          aria-controls="execution-body"
          onClick={() => update({ drawerOpen: !open })}
        >
          <ChevronDown size={16} className={`text-ink-3 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
          Execution
        </button>
        {st ? <StatusPill label={st.label} tone={st.tone} live={st.live} /> : <StatusPill label="Not yet run" tone="muted" />}
        {run && (
          <>
            <div className="flex min-w-[96px] flex-1 items-center gap-1 sm:max-w-[260px]" role="progressbar" aria-label="Stages completed" aria-valuemin={0} aria-valuemax={run.stages.length} aria-valuenow={done}>
              {run.stages.map((s) => (
                <span key={s.index} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${SEGMENT[s.status]}`} />
              ))}
            </div>
            <span className="t-mono text-[11.5px] text-ink-2">
              {done}/{run.stages.length} stages
            </span>
            <span className="t-mono hidden text-[11.5px] text-ink-2 sm:inline">{formatDuration(elapsed)}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {running && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>
              <Square size={12} aria-hidden="true" /> Cancel
            </button>
          )}
          {run && !running && (
            <Link href={`/runs/${run.id}`} className="btn btn-secondary btn-sm">
              <FileText size={13} aria-hidden="true" /> Open report
            </Link>
          )}
        </div>
      </div>

      {open && (
        <div id="execution-body" className="max-h-[38dvh] overflow-y-auto border-t border-line sm:max-h-[300px]">
          {runError && (
            <p className="mx-4 mt-3 flex gap-2 rounded-lg border border-[oklch(0.7_0.19_25/0.35)] bg-[oklch(0.7_0.19_25/0.08)] px-3 py-2 text-[13px] text-[oklch(0.88_0.08_25)]">
              <CircleAlert size={15} className="mt-0.5 flex-none" aria-hidden="true" />
              {runError}
            </p>
          )}
          {!run ? (
            <div className="flex flex-col items-start gap-3 px-4 py-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-[600]">Not yet run</p>
                <p className="text-[12.5px] text-ink-3">Run the workflow to see each stage’s status, real start and end times, validation and output here.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!valid} onClick={() => void runWorkflow()}>
                <Play size={13} aria-hidden="true" /> Run workflow
              </button>
            </div>
          ) : (
            <RunBody run={run} stale={stale} reviews={reviews} onSelect={(id) => select({ type: 'agent', id })} />
          )}
        </div>
      )}
    </section>
  );
}

function RunBody({ run, stale, reviews, onSelect }: { run: RunRecord; stale: boolean; reviews: Review[]; onSelect: (agentId: string) => void }) {
  const problems = run.stages.flatMap((s) => [
    // A failed review is described by its checks below, so its summary isn't repeated here.
    ...(s.error && s.output?.type !== 'review' ? [{ tone: 'error' as const, stage: s.agentName, text: s.error }] : []),
    ...s.warnings.map((w) => ({ tone: 'warning' as const, stage: s.agentName, text: w })),
  ]);
  const checks = reviews.flatMap((r) => r.checks.filter((c) => c.status !== 'pass').map((c) => ({ r, c })));

  return (
    <div className="px-3 pb-4 pt-2 sm:px-4">
      {stale && <p className="mb-2 mt-1 rounded-lg border border-line bg-well px-3 py-2 text-[12.5px] text-ink-2">The workflow has changed since this run. The results below describe the earlier version.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[12.5px]">
          <caption className="sr-only">Stage results for this run</caption>
          <thead>
            <tr className="text-ink-3">
              <th scope="col" className="py-2 pr-3 font-[520]">Stage</th>
              <th scope="col" className="py-2 pr-3 font-[520]">Status</th>
              <th scope="col" className="py-2 pr-3 font-[520]">Started</th>
              <th scope="col" className="py-2 pr-3 font-[520]">Ended</th>
              <th scope="col" className="py-2 pr-3 text-right font-[520]">Processing</th>
              <th scope="col" className="py-2 font-[520]">Output</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {run.stages.map((s) => {
              const ss = STAGE_STATUS[s.status];
              return (
                <tr key={s.index} className="align-middle">
                  <td className="py-2 pr-3">
                    <button type="button" className="flex items-center gap-2 rounded-md text-left hover:text-ink" onClick={() => onSelect(s.agentId)} disabled={stale}>
                      <span className="t-mono text-[11px] text-ink-3">{String(s.index + 1).padStart(2, '0')}</span>
                      <RoleChip role={s.role} size={12} />
                      <span>
                        <span className="block text-ink">{s.agentName}</span>
                        <span className="block text-[11px] text-ink-3">{ROLE_SPECS[s.role].label}</span>
                      </span>
                    </button>
                  </td>
                  <td className="py-2 pr-3">
                    <StatusPill label={ss.label} tone={ss.tone} live={ss.live} />
                  </td>
                  <td className="t-mono py-2 pr-3 text-ink-2">{timeOfDay(s.startedAt)}</td>
                  <td className="t-mono py-2 pr-3 text-ink-2">{timeOfDay(s.endedAt)}</td>
                  <td className="t-mono py-2 pr-3 text-right text-ink-2">{s.processingMs !== undefined ? formatDuration(s.processingMs) : '–'}</td>
                  <td className="py-2 text-ink-2">{s.output?.summary ?? (s.status === 'skipped' ? 'Not run: an earlier stage failed' : s.status === 'cancelled' ? 'Not run: cancelled' : '–')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(problems.length > 0 || checks.length > 0) && (
        <ul className="mt-3 space-y-1.5">
          {problems.map((p, i) => (
            <li key={`p${i}`} className="flex gap-2 text-[12.5px] leading-snug">
              {p.tone === 'error' ? <CircleAlert size={14} className="mt-0.5 flex-none text-error" aria-label="Error" /> : <TriangleAlert size={14} className="mt-0.5 flex-none text-warning" aria-label="Warning" />}
              <span className="text-ink-2">
                <span className="text-ink">{p.stage}:</span> {p.text}
              </span>
            </li>
          ))}
          {checks.map(({ r, c }) => (
            <li key={`${r.reviewerId}-${c.id}`} className="flex gap-2 text-[12.5px] leading-snug">
              {c.status === 'fail' ? <CircleAlert size={14} className="mt-0.5 flex-none text-error" aria-label="Failed check" /> : <TriangleAlert size={14} className="mt-0.5 flex-none text-warning" aria-label="Warning" />}
              <span className="text-ink-2">
                <span className="text-ink">{r.reviewerName}, {c.label.toLowerCase()}:</span> {c.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="t-mono mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
        <span>Run {run.id}</span>
        <span>Started {timeOfDay(run.startedAt)}</span>
        {run.durationMs !== undefined && <span>Total {formatDuration(run.durationMs)}</span>}
        <span>Processing {formatDuration(run.processingMs)}</span>
        {run.stepDelayMs > 0 && <span>Step delay {formatDuration(run.pacingMs)} (set in Settings)</span>}
      </p>
    </div>
  );
}
