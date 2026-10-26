import { Check, Copy, Download, Ellipsis, FileText, ListTree, Loader2, Play, RotateCcw, Save, Square, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { EXAMPLES } from '../../engine/examples';
import { downloadText, slug } from '../../lib/hooks';
import { isDirty, isRunning, isRunStale, isSavedWorkflow, useStore, validationOf } from '../../state/store';
import { useConfirm } from '../ui/Confirm';
import { Menu, type MenuItem } from '../ui/Menu';
import { RUN_STATUS, StatusPill, type Tone } from '../ui/status';

function useStatus(): { label: string; tone: Tone; live?: boolean } {
  const run = useStore((s) => s.run);
  const running = useStore(isRunning);
  const stale = useStore(isRunStale);
  const validation = useStore((s) => validationOf(s.workflow));
  if (running && run) {
    const current = run.stages.findIndex((s) => s.status === 'receiving' || s.status === 'running');
    return current >= 0
      ? { label: `Running stage ${current + 1} of ${run.stages.length}`, tone: 'activity', live: true }
      : { label: 'Building report', tone: 'activity', live: true };
  }
  if (!validation.ok) {
    const n = validation.issues.filter((i) => i.level === 'error').length;
    return { label: `${n} ${n === 1 ? 'issue' : 'issues'} to fix`, tone: 'warning' };
  }
  if (run && !stale) {
    const st = RUN_STATUS[run.status];
    if (run.status === 'failed' && run.failure) return { label: `Failed at stage ${run.failure.stageIndex + 1}`, tone: 'error' };
    return st;
  }
  return { label: 'Ready to run', tone: 'muted' };
}

export function WorkspaceHeader() {
  const workflow = useStore((s) => s.workflow);
  const rename = useStore((s) => s.rename);
  const save = useStore((s) => s.save);
  const runWorkflow = useStore((s) => s.runWorkflow);
  const restart = useStore((s) => s.restartRun);
  const cancel = useStore((s) => s.cancelRun);
  const duplicate = useStore((s) => s.duplicate);
  const resetToTemplate = useStore((s) => s.resetToTemplate);
  const deleteSaved = useStore((s) => s.deleteSaved);
  const newWorkflow = useStore((s) => s.newWorkflow);
  const select = useStore((s) => s.select);
  const run = useStore((s) => s.run);
  const running = useStore(isRunning);
  const dirty = useStore(isDirty);
  const saved = useStore(isSavedWorkflow);
  const stale = useStore(isRunStale);
  const validation = validationOf(workflow);
  const status = useStatus();
  const confirm = useConfirm();
  const [, navigate] = useLocation();

  // A brief "completed" state on the Run button after a run finishes.
  const [justFinished, setJustFinished] = useState(false);
  const prevRunning = useRef(running);
  useEffect(() => {
    if (prevRunning.current && !running && run && (run.status === 'completed' || run.status === 'warning')) {
      setJustFinished(true);
      const t = setTimeout(() => setJustFinished(false), 2200);
      prevRunning.current = running;
      return () => clearTimeout(t);
    }
    prevRunning.current = running;
  }, [running, run]);

  const current = run?.stages.findIndex((s) => s.status === 'receiving' || s.status === 'running') ?? -1;
  const firstError = validation.issues.find((i) => i.level === 'error')?.message;
  const hasRun = Boolean(run && !stale);

  const menuItems: MenuItem[] = [
    { label: 'Workflow details', icon: ListTree, onSelect: () => select({ type: 'workflow' }) },
    { label: 'Restart run', icon: RotateCcw, disabled: !running && !hasRun, onSelect: () => void restart() },
    { label: 'Open last report', icon: FileText, disabled: !run || running, onSelect: () => run && navigate(`/runs/${run.id}`) },
    { label: 'Duplicate workflow', icon: Copy, disabled: running, onSelect: duplicate },
    {
      label: 'Export definition (JSON)',
      icon: Download,
      onSelect: () => downloadText(`${slug(workflow.name)}.agentlab.json`, JSON.stringify(workflow, null, 2), 'application/json'),
    },
  ];
  if (workflow.templateId && EXAMPLES.some((e) => e.id === workflow.templateId)) {
    menuItems.push({
      label: 'Reset to example defaults',
      icon: Undo2,
      disabled: running,
      onSelect: async () => {
        const r = await confirm({ title: 'Reset to the example’s defaults?', body: 'Your changes to the input and agents in this workflow will be replaced.', confirmLabel: 'Reset', tone: 'danger' });
        if (r === 'confirm') resetToTemplate();
      },
    });
  }
  if (saved) {
    menuItems.push({
      label: 'Delete workflow',
      icon: Trash2,
      danger: true,
      disabled: running,
      onSelect: async () => {
        const r = await confirm({
          title: `Delete “${workflow.name}”?`,
          body: 'It will be removed from this browser. Run history for it is kept. This can’t be undone.',
          confirmLabel: 'Delete workflow',
          tone: 'danger',
        });
        if (r === 'confirm') {
          deleteSaved(workflow.id);
          newWorkflow();
        }
      },
    });
  }

  let runLabel = 'Run workflow';
  let RunIcon = Play;
  let state: string | undefined;
  if (running) {
    runLabel = current >= 0 ? `Running ${current + 1}/${run!.stages.length}` : 'Finishing';
    RunIcon = Loader2;
    state = 'running';
  } else if (justFinished) {
    runLabel = 'Completed';
    RunIcon = Check;
    state = 'done';
  } else if (hasRun) {
    runLabel = 'Run again';
    RunIcon = RotateCcw;
  }

  return (
    <header className="glass relative z-20 flex min-h-14 flex-none items-center gap-2 border-x-0 border-t-0 px-3 sm:gap-3 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <label htmlFor="workflow-name" className="sr-only">
          Workflow name
        </label>
        {/* The hidden copy sizes the input to its text, so the status sits right after the name. */}
        <span className="inline-grid min-w-0 max-w-[460px] text-[15px] font-[640] sm:text-[16px]" style={{ fontStretch: '108%' }}>
          <span aria-hidden="true" className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre border border-transparent px-2 py-1">
            {workflow.name || 'Name this workflow'}
          </span>
          <input
            id="workflow-name"
            value={workflow.name}
            maxLength={80}
            disabled={running}
            onChange={(e) => rename(e.target.value)}
            aria-invalid={!workflow.name.trim()}
            className="col-start-1 row-start-1 w-full min-w-[6rem] truncate rounded-lg border border-transparent bg-transparent px-2 py-1 text-ink outline-none transition-colors hover:border-line-strong focus:border-selected focus:bg-well disabled:opacity-100"
            placeholder="Name this workflow"
          />
        </span>
        <button type="button" onClick={() => select({ type: 'workflow' })} className="hidden rounded-full sm:inline-flex" aria-label={`Status: ${status.label}. Show workflow details.`}>
          <StatusPill label={status.label} tone={status.tone} live={status.live} />
        </button>
        {dirty && !running && <span className="hidden text-[12px] text-ink-3 lg:inline">Unsaved changes</span>}
      </div>

      <div className="flex flex-none items-center gap-1.5 sm:gap-2">
        <button type="button" className="btn btn-secondary max-sm:w-9 max-sm:px-0" onClick={save} disabled={running || (!dirty && saved)} aria-label={!dirty && saved ? 'Saved' : 'Save workflow'}>
          {!dirty && saved ? <Check size={15} aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
          <span className="max-sm:sr-only">{!dirty && saved ? 'Saved' : 'Save'}</span>
        </button>
        {running && (
          <button type="button" className="btn btn-secondary max-sm:w-9 max-sm:px-0" onClick={cancel} aria-label="Cancel run">
            <Square size={13} aria-hidden="true" />
            <span className="max-sm:sr-only">Cancel</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary min-w-[8.5rem] max-sm:min-w-0"
          data-state={state}
          disabled={running}
          aria-disabled={!validation.ok || undefined}
          aria-describedby={!validation.ok ? 'run-blocked' : undefined}
          onClick={() => {
            if (!validation.ok) {
              useStore.getState().toast(`Can’t run yet: ${firstError}`, 'warning');
              select({ type: 'workflow' });
              return;
            }
            void runWorkflow();
          }}
        >
          <RunIcon size={15} className={running ? 'spin' : ''} aria-hidden="true" />
          {runLabel}
        </button>
        {!validation.ok && (
          <span id="run-blocked" className="sr-only">
            Can’t run yet: {firstError}
          </span>
        )}
        <Menu
          label="Workflow actions"
          trigger={<Ellipsis size={18} aria-hidden="true" />}
          triggerClassName="btn btn-ghost icon-btn"
          items={menuItems}
        />
      </div>
    </header>
  );
}
