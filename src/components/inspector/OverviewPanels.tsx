import { Check, CircleAlert, FileDown, FileText, MousePointerClick } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'wouter';
import { ROLE_SPECS } from '../../engine/contracts';
import { buildReport, exportReport, formatDuration, formatTimestamp } from '../../engine/report';
import { downloadText, slug } from '../../lib/hooks';
import { isRunning, isRunStale, useStore, validationOf } from '../../state/store';
import { RoleChip } from '../ui/icons';
import { RUN_STATUS, STAGE_STATUS, StatusPill } from '../ui/status';
import { Section } from './Section';

const LEGEND = [
  { tone: 'activity', label: 'Activity', text: 'a stage is receiving input or running' },
  { tone: 'selected', label: 'Selected', text: 'the stage open in this panel' },
  { tone: 'success', label: 'Success', text: 'the stage passed' },
  { tone: 'warning', label: 'Warning', text: 'passed, with something to check' },
  { tone: 'error', label: 'Error', text: 'the stage failed and the run stopped' },
] as const;

export function OverviewPanel() {
  const workflow = useStore((s) => s.workflow);
  const select = useStore((s) => s.select);
  const setDescription = useStore((s) => s.setDescription);
  const running = useStore(isRunning);
  const run = useStore((s) => s.run);
  const stale = useStore(isRunStale);
  const validation = validationOf(workflow);
  const descId = useId();

  return (
    <div>
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-4">
        <MousePointerClick size={18} className="mt-0.5 flex-none text-ink-3" aria-hidden="true" />
        <div>
          <h2 className="text-[14px] font-[620]">Nothing selected</h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">Select the input, a stage or the report on the canvas to inspect and edit it.</p>
        </div>
      </div>

      <Section title="Workflow">
        <label htmlFor={descId} className="label">
          Description
        </label>
        <textarea
          id={descId}
          className="field"
          rows={3}
          disabled={running}
          value={workflow.description}
          placeholder="What this workflow is for"
          onChange={(e) => setDescription(e.target.value)}
        />
      </Section>

      <Section title={`Stages (${workflow.agents.length})`}>
        {workflow.agents.length === 0 ? (
          <p className="text-[13px] text-ink-3">No agents yet. Add one from the canvas.</p>
        ) : (
          <ol className="space-y-1">
            {workflow.agents.map((a, i) => {
              const st = run && !stale ? run.stages.find((s) => s.agentId === a.id) : undefined;
              const s = st ? STAGE_STATUS[st.status] : null;
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => select({ type: 'agent', id: a.id })} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slab-2">
                    <span className="t-mono w-5 text-[11px] text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                    <RoleChip role={a.role} size={13} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{a.name || 'Unnamed agent'}</span>
                      <span className="block text-[11.5px] text-ink-3">{ROLE_SPECS[a.role].label}</span>
                    </span>
                    {s && <StatusPill label={s.label} tone={s.tone} live={s.live} />}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <Section title="Validation">
        {validation.issues.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-ink-2">
            <Check size={14} className="text-success" aria-hidden="true" /> The workflow is valid and ready to run.
          </p>
        ) : (
          <ul className="space-y-2">
            {validation.issues.map((i, k) => (
              <li key={k} className="flex gap-2 text-[13px] leading-snug">
                <CircleAlert size={14} className={`mt-0.5 flex-none ${i.level === 'error' ? 'text-error' : 'text-warning'}`} aria-label={i.level === 'error' ? 'Error' : 'Warning'} />
                <span className="text-ink-2">{i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Reading the canvas">
        <ul className="space-y-2">
          {LEGEND.map((l) => (
            <li key={l.tone} className="flex items-center gap-2.5 text-[12.5px]">
              <StatusPill label={l.label} tone={l.tone} />
              <span className="text-ink-3">{l.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] leading-snug text-ink-3">Connections light up only while the engine is handing a payload to the next stage, and afterwards show what actually crossed them.</p>
      </Section>
    </div>
  );
}

export function ReportPanel() {
  const run = useStore((s) => s.run);
  const stale = useStore(isRunStale);
  const runWorkflow = useStore((s) => s.runWorkflow);
  const valid = useStore((s) => validationOf(s.workflow).ok);

  if (!run || run.status === 'running') {
    return (
      <div>
        <PanelHead title="Report" />
        <div className="mt-5 rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center">
          <p className="text-[14px] font-[600]">{run ? 'The run is in progress' : 'Not yet run'}</p>
          <p className="mx-auto mt-1 max-w-[260px] text-[12.5px] leading-snug text-ink-3">The report is assembled from the stages’ recorded outputs once the last stage finishes.</p>
          {!run && (
            <button type="button" className="btn btn-primary mt-4" disabled={!valid} onClick={() => void runWorkflow()}>
              Run workflow
            </button>
          )}
        </div>
      </div>
    );
  }

  const report = buildReport(run);
  const st = RUN_STATUS[run.status];
  const download = (kind: 'md' | 'txt') =>
    downloadText(`${slug(run.workflowName)}-report.${kind}`, exportReport(report, kind), kind === 'md' ? 'text/markdown' : 'text/plain');

  return (
    <div>
      <PanelHead title="Report" />
      {stale && <p className="mt-4 rounded-lg border border-line bg-well px-3 py-2 text-[12.5px] text-ink-2">This report is from before your latest edits. Run again to update it.</p>}
      <div className="mt-4 flex items-center gap-2">
        <StatusPill label={st.label} tone={st.tone} />
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-ink-3">Started</dt>
        <dd className="t-mono text-right text-ink-2">{formatTimestamp(run.startedAt)}</dd>
        <dt className="text-ink-3">Duration</dt>
        <dd className="t-mono text-right text-ink-2">{formatDuration(run.durationMs)}</dd>
        <dt className="text-ink-3">Stages completed</dt>
        <dd className="t-mono text-right text-ink-2">
          {report.stagesCompleted} of {report.stagesTotal}
        </dd>
        <dt className="text-ink-3">Recommendations</dt>
        <dd className="t-mono text-right text-ink-2">{report.recommendations.available ? report.recommendations.items.length : 'n/a'}</dd>
      </dl>
      {report.failure && <p className="mt-4 rounded-lg border border-[oklch(0.7_0.19_25/0.35)] bg-[oklch(0.7_0.19_25/0.08)] px-3 py-2 text-[13px] text-[oklch(0.88_0.08_25)]">Stopped at stage {report.failure.stage}, {report.failure.agentName}: {report.failure.message}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/runs/${run.id}`} className="btn btn-primary">
          <FileText size={15} aria-hidden="true" /> Open report
        </Link>
        <button type="button" className="btn btn-secondary" onClick={() => download('md')}>
          <FileDown size={15} aria-hidden="true" /> Markdown
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => download('txt')}>
          <FileDown size={15} aria-hidden="true" /> Text
        </button>
      </div>
    </div>
  );
}

function PanelHead({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="role-chip" style={{ ['--accent' as string]: 'oklch(0.85 0.05 252)' }} aria-hidden="true">
        <FileText size={16} strokeWidth={1.75} />
      </span>
      <div>
        <div className="t-meta">Output</div>
        <h2 className="text-[16px] font-[640] leading-tight" style={{ fontStretch: '106%' }}>
          {title}
        </h2>
      </div>
    </div>
  );
}
