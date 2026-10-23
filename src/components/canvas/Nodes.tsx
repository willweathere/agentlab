import { CircleAlert, FileText } from 'lucide-react';
import { INPUT_LABELS, ROLE_SPECS } from '../../engine/contracts';
import type { AgentConfig, PayloadType, RunRecord, StageRecord, ValidationIssue, WorkflowInput } from '../../engine/types';
import { INPUT_ICONS, RoleChip } from '../ui/icons';
import { RUN_STATUS, STAGE_STATUS, StatusPill } from '../ui/status';
import type { NodeBox, Orientation } from './layout';
import { describeInputShort, reportState, shortOutput } from './runView';

const SHORT: Record<PayloadType, string> = { input: 'Input', evidence: 'Evidence', analysis: 'Analysis', review: 'Verdict', summary: 'Summary' };

function Ports({ orientation, inPort = true, outPort = true }: { orientation: Orientation; inPort?: boolean; outPort?: boolean }) {
  const h = orientation === 'horizontal';
  return (
    <>
      {inPort && <span className="port" aria-hidden="true" style={h ? { left: -5, top: 'calc(50% - 4.5px)' } : { top: -5, left: 'calc(50% - 4.5px)' }} />}
      {outPort && <span className="port" aria-hidden="true" style={h ? { right: -5, top: 'calc(50% - 4.5px)' } : { bottom: -5, left: 'calc(50% - 4.5px)' }} />}
    </>
  );
}

export function AgentCard({
  agent,
  index,
  count,
  box,
  orientation,
  stage,
  selected,
  issues,
  onSelect,
}: {
  agent: AgentConfig;
  index: number;
  count: number;
  box: NodeBox;
  orientation: Orientation;
  stage: StageRecord | undefined;
  selected: boolean;
  issues: ValidationIssue[];
  onSelect: () => void;
}) {
  const spec = ROLE_SPECS[agent.role];
  const status = stage?.status ?? 'idle';
  const s = STAGE_STATUS[status];
  const errors = issues.filter((i) => i.level === 'error');
  const inLabel = spec.consumes.map((c) => SHORT[c]).join(' + ');
  const outLabel = shortOutput(stage) ?? SHORT[spec.produces];
  const message = stage?.error ?? stage?.warnings[0];

  return (
    <button
      type="button"
      data-node={agent.id}
      className={`agent-card role-${agent.role} group`}
      data-status={status === 'idle' ? undefined : status}
      data-selected={selected}
      aria-pressed={selected}
      aria-label={`${agent.name}. ${spec.label}, stage ${index + 1} of ${count}. ${s.label}.${errors.length ? ` ${errors.length} configuration ${errors.length === 1 ? 'problem' : 'problems'}.` : ''}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <RoleChip role={agent.role} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="t-meta flex items-center gap-1.5 whitespace-nowrap">
              <span className="t-mono text-[11px] text-ink-3">{String(index + 1).padStart(2, '0')}</span>
              <span style={{ color: 'var(--accent)' }}>{spec.label}</span>
            </span>
            <StatusPill label={s.label} tone={s.tone} live={s.live} />
          </div>
          <div className="mt-1 truncate text-[15px] font-[620] leading-snug text-ink">{agent.name || 'Unnamed agent'}</div>
        </div>
      </div>
      <p
        className={`mt-2.5 line-clamp-2 px-4 text-[12.5px] leading-[1.45] ${stage?.error ? 'text-[oklch(0.84_0.1_25)]' : stage?.warnings.length ? 'text-[oklch(0.88_0.09_82)]' : 'text-ink-2'}`}
      >
        {message ?? spec.summary}
      </p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 t-mono text-[11px] text-ink-3">
        <span className="min-w-0 truncate">
          in <span className="text-ink-2">{inLabel}</span>
        </span>
        <span className="min-w-0 truncate text-right">
          out <span className="text-ink-2">{outLabel}</span>
        </span>
      </div>
      {errors.length > 0 && (
        <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-[oklch(0.7_0.19_25/0.5)] bg-[oklch(0.3_0.08_25)] text-[oklch(0.9_0.08_25)]" aria-hidden="true">
          <CircleAlert size={14} />
        </span>
      )}
      <Ports orientation={orientation} />
    </button>
  );
}

export function InputNode({ input, box, orientation, selected, hasError, onSelect }: { input: WorkflowInput; box: NodeBox; orientation: Orientation; selected: boolean; hasError: boolean; onSelect: () => void }) {
  const Icon = INPUT_ICONS[input.kind];
  const labels = INPUT_LABELS[input.kind];
  return (
    <button
      type="button"
      data-node="input"
      className="agent-card"
      data-selected={selected}
      aria-pressed={selected}
      aria-label={`Workflow input: ${labels.kind}, ${describeInputShort(input)}.${hasError ? ' Needs attention.' : ''} Select to edit.`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="role-chip" style={{ ['--accent' as string]: 'var(--color-ink-2)' }} aria-hidden="true">
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="t-meta">Input</div>
          <div className="truncate text-[15px] font-[620] leading-snug">{labels.kind}</div>
        </div>
      </div>
      <p className={`mt-3 px-4 t-mono text-[11.5px] ${hasError ? 'text-[oklch(0.88_0.09_82)]' : 'text-ink-2'}`}>{hasError ? 'Needs attention' : describeInputShort(input)}</p>
      <div className="mt-auto border-t border-line px-4 py-2.5 t-mono text-[11px] text-ink-3">
        out <span className="text-ink-2">Workflow input</span>
      </div>
      <Ports orientation={orientation} inPort={false} />
    </button>
  );
}

export function ReportNode({ run, box, orientation, selected, onSelect }: { run: RunRecord | null; box: NodeBox; orientation: Orientation; selected: boolean; onSelect: () => void }) {
  const state = reportState(run);
  const tone = run ? RUN_STATUS[run.status] : null;
  return (
    <button
      type="button"
      data-node="report"
      className="agent-card"
      data-selected={selected}
      data-status={run?.status === 'failed' ? 'failed' : undefined}
      aria-pressed={selected}
      aria-label={`Report: ${state.label}. ${state.detail}`}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="role-chip" style={{ ['--accent' as string]: 'oklch(0.85 0.05 252)' }} aria-hidden="true">
          <FileText size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="t-meta">Output</div>
          <div className="truncate text-[15px] font-[620] leading-snug">Report</div>
        </div>
      </div>
      <div className="mt-3 px-4">
        {tone ? <StatusPill label={state.label} tone={tone.tone} live={tone.live} /> : <span className="t-mono text-[11.5px] text-ink-3">{state.label}</span>}
      </div>
      <div className="mt-auto border-t border-line px-4 py-2.5 t-mono text-[11px] text-ink-3 truncate">{state.detail}</div>
      <Ports orientation={orientation} outPort={false} />
    </button>
  );
}
