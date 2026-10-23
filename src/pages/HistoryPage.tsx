import { History, Trash2 } from 'lucide-react';
import { Link } from 'wouter';
import { formatDuration, formatTimestamp } from '../engine/report';
import { relativeTime } from '../lib/hooks';
import { useStore } from '../state/store';
import { useConfirm } from '../components/ui/Confirm';
import { RUN_STATUS, StatusPill } from '../components/ui/status';
import { EmptyState, PageShell } from './PageShell';
import { HISTORY_LIMIT } from '../state/persistence';

export default function HistoryPage() {
  const history = useStore((s) => s.history);
  const clear = useStore((s) => s.clearHistory);
  const confirm = useConfirm();

  return (
    <PageShell
      title="Execution history"
      lead={`Every finished run is recorded in this browser with its real timestamps, stage results and outputs. The latest ${HISTORY_LIMIT} are kept.`}
      actions={
        history.length > 0 && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={async () => {
              const r = await confirm({
                title: 'Clear all run history?',
                body: `${history.length} recorded ${history.length === 1 ? 'run' : 'runs'} and their reports will be removed from this browser. Saved workflows are not affected.`,
                confirmLabel: 'Clear history',
                tone: 'danger',
              });
              if (r === 'confirm') clear();
            }}
          >
            <Trash2 size={15} aria-hidden="true" /> Clear history
          </button>
        )
      }
    >
      {history.length === 0 ? (
        <EmptyState
          icon={<History size={20} />}
          title="No runs recorded yet"
          body="Run a workflow from the workspace. Each run, whether it passes, fails or is cancelled, is listed here with its report."
          action={
            <Link href="/" className="btn btn-secondary">
              Go to the workspace
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line" aria-label="Runs, newest first">
          {history.map((r) => {
            const st = RUN_STATUS[r.status];
            const done = r.stages.filter((s) => s.status === 'passed' || s.status === 'warning').length;
            return (
              <li key={r.id}>
                <Link href={`/runs/${r.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-slab sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto]">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-[600] text-ink">{r.workflowName}</span>
                    <span className="block t-meta">{relativeTime(r.startedAt)}</span>
                  </span>
                  <span className="justify-self-end sm:justify-self-start">
                    <StatusPill label={st.label} tone={st.tone} />
                  </span>
                  <time dateTime={r.startedAt} className="t-mono text-[11.5px] text-ink-2">
                    {formatTimestamp(r.startedAt)}
                  </time>
                  <span className="t-mono text-[11.5px] text-ink-2 sm:text-right">{formatDuration(r.durationMs)}</span>
                  <span className="t-mono justify-self-end text-[11.5px] text-ink-2">
                    {done} of {r.stages.length} stages
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
