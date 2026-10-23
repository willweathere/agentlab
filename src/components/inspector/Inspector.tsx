import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useMediaQuery } from '../../lib/hooks';
import { isRunStale, useStore } from '../../state/store';
import { liveRun } from '../canvas/runView';
import { AgentPanel } from './AgentPanel';
import { InputPanel } from './InputPanel';
import { OverviewPanel, ReportPanel } from './OverviewPanels';

/** Docked on wide screens; a dismissible panel over the canvas on narrower ones. */
export function Inspector() {
  const docked = useMediaQuery('(min-width: 1024px)');
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const workflow = useStore((s) => s.workflow);
  const run = liveRun(useStore((s) => s.run), useStore(isRunStale));
  const wide = useMediaQuery('(min-width: 640px)');
  const panelRef = useRef<HTMLDivElement>(null);

  const agent = selection?.type === 'agent' ? workflow.agents.find((a) => a.id === selection.id) : undefined;
  useEffect(() => {
    if (selection?.type === 'agent' && !agent) select(null);
  }, [selection, agent, select]);

  const open = docked || selection !== null;

  useEffect(() => {
    if (docked || !selection) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [docked, selection, select]);

  if (!open) return null;

  const content =
    agent ? <AgentPanel key={agent.id} agent={agent} stage={run?.stages.find((s) => s.agentId === agent.id)} horizontal={wide} />
    : selection?.type === 'input' ? <InputPanel />
    : selection?.type === 'report' ? <ReportPanel />
    : <OverviewPanel />;

  if (docked) {
    return (
      <aside aria-label="Inspector" className="flex min-h-0 w-[360px] flex-none flex-col border-l border-line bg-slab xl:w-[380px]">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">{content}</div>
      </aside>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[oklch(0.1_0.01_275/0.55)]" aria-hidden="true" onClick={() => select(null)} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Inspector"
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border border-line-strong bg-slab outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[400px] sm:rounded-none sm:rounded-l-2xl"
        style={{ animation: `${wide ? 'slide-in-right' : 'sheet-in'} 220ms var(--ease-out-soft) both` }}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="mx-auto h-1 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />
          <button type="button" className="btn btn-ghost btn-sm icon-btn absolute right-3 top-2" aria-label="Close inspector" onClick={() => select(null)}>
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">{content}</div>
      </div>
    </>
  );
}
