import { CircleAlert, FileText } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { INPUT_LABELS, ROLE_SPECS } from '../../engine/contracts';
import type { AgentConfig, PayloadType, RunRecord, StageRecord, ValidationIssue, WorkflowInput } from '../../engine/types';
import { INPUT_ICONS, RoleChip } from '../ui/icons';
import { RUN_STATUS, STAGE_STATUS, StatusPill, type Tone } from '../ui/status';
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
  const descId = useId();

  // The card is a container; its name is a button stretched over the whole card, so the
  // accessible name is exactly the visible name and the rest reads as its description.
  return (
    <div
      data-node={agent.id}
      className={`agent-card role-${agent.role} group`}
      data-status={status === 'idle' ? undefined : status}
      data-selected={selected}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <span id={descId} className="sr-only">
        {`${spec.label}, stage ${index + 1} of ${count}. ${s.label}.${errors.length ? ` ${errors.length} configuration ${errors.length === 1 ? 'problem' : 'problems'}.` : ''}`}
      </span>
      <div className="flex items-start gap-3 px-4 pt-4">
        <RoleChip role={agent.role} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px]">
              <span className="t-mono text-[11px] text-ink-3">{String(index + 1).padStart(2, '0')}</span>
              <span style={{ color: 'var(--accent)' }}>{spec.label}</span>
            </span>
            <StatusPill label={s.label} tone={s.tone} live={s.live} />
          </div>
          <button
            type="button"
            className="card-hit mt-1 block w-full truncate text-left text-[15.5px] font-[620] leading-snug text-ink"
            aria-pressed={selected}
            aria-describedby={descId}
            onClick={onSelect}
          >
            {agent.name || 'Unnamed agent'}
          </button>
        </div>
      </div>
      <p
        className={`mt-2 line-clamp-2 px-4 text-[12.5px] leading-[1.45] ${stage?.error ? 'text-[oklch(0.84_0.1_25)]' : stage?.warnings.length ? 'text-[oklch(0.88_0.09_82)]' : 'text-ink-2'}`}
      >
        {message ?? spec.summary}
      </p>
      <dl className="mt-auto grid grid-cols-[2rem_minmax(0,1fr)] gap-y-0.5 border-t border-line px-4 py-2 t-mono text-[11px] leading-[1.5]">
        <dt className="text-ink-3">in</dt>
        <dd className="truncate text-ink-2">{inLabel}</dd>
        <dt className="text-ink-3">out</dt>
        <dd className={`truncate ${stage?.output ? 'text-ink' : 'text-ink-2'}`}>{outLabel}</dd>
      </dl>
      {errors.length > 0 && (
        <span className="pointer-events-none absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-[oklch(0.7_0.19_25/0.5)] bg-[oklch(0.3_0.08_25)] text-[oklch(0.9_0.08_25)]" aria-hidden="true">
          <CircleAlert size={14} />
        </span>
      )}
      <Ports orientation={orientation} />
    </div>
  );
}

/** Input and Report are drawn as round terminals at either end of the workflow. */
function Terminal({
  node,
  box,
  orientation,
  selected,
  tone,
  icon,
  title,
  caption,
  captionTone,
  description,
  onSelect,
  inPort,
  outPort,
}: {
  node: string;
  box: NodeBox;
  orientation: Orientation;
  selected: boolean;
  tone?: Tone;
  icon: ReactNode;
  title: string;
  caption: string;
  captionTone?: Tone;
  description: string;
  onSelect: () => void;
  inPort: boolean;
  outPort: boolean;
}) {
  const horizontal = orientation === 'horizontal';
  const width = horizontal ? 148 : 230;
  const descId = useId();
  return (
    <button
      type="button"
      data-node={node}
      aria-pressed={selected}
      aria-describedby={descId}
      onClick={onSelect}
      className={`terminal group absolute flex rounded-2xl text-left outline-offset-4 ${horizontal ? 'flex-col items-center' : 'flex-row items-center gap-3'}`}
      style={horizontal ? { left: box.x + box.w / 2 - width / 2, top: box.y, width } : { left: box.x, top: box.y, width }}
    >
      <span className="terminal-ring" data-tone={tone} data-selected={selected} style={{ width: box.w, height: box.h }}>
        {icon}
        <Ports orientation={orientation} inPort={inPort} outPort={outPort} />
      </span>
      <span className={`block min-w-0 ${horizontal ? 'mt-2.5 text-center' : ''}`}>
        <span className="block text-[13px] font-[620] leading-tight text-ink">{title}</span>
        <span className={`mt-0.5 block truncate t-mono text-[11px] ${captionTone ? `terminal-caption-${captionTone}` : 'text-ink-3'}`}>{caption}</span>
      </span>
      <span id={descId} className="sr-only">
        {description}
      </span>
    </button>
  );
}

export function InputNode({ input, box, orientation, selected, hasError, onSelect }: { input: WorkflowInput; box: NodeBox; orientation: Orientation; selected: boolean; hasError: boolean; onSelect: () => void }) {
  const Icon = INPUT_ICONS[input.kind];
  const labels = INPUT_LABELS[input.kind];
  const caption = hasError ? 'Needs attention' : describeInputShort(input);
  return (
    <Terminal
      node="input"
      box={box}
      orientation={orientation}
      selected={selected}
      tone={hasError ? 'warning' : undefined}
      icon={<Icon size={20} strokeWidth={1.6} aria-hidden="true" />}
      title={labels.kind}
      caption={caption}
      captionTone={hasError ? 'warning' : undefined}
      description="Workflow input. Select to edit."
      onSelect={onSelect}
      inPort={false}
      outPort
    />
  );
}

export function ReportNode({ run, box, orientation, selected, onSelect }: { run: RunRecord | null; box: NodeBox; orientation: Orientation; selected: boolean; onSelect: () => void }) {
  const state = reportState(run);
  const st = run ? RUN_STATUS[run.status] : null;
  const tone = st && st.tone !== 'muted' ? st.tone : undefined;
  return (
    <Terminal
      node="report"
      box={box}
      orientation={orientation}
      selected={selected}
      tone={tone}
      icon={<FileText size={20} strokeWidth={1.6} aria-hidden="true" />}
      title="Report"
      caption={state.label}
      captionTone={tone}
      description={`Report. ${state.detail}`}
      onSelect={onSelect}
      inPort
      outPort={false}
    />
  );
}

