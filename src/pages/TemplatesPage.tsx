import { ArrowRight, FolderOpen, Trash2 } from 'lucide-react';
import { INPUT_LABELS, ROLE_SPECS } from '../engine/contracts';
import { EXAMPLES } from '../engine/examples';
import { relativeTime } from '../lib/hooks';
import { useStore } from '../state/store';
import { useConfirm } from '../components/ui/Confirm';
import { INPUT_ICONS, RoleChip } from '../components/ui/icons';
import { useGuardedSwitch } from '../components/shell/useGuardedNavigation';
import { EmptyState, PageShell } from './PageShell';

export default function TemplatesPage() {
  const saved = useStore((s) => s.saved);
  const loadExample = useStore((s) => s.loadExample);
  const openSaved = useStore((s) => s.openSaved);
  const deleteSaved = useStore((s) => s.deleteSaved);
  const current = useStore((s) => s.workflow.id);
  const guarded = useGuardedSwitch();
  const confirm = useConfirm();

  return (
    <PageShell
      title="Templates"
      lead="Start from one of three bundled examples, or reopen a workflow you saved in this browser. Every example uses fictional data and needs no API key."
    >
      <h2 className="t-section">Examples</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {EXAMPLES.map((ex) => {
          const Icon = INPUT_ICONS[ex.input.kind];
          return (
            <article key={ex.id} className="panel flex flex-col p-5">
              <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
                <Icon size={14} aria-hidden="true" />
                {INPUT_LABELS[ex.input.kind].kind}
              </div>
              <h3 className="mt-3 text-[16px] font-[640] leading-snug" style={{ fontStretch: '106%' }}>
                {ex.name}
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{ex.description}</p>
              <ol className="mt-4 flex items-center gap-1.5" aria-label="Stages">
                {ex.agents.map((a, i) => (
                  <li key={a.name} className="flex items-center gap-1.5">
                    <span className="sr-only">
                      {i + 1}. {a.name}, {ROLE_SPECS[a.role].label}
                    </span>
                    <RoleChip role={a.role} size={13} />
                    {i < ex.agents.length - 1 && <span className="h-px w-4 bg-line-strong" aria-hidden="true" />}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[12.5px] text-ink-3">Produces: {ex.produces}</p>
              <div className="mt-auto pt-5">
                <button type="button" className="btn btn-secondary w-full" onClick={() => guarded(() => loadExample(ex.id), { goTo: '/' })}>
                  Use this example <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <h2 id="saved" className="t-section mt-12">
        Your workflows
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">Saved in this browser’s local storage. They aren’t synced anywhere else.</p>
      <div className="mt-4">
        {saved.length === 0 ? (
          <EmptyState
            icon={<FolderOpen size={20} />}
            title="No saved workflows yet"
            body="Use Save in the workspace header and the workflow will appear here, ready to reopen after a reload."
          />
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {[...saved]
              .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
              .map((w) => {
                const Icon = INPUT_ICONS[w.input.kind];
                return (
                  <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap">
                    <Icon size={16} className="flex-none text-ink-3" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-[600]">{w.name}</span>
                        {w.id === current && <span className="pill tone-selected">Open</span>}
                      </div>
                      <div className="text-[12.5px] text-ink-3">
                        {w.agents.length} {w.agents.length === 1 ? 'agent' : 'agents'}, {INPUT_LABELS[w.input.kind].kind.toLowerCase()} input, updated {relativeTime(w.updatedAt)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => guarded(() => openSaved(w.id), { goTo: '/' })}>
                        Open
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm icon-btn"
                        aria-label={`Delete ${w.name}`}
                        onClick={async () => {
                          const r = await confirm({
                            title: `Delete “${w.name}”?`,
                            body: 'It will be removed from this browser. Run history for it is kept. This can’t be undone.',
                            confirmLabel: 'Delete workflow',
                            tone: 'danger',
                          });
                          if (r === 'confirm') deleteSaved(w.id);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
