import { AGENT_ROLES, INPUT_KINDS, type AgentConfig, type RunRecord, type WorkflowDefinition } from '../engine/types';

/**
 * localStorage persistence. Everything read back is treated as untrusted: malformed JSON,
 * missing fields, unknown roles and older shapes are repaired where that's safe and dropped
 * where it isn't, and each problem is reported so the UI can say what happened.
 */

const KEYS = {
  workflows: 'agentlab:v1:workflows',
  history: 'agentlab:v1:history',
  settings: 'agentlab:v1:settings',
  active: 'agentlab:v1:active',
} as const;

export const HISTORY_LIMIT = 30;

export interface Settings {
  stepDelayMs: number;
  motion: 'system' | 'reduce';
  drawerOpen: boolean;
  sidebarCollapsed: boolean;
}

export const DEFAULT_SETTINGS: Settings = { stepDelayMs: 600, motion: 'system', drawerOpen: true, sidebarCollapsed: false };

interface Stored<T> {
  version: 1;
  items: T[];
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readRaw(key: string, notices: string[], what: string): unknown {
  const s = storage();
  if (!s) return null;
  let text: string | null;
  try {
    text = s.getItem(key);
  } catch {
    notices.push(`Browser storage is blocked, so ${what} can't be loaded.`);
    return null;
  }
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    notices.push(`Saved ${what} were unreadable and have been set aside. Saving again will replace them.`);
    return null;
  }
}

function write(key: string, value: unknown): { ok: true } | { ok: false; reason: string } {
  const s = storage();
  if (!s) return { ok: false, reason: 'Browser storage is not available.' };
  try {
    s.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return { ok: false, reason: quota ? 'Browser storage is full.' : 'Browser storage refused the write.' };
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

function itemsOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw; // an older, unversioned shape
  if (isObj(raw) && Array.isArray(raw.items)) return raw.items;
  return [];
}

export function sanitizeWorkflow(raw: unknown): { workflow: WorkflowDefinition | null; repaired: string[] } {
  const repaired: string[] = [];
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return { workflow: null, repaired };
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > 1) return { workflow: null, repaired: ['it was saved by a newer version'] };
  const input = isObj(raw.input) ? raw.input : {};
  const kind = INPUT_KINDS.includes(input.kind as never) ? (input.kind as WorkflowDefinition['input']['kind']) : 'dataset';
  if (kind !== input.kind) repaired.push('unknown input type reset to dataset');
  const agents: AgentConfig[] = [];
  const seen = new Set<string>();
  for (const a of Array.isArray(raw.agents) ? raw.agents : []) {
    if (!isObj(a) || !AGENT_ROLES.includes(a.role as never)) {
      repaired.push('an agent with an unknown role was removed');
      continue;
    }
    let id = str(a.id) || `ag_${Math.random().toString(36).slice(2, 10)}`;
    if (seen.has(id)) id = `${id}_${agents.length}`;
    seen.add(id);
    agents.push({ id, name: str(a.name, 'Unnamed agent').slice(0, 80), role: a.role as AgentConfig['role'], instructions: str(a.instructions) });
  }
  const now = new Date().toISOString();
  const workflow: WorkflowDefinition = {
    schemaVersion: 1,
    id: raw.id,
    name: str(raw.name, 'Untitled workflow').slice(0, 80) || 'Untitled workflow',
    description: str(raw.description),
    templateId: typeof raw.templateId === 'string' ? raw.templateId : undefined,
    input: { kind, primary: str(input.primary), secondary: str(input.secondary), claims: str(input.claims) },
    agents,
    createdAt: str(raw.createdAt, now),
    updatedAt: str(raw.updatedAt, now),
  };
  return { workflow, repaired };
}

function sanitizeRun(raw: unknown): RunRecord | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.workflowId !== 'string') return null;
  if (!Array.isArray(raw.stages) || typeof raw.startedAt !== 'string' || typeof raw.status !== 'string') return null;
  if (!['completed', 'warning', 'failed', 'cancelled'].includes(raw.status)) return null; // drop runs saved mid-flight
  const { workflow } = sanitizeWorkflow(raw.definition);
  if (!workflow) return null;
  const stagesOk = raw.stages.every((s) => isObj(s) && typeof s.agentName === 'string' && typeof s.status === 'string' && Array.isArray(s.warnings));
  if (!stagesOk) return null;
  return { ...(raw as unknown as RunRecord), definition: workflow };
}

export function loadWorkflows(notices: string[]): WorkflowDefinition[] {
  const raw = readRaw(KEYS.workflows, notices, 'workflows');
  const out: WorkflowDefinition[] = [];
  let dropped = 0;
  let repairedCount = 0;
  for (const item of itemsOf(raw)) {
    const { workflow, repaired } = sanitizeWorkflow(item);
    if (!workflow) dropped++;
    else {
      if (repaired.length) repairedCount++;
      out.push(workflow);
    }
  }
  if (dropped) notices.push(`${dropped} saved ${dropped === 1 ? 'workflow was' : 'workflows were'} unreadable and skipped.`);
  if (repairedCount) notices.push(`${repairedCount} saved ${repairedCount === 1 ? 'workflow was' : 'workflows were'} repaired while loading (for example, unknown agent roles were removed).`);
  return out;
}

export function saveWorkflows(items: WorkflowDefinition[]) {
  return write(KEYS.workflows, { version: 1, items } satisfies Stored<WorkflowDefinition>);
}

export function loadHistory(notices: string[]): RunRecord[] {
  const raw = readRaw(KEYS.history, notices, 'run history');
  const items = itemsOf(raw);
  const out = items.map(sanitizeRun).filter((r): r is RunRecord => r !== null);
  if (out.length < items.length) notices.push(`${items.length - out.length} history ${items.length - out.length === 1 ? 'entry was' : 'entries were'} unreadable and skipped.`);
  return out.slice(0, HISTORY_LIMIT);
}

/** Saves history, dropping the oldest entries if storage is full. */
export function saveHistory(items: RunRecord[]): { ok: boolean; kept: number; reason?: string } {
  let list = items.slice(0, HISTORY_LIMIT);
  for (;;) {
    const r = write(KEYS.history, { version: 1, items: list } satisfies Stored<RunRecord>);
    if (r.ok) return { ok: true, kept: list.length };
    if (list.length <= 1) return { ok: false, kept: 0, reason: r.reason };
    list = list.slice(0, Math.floor(list.length / 2));
  }
}

export function loadSettings(notices: string[]): Settings {
  const raw = readRaw(KEYS.settings, notices, 'settings');
  if (!isObj(raw)) return { ...DEFAULT_SETTINGS };
  return {
    stepDelayMs: typeof raw.stepDelayMs === 'number' && raw.stepDelayMs >= 0 && raw.stepDelayMs <= 5000 ? raw.stepDelayMs : DEFAULT_SETTINGS.stepDelayMs,
    motion: raw.motion === 'reduce' ? 'reduce' : 'system',
    drawerOpen: typeof raw.drawerOpen === 'boolean' ? raw.drawerOpen : DEFAULT_SETTINGS.drawerOpen,
    sidebarCollapsed: typeof raw.sidebarCollapsed === 'boolean' ? raw.sidebarCollapsed : DEFAULT_SETTINGS.sidebarCollapsed,
  };
}

export function saveSettings(s: Settings) {
  return write(KEYS.settings, s);
}

export function loadActiveId(): string | null {
  try {
    return storage()?.getItem(KEYS.active) ?? null;
  } catch {
    return null;
  }
}

export function saveActiveId(id: string | null) {
  try {
    const s = storage();
    if (!s) return;
    if (id) s.setItem(KEYS.active, id);
    else s.removeItem(KEYS.active);
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

export function storageUsage(): number {
  const s = storage();
  if (!s) return 0;
  let bytes = 0;
  try {
    for (const key of Object.values(KEYS)) bytes += (s.getItem(key)?.length ?? 0) * 2;
  } catch {
    return 0;
  }
  return bytes;
}

export function clearAll() {
  const s = storage();
  try {
    for (const key of Object.values(KEYS)) s?.removeItem(key);
  } catch {
    /* ignore */
  }
}
