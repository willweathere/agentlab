import { PAYLOAD_LABELS, ROLE_SPECS } from '../../engine/contracts';
import type { Analysis, EvidenceSet, Review, RunRecord, StageRecord, StageStatus, Summary, WorkflowDefinition, WorkflowInput } from '../../engine/types';
import { plural } from '../../engine/text';

/** Maps the live (or last) run onto the canvas. A stale run shows nothing, so old results never decorate an edited graph. */

export type EdgeState = 'idle' | 'active' | 'done' | 'warning' | 'failed' | 'skipped' | 'cancelled';

const nonEmptyLines = (t: string) => t.split(/\r?\n/).filter((l) => l.trim()).length;

export function describeInputShort(input: WorkflowInput): string {
  if (!input.primary.trim()) return 'Empty';
  switch (input.kind) {
    case 'dataset': {
      const rows = Math.max(nonEmptyLines(input.primary) - 1, 0);
      return `CSV, ${rows} ${plural(rows, 'row')}`;
    }
    case 'website': {
      const n = input.primary.split(/\r?\n/).filter((l) => /^[^:]{2,60}:\s*\S/.test(l.trim())).length;
      return `${n} ${plural(n, 'attribute')}`;
    }
    case 'content': {
      const n = [...input.primary.trim()].length;
      return `${n} characters`;
    }
  }
}

export function shortOutput(stage: StageRecord | undefined): string | null {
  const out = stage?.output;
  if (!out) return null;
  switch (out.type) {
    case 'evidence': {
      const n = (out.data as EvidenceSet).facts.length;
      return `${n} ${plural(n, 'fact')}`;
    }
    case 'analysis': {
      const a = out.data as Analysis;
      const n = a.observations.length + a.interpretations.length + a.recommendations.length + a.unavailable.length;
      return `${n} statements`;
    }
    case 'review': {
      const v = (out.data as Review).verdict;
      return v === 'pass' ? 'Review passed' : v === 'warn' ? 'Passed, warnings' : 'Review failed';
    }
    case 'summary': {
      const n = (out.data as Summary).points.length;
      return `${n} key ${plural(n, 'point')}`;
    }
    default:
      return null;
  }
}

export function liveRun(run: RunRecord | null, stale: boolean): RunRecord | null {
  return run && !stale ? run : null;
}

export function stageStatus(run: RunRecord | null, index: number): StageStatus | 'idle' {
  return run?.stages[index]?.status ?? 'idle';
}

/** State of the edge into node `target` (1 = first agent, n + 1 = report). */
export function edgeState(run: RunRecord | null, target: number, agentCount: number): EdgeState {
  if (!run) return 'idle';
  const source = run.stages[target - 2];
  const tint = (): EdgeState => (source?.status === 'warning' ? 'warning' : 'done');
  if (target <= agentCount) {
    const s = run.stages[target - 1];
    if (!s) return 'idle';
    switch (s.status) {
      case 'receiving':
      case 'running':
        return 'active';
      case 'passed':
      case 'warning':
      case 'failed':
        return tint();
      case 'skipped':
        return source?.status === 'failed' ? 'failed' : 'skipped';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'idle';
    }
  }
  const all = run.stages;
  const finished = all.every((s) => s.status === 'passed' || s.status === 'warning');
  if (run.status === 'running') return finished ? 'active' : 'idle';
  if (run.status === 'completed') return 'done';
  if (run.status === 'warning') return source?.status === 'warning' ? 'warning' : 'done';
  if (run.status === 'cancelled') return 'cancelled';
  return all[all.length - 1]?.status === 'failed' ? 'failed' : 'skipped';
}

/** What the edge out of node `source` carries: the contract before a run, the real payload after. */
export function edgeLabel(def: WorkflowDefinition, run: RunRecord | null, source: number): string {
  if (source === 0) return run ? describeInputShort(run.definition.input) : PAYLOAD_LABELS.input;
  const agent = def.agents[source - 1];
  const real = run ? shortOutput(run.stages[source - 1]) : null;
  if (real) return real;
  if (!agent) return '';
  const produces = ROLE_SPECS[agent.role].produces;
  return produces === 'review' ? 'Reviewed analysis' : PAYLOAD_LABELS[produces];
}

export function reportState(run: RunRecord | null): { label: string; detail: string } {
  if (!run) return { label: 'Not yet run', detail: 'Built from the stage outputs when the run finishes.' };
  switch (run.status) {
    case 'running':
      return { label: 'Waiting', detail: 'The report is built after the last stage.' };
    case 'completed':
      return { label: 'Ready', detail: `Built from ${run.stages.length} ${plural(run.stages.length, 'stage')}.` };
    case 'warning':
      return { label: 'Ready, with warnings', detail: `Built from ${run.stages.length} ${plural(run.stages.length, 'stage')}.` };
    case 'failed':
      return { label: 'Partial', detail: `Stopped at stage ${(run.failure?.stageIndex ?? 0) + 1}.` };
    case 'cancelled':
      return { label: 'Partial', detail: 'The run was cancelled.' };
  }
}
