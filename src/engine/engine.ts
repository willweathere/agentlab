import { PAYLOAD_LABELS, ROLE_SPECS, validateWorkflow } from './contracts';
import { describeApplied, notes, parseInstructions } from './directives';
import { PROCESSORS, StageError } from './processors';
import type { StageOutput } from './processors/shared';
import { plural } from './text';
import type {
  Envelope,
  ExecutionEvent,
  PayloadType,
  RunRecord,
  StageRecord,
  ValidationResult,
  WorkflowDefinition,
} from './types';

/**
 * Orchestration. Runs agents strictly in order, records each stage's status, timing, input and
 * output, stops at the first failure, supports cancellation, and refuses a second concurrent
 * run of the same workflow.
 */

export class ConcurrentRunError extends Error {
  constructor() {
    super('This workflow is already running. Wait for it to finish or cancel it first.');
    this.name = 'ConcurrentRunError';
  }
}

export class InvalidWorkflowError extends Error {
  constructor(readonly validation: ValidationResult) {
    const first = validation.issues.find((i) => i.level === 'error');
    super(first ? `The workflow can't run: ${first.message}` : "The workflow can't run.");
    this.name = 'InvalidWorkflowError';
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface RunOptions {
  /** A visible pause before each stage so people can follow the run. Not counted as processing. */
  stepDelayMs?: number;
  onEvent?: (event: ExecutionEvent) => void;
  signal?: AbortSignal;
}

/** FNV-1a over the parts of a definition that affect a run. */
export function hashDefinition(def: Pick<WorkflowDefinition, 'input' | 'agents'>): string {
  const text = JSON.stringify({ input: def.input, agents: def.agents });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function newRunId(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(16).slice(2, 10);
  return `run_${Date.now().toString(36)}_${rand}`;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

function describeOutput(out: StageOutput): string {
  switch (out.type) {
    case 'evidence': {
      const { facts, claims } = out.data;
      return `${facts.length} ${plural(facts.length, 'fact')}` + (claims.length ? `, ${claims.length} ${plural(claims.length, 'claim')} to verify` : '');
    }
    case 'analysis': {
      const a = out.data;
      const n = a.observations.length + a.interpretations.length + a.recommendations.length + a.unavailable.length;
      return `${n} statements: ${a.observations.length} observations, ${a.interpretations.length} interpretations, ${a.recommendations.length} recommendations, ${a.unavailable.length} gaps`;
    }
    case 'review': {
      const r = out.data;
      const failed = r.checks.filter((c) => c.status === 'fail').length;
      const warned = r.checks.filter((c) => c.status === 'warn').length;
      return r.verdict === 'pass'
        ? `Passed ${r.checks.length} checks`
        : r.verdict === 'warn'
          ? `Passed with ${warned} ${plural(warned, 'warning')}`
          : `Failed ${failed} of ${r.checks.length} checks`;
    }
    case 'summary':
      return `${out.data.points.length} key ${plural(out.data.points.length, 'point')}, ${out.data.next.length} next ${plural(out.data.next.length, 'step')}`;
  }
}

function describeInput(env: Envelope, types: PayloadType[]): string {
  return types
    .map((t) => {
      if (t === 'input') {
        const chars = env.input.primary.length + env.input.secondary.length;
        return `Workflow input (${chars.toLocaleString('en-GB')} characters)`;
      }
      if (t === 'evidence' && env.evidence) return `Evidence set (${env.evidence.facts.length} facts)`;
      if (t === 'analysis' && env.analysis) {
        const a = env.analysis;
        return `Analysis (${a.observations.length + a.interpretations.length + a.recommendations.length + a.unavailable.length} statements)`;
      }
      return PAYLOAD_LABELS[t];
    })
    .join(' + ');
}

export class WorkflowEngine {
  private active = new Map<string, AbortController>();

  isRunning(workflowId: string): boolean {
    return this.active.has(workflowId);
  }

  cancel(workflowId: string): boolean {
    const c = this.active.get(workflowId);
    if (!c) return false;
    c.abort();
    return true;
  }

  async run(definition: WorkflowDefinition, options: RunOptions = {}): Promise<RunRecord> {
    if (this.active.has(definition.id)) throw new ConcurrentRunError();
    const validation = validateWorkflow(definition);
    if (!validation.ok) throw new InvalidWorkflowError(validation);

    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onOuterAbort, { once: true });
    this.active.set(definition.id, controller);
    const { signal } = controller;
    const delay = Math.max(0, options.stepDelayMs ?? 0);
    const def: WorkflowDefinition = structuredClone(definition);

    const startWall = performance.now();
    const run: RunRecord = {
      id: newRunId(),
      workflowId: def.id,
      workflowName: def.name,
      definition: def,
      definitionHash: hashDefinition(def),
      status: 'running',
      startedAt: new Date().toISOString(),
      processingMs: 0,
      pacingMs: 0,
      stepDelayMs: delay,
      stages: def.agents.map<StageRecord>((a, index) => ({
        index, agentId: a.id, agentName: a.name, role: a.role, status: 'queued', warnings: [], directivesApplied: [], notes: [],
      })),
    };
    const emit = (event: DistributiveOmit<ExecutionEvent, 'run'>) => {
      options.onEvent?.({ ...event, run: structuredClone(run) } as ExecutionEvent);
    };
    const timedPause = async () => {
      const t = performance.now();
      await pause(delay, signal);
      run.pacingMs += performance.now() - t;
    };
    const cancelFrom = (index: number) => {
      for (const s of run.stages.slice(index)) if (['queued', 'receiving', 'running'].includes(s.status)) s.status = 'cancelled';
      const st = run.stages[index];
      run.failure = { stageIndex: index, agentName: st?.agentName ?? '', kind: 'cancelled', message: 'The run was cancelled.' };
    };

    const env: Envelope = { input: def.input, reviews: [] };
    const producedBy = new Map<PayloadType, string>([['input', 'Workflow input']]);

    try {
      emit({ type: 'run-started' });
      for (let i = 0; i < run.stages.length; i++) {
        const stage = run.stages[i];
        const agent = def.agents[i];
        if (signal.aborted) {
          cancelFrom(i);
          break;
        }

        stage.status = 'receiving';
        emit({ type: 'handoff', toIndex: i });
        await timedPause();
        if (signal.aborted) {
          cancelFrom(i);
          break;
        }

        const spec = ROLE_SPECS[agent.role];
        const parsed = parseInstructions(agent.role, agent.instructions, def.input.kind);
        stage.directivesApplied = describeApplied(parsed);
        stage.notes = notes(parsed);
        stage.input = {
          types: spec.consumes,
          from: spec.consumes.map((t) => producedBy.get(t) ?? 'unknown').filter((v, k, arr) => arr.indexOf(v) === k).join(' + '),
          summary: describeInput(env, spec.consumes),
        };
        stage.status = 'running';
        stage.startedAt = new Date().toISOString();
        const t0 = performance.now();
        emit({ type: 'stage-started', index: i });

        try {
          const out = await PROCESSORS[agent.role].run(env, {
            agent,
            parsed,
            signal,
            warn: (message) => stage.warnings.push(message),
          });
          const t1 = performance.now();
          stage.processingMs = t1 - t0;
          stage.endedAt = new Date().toISOString();
          run.processingMs += stage.processingMs;
          stage.output = { type: out.type, summary: describeOutput(out), data: out.data };

          switch (out.type) {
            case 'evidence': env.evidence = out.data; break;
            case 'analysis': env.analysis = out.data; break;
            case 'review': env.reviews.push(out.data); break;
            case 'summary': env.summary = out.data; break;
          }
          producedBy.set(out.type, agent.name);
          if (out.type === 'review') producedBy.set('analysis', `${producedBy.get('analysis')} (reviewed)`);

          if (out.type === 'review' && out.data.verdict === 'fail') {
            stage.status = 'failed';
            stage.error = out.data.summary;
            run.failure = { stageIndex: i, agentName: agent.name, kind: 'review', message: out.data.summary };
          } else if (stage.warnings.length || (out.type === 'review' && out.data.verdict === 'warn')) {
            stage.status = 'warning';
          } else {
            stage.status = 'passed';
          }
        } catch (e) {
          stage.processingMs = performance.now() - t0;
          stage.endedAt = new Date().toISOString();
          run.processingMs += stage.processingMs;
          stage.status = 'failed';
          stage.error = e instanceof StageError ? e.message : `Unexpected error: ${e instanceof Error ? e.message : String(e)}`;
          run.failure = { stageIndex: i, agentName: agent.name, kind: 'error', message: stage.error };
        }
        emit({ type: 'stage-finished', index: i });

        if (stage.status === 'failed') {
          for (const s of run.stages.slice(i + 1)) s.status = 'skipped';
          break;
        }
      }

      if (!run.failure && !signal.aborted) {
        emit({ type: 'report-handoff' });
        await timedPause();
      }
      if (signal.aborted && !run.failure) cancelFrom(run.stages.length - 1);
    } finally {
      this.active.delete(def.id);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }

    run.endedAt = new Date().toISOString();
    run.durationMs = performance.now() - startWall;
    run.status = run.failure
      ? run.failure.kind === 'cancelled' ? 'cancelled' : 'failed'
      : run.stages.some((s) => s.status === 'warning') ? 'warning' : 'completed';
    emit({ type: 'run-finished' });
    return run;
  }
}

export const engine = new WorkflowEngine();
