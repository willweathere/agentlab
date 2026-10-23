import { create } from 'zustand';
import { ROLE_SPECS, validateWorkflow } from '../engine/contracts';
import { ConcurrentRunError, engine, hashDefinition, InvalidWorkflowError } from '../engine/engine';
import { blankWorkflow, DEFAULT_INSTRUCTIONS, EXAMPLES, newId, workflowFromExample } from '../engine/examples';
import type { AgentConfig, AgentRole, InputKind, RunRecord, ValidationResult, WorkflowDefinition, WorkflowInput } from '../engine/types';
import {
  clearAll,
  DEFAULT_SETTINGS,
  HISTORY_LIMIT,
  loadActiveId,
  loadHistory,
  loadSettings,
  loadWorkflows,
  saveActiveId,
  saveHistory,
  saveSettings,
  saveWorkflows,
  type Settings,
} from './persistence';

export type Selection = { type: 'agent'; id: string } | { type: 'input' } | { type: 'report' } | { type: 'workflow' } | null;

export interface Toast {
  id: number;
  message: string;
  tone: 'neutral' | 'success' | 'warning' | 'error';
  action?: { label: string; run: () => void };
}

interface State {
  workflow: WorkflowDefinition;
  /** Hash at load or last save. The workflow has unsaved changes when the current hash differs. */
  baseline: string;
  selection: Selection;
  run: RunRecord | null;
  runError: string | null;
  saved: WorkflowDefinition[];
  history: RunRecord[];
  settings: Settings;
  notices: string[];
  toasts: Toast[];
  lastRemoved: { agent: AgentConfig; index: number } | null;
}

interface Actions {
  rename(name: string): void;
  setDescription(text: string): void;
  updateInput(patch: Partial<WorkflowInput>): void;
  setInputKind(kind: InputKind): void;
  addAgent(role: AgentRole, index?: number): string;
  addStandardAgents(): void;
  updateAgent(id: string, patch: Partial<Omit<AgentConfig, 'id'>>): void;
  removeAgent(id: string): void;
  undoRemove(): void;
  moveAgent(id: string, delta: -1 | 1): void;
  select(sel: Selection): void;
  newWorkflow(): void;
  loadExample(exampleId: string): void;
  openSaved(id: string): void;
  save(): void;
  duplicate(): void;
  deleteSaved(id: string): void;
  resetToTemplate(): void;
  runWorkflow(): Promise<void>;
  cancelRun(): void;
  restartRun(): Promise<void>;
  clearHistory(): void;
  updateSettings(patch: Partial<Settings>): void;
  resetEverything(): void;
  toast(message: string, tone?: Toast['tone'], action?: Toast['action']): void;
  dismissToast(id: number): void;
  dismissNotices(): void;
}

export type Store = State & Actions;

const hashOf = (w: WorkflowDefinition) => hashDefinition(w) + ':' + w.name + ':' + w.description;
let toastSeq = 0;

function initialState(): State {
  const notices: string[] = [];
  const saved = loadWorkflows(notices);
  const history = loadHistory(notices);
  const settings = loadSettings(notices);
  const activeId = loadActiveId();
  const active = saved.find((w) => w.id === activeId);
  const workflow = active ? structuredClone(active) : workflowFromExample(EXAMPLES[0]);
  return {
    workflow,
    baseline: hashOf(workflow),
    selection: null,
    run: history.find((r) => r.workflowId === workflow.id) ?? null,
    runError: null,
    saved,
    history,
    settings,
    notices,
    toasts: [],
    lastRemoved: null,
  };
}

export const useStore = create<Store>()((set, get) => {
  /** Apply an edit to the working copy. Edits are refused while the workflow is running. */
  const edit = (fn: (w: WorkflowDefinition) => WorkflowDefinition) => {
    if (isRunning(get())) {
      get().toast('Editing is paused while the workflow runs.', 'warning');
      return false;
    }
    set((s) => ({ workflow: { ...fn(s.workflow), updatedAt: new Date().toISOString() }, runError: null }));
    return true;
  };

  const switchTo = (workflow: WorkflowDefinition) => {
    if (isRunning(get())) {
      get().toast('Cancel the current run before opening another workflow.', 'warning');
      return;
    }
    set({
      workflow,
      baseline: hashOf(workflow),
      selection: null,
      run: get().history.find((r) => r.workflowId === workflow.id) ?? null,
      runError: null,
      lastRemoved: null,
    });
    saveActiveId(get().saved.some((w) => w.id === workflow.id) ? workflow.id : null);
  };

  const persistSaved = (saved: WorkflowDefinition[]) => {
    const r = saveWorkflows(saved);
    if (!r.ok) get().toast(`Couldn't save to this browser: ${r.reason}`, 'error');
    return r.ok;
  };

  return {
    ...initialState(),

    rename: (name) => edit((w) => ({ ...w, name })),
    setDescription: (description) => edit((w) => ({ ...w, description })),
    updateInput: (patch) => edit((w) => ({ ...w, input: { ...w.input, ...patch } })),
    setInputKind: (kind) => edit((w) => ({ ...w, input: { kind, primary: '', secondary: '', claims: w.input.claims } })),

    addAgent: (role, index) => {
      const id = newId('ag');
      const count = get().workflow.agents.filter((a) => a.role === role).length;
      const agent: AgentConfig = { id, role, name: `${ROLE_SPECS[role].label}${count ? ` ${count + 1}` : ''}`, instructions: DEFAULT_INSTRUCTIONS[role] };
      const ok = edit((w) => {
        const agents = [...w.agents];
        agents.splice(index ?? agents.length, 0, agent);
        return { ...w, agents };
      });
      if (ok) set({ selection: { type: 'agent', id } });
      return id;
    },

    addStandardAgents: () => {
      edit((w) => ({
        ...w,
        agents: [
          ...w.agents,
          ...(['researcher', 'analyst', 'reviewer'] as const).map((role) => ({ id: newId('ag'), role, name: ROLE_SPECS[role].label, instructions: DEFAULT_INSTRUCTIONS[role] })),
        ],
      }));
    },

    updateAgent: (id, patch) => edit((w) => ({ ...w, agents: w.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),

    removeAgent: (id) => {
      const { workflow } = get();
      const index = workflow.agents.findIndex((a) => a.id === id);
      if (index < 0) return;
      const agent = workflow.agents[index];
      if (!edit((w) => ({ ...w, agents: w.agents.filter((a) => a.id !== id) }))) return;
      set((s) => ({ lastRemoved: { agent, index }, selection: s.selection?.type === 'agent' && s.selection.id === id ? null : s.selection }));
      get().toast(`Removed ${agent.name}.`, 'neutral', { label: 'Undo', run: () => get().undoRemove() });
    },

    undoRemove: () => {
      const r = get().lastRemoved;
      if (!r) return;
      if (edit((w) => {
        const agents = [...w.agents];
        agents.splice(Math.min(r.index, agents.length), 0, r.agent);
        return { ...w, agents };
      })) set({ lastRemoved: null, selection: { type: 'agent', id: r.agent.id } });
    },

    moveAgent: (id, delta) =>
      edit((w) => {
        const i = w.agents.findIndex((a) => a.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= w.agents.length) return w;
        const agents = [...w.agents];
        [agents[i], agents[j]] = [agents[j], agents[i]];
        return { ...w, agents };
      }),

    select: (selection) => set({ selection }),

    newWorkflow: () => switchTo(blankWorkflow()),
    loadExample: (exampleId) => {
      const ex = EXAMPLES.find((e) => e.id === exampleId);
      if (ex) switchTo(workflowFromExample(ex));
    },
    openSaved: (id) => {
      const w = get().saved.find((x) => x.id === id);
      if (w) switchTo(structuredClone(w));
    },

    save: () => {
      const { workflow, saved } = get();
      if (!workflow.name.trim()) {
        get().toast('Give the workflow a name before saving.', 'warning');
        return;
      }
      const next = saved.some((w) => w.id === workflow.id)
        ? saved.map((w) => (w.id === workflow.id ? workflow : w))
        : [workflow, ...saved];
      if (!persistSaved(next)) return;
      set({ saved: next, baseline: hashOf(workflow) });
      saveActiveId(workflow.id);
      get().toast('Saved to this browser.', 'success');
    },

    duplicate: () => {
      const { workflow } = get();
      const now = new Date().toISOString();
      const copy: WorkflowDefinition = {
        ...structuredClone(workflow),
        id: newId('wf'),
        name: `${workflow.name} (copy)`.slice(0, 80),
        agents: workflow.agents.map((a) => ({ ...a, id: newId('ag') })),
        createdAt: now,
        updatedAt: now,
      };
      switchTo(copy);
      set({ baseline: '' });
      get().toast('Duplicated. Save the copy to keep it.', 'neutral');
    },

    deleteSaved: (id) => {
      const next = get().saved.filter((w) => w.id !== id);
      if (!persistSaved(next)) return;
      set({ saved: next });
      if (get().workflow.id === id) {
        saveActiveId(null);
        set({ baseline: '' });
      }
      get().toast('Workflow deleted from this browser.', 'neutral');
    },

    resetToTemplate: () => {
      const { workflow } = get();
      const ex = EXAMPLES.find((e) => e.id === workflow.templateId);
      if (!ex) return;
      const fresh = workflowFromExample(ex);
      edit((w) => ({ ...w, name: ex.name, description: ex.description, input: fresh.input, agents: fresh.agents }));
      set({ selection: null });
      get().toast('Reset to the example’s defaults. Save to keep this version.', 'neutral');
    },

    runWorkflow: async () => {
      const { workflow, settings } = get();
      if (engine.isRunning(workflow.id)) {
        get().toast('This workflow is already running.', 'warning');
        return;
      }
      set({ runError: null });
      try {
        const record = await engine.run(workflow, {
          stepDelayMs: settings.stepDelayMs,
          onEvent: (e) => {
            if (get().workflow.id === e.run.workflowId) set({ run: e.run });
          },
        });
        const history = [record, ...get().history.filter((r) => r.id !== record.id)].slice(0, HISTORY_LIMIT);
        const saved = saveHistory(history);
        set({ history: history.slice(0, saved.kept || history.length) });
        if (!saved.ok) get().toast(`The run finished but couldn't be added to history: ${saved.reason}`, 'error');
        else if (saved.kept < history.length) get().toast('History was full, so older runs were removed.', 'warning');
      } catch (e) {
        if (e instanceof InvalidWorkflowError) set({ runError: e.message });
        else if (e instanceof ConcurrentRunError) get().toast(e.message, 'warning');
        else set({ runError: `The run couldn't start: ${e instanceof Error ? e.message : String(e)}` });
      }
    },

    cancelRun: () => {
      engine.cancel(get().workflow.id);
    },

    restartRun: async () => {
      const id = get().workflow.id;
      if (engine.isRunning(id)) {
        engine.cancel(id);
        await waitUntil(() => !engine.isRunning(id));
      }
      await get().runWorkflow();
    },

    clearHistory: () => {
      saveHistory([]);
      set({ history: [] });
      get().toast('History cleared.', 'neutral');
    },

    updateSettings: (patch) => {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      saveSettings(settings);
    },

    resetEverything: () => {
      if (isRunning(get())) engine.cancel(get().workflow.id);
      clearAll();
      const workflow = workflowFromExample(EXAMPLES[0]);
      set({
        workflow, baseline: hashOf(workflow), selection: null, run: null, runError: null, saved: [], history: [],
        settings: { ...DEFAULT_SETTINGS }, notices: [], lastRemoved: null,
      });
      get().toast('All AgentLab data in this browser was removed.', 'neutral');
    },

    toast: (message, tone = 'neutral', action) => {
      const id = ++toastSeq;
      set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone, action }] }));
      setTimeout(() => get().dismissToast(id), action ? 7000 : 4000);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    dismissNotices: () => set({ notices: [] }),
  };
});

function waitUntil(cond: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => (cond() ? resolve() : setTimeout(tick, 16));
    tick();
  });
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function isRunning(s: Pick<State, 'run' | 'workflow'>): boolean {
  return s.run?.status === 'running' && s.run.workflowId === s.workflow.id;
}

export function isDirty(s: Pick<State, 'workflow' | 'baseline'>): boolean {
  return hashOf(s.workflow) !== s.baseline;
}

export function isSavedWorkflow(s: Pick<State, 'workflow' | 'saved'>): boolean {
  return s.saved.some((w) => w.id === s.workflow.id);
}

/** The run is stale when the workflow has been edited since it ran. */
export function isRunStale(s: Pick<State, 'workflow' | 'run'>): boolean {
  return !!s.run && s.run.status !== 'running' && s.run.definitionHash !== hashDefinition(s.workflow);
}

const validationCache = new WeakMap<WorkflowDefinition, ValidationResult>();
export function validationOf(w: WorkflowDefinition): ValidationResult {
  let v = validationCache.get(w);
  if (!v) {
    v = validateWorkflow(w);
    validationCache.set(w, v);
  }
  return v;
}
