import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, CircleAlert, CircleMinus, MessageSquare, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { PAYLOAD_LABELS, ROLE_SPECS } from '../../engine/contracts';
import { DIRECTIVES, parseInstructions } from '../../engine/directives';
import { DEFAULT_INSTRUCTIONS } from '../../engine/examples';
import { formatDuration } from '../../engine/report';
import { AGENT_ROLES, type AgentConfig, type Analysis, type EvidenceSet, type Review, type StageRecord, type Summary } from '../../engine/types';
import { timeOfDay } from '../../lib/hooks';
import { isRunning, useStore, validationOf } from '../../state/store';
import { AnalysisView, EvidenceTable, ReviewView, SummaryView } from '../output/OutputView';
import { ROLE_ICONS, RoleChip } from '../ui/icons';
import { STAGE_STATUS, StatusPill } from '../ui/status';
import { Section } from './Section';

const LINE_STYLE = {
  directive: { Icon: Check, cls: 'text-success', label: 'Runs' },
  note: { Icon: MessageSquare, cls: 'text-ink-3', label: 'Note, not executed' },
  error: { Icon: CircleAlert, cls: 'text-error', label: 'Error' },
  inapplicable: { Icon: CircleMinus, cls: 'text-warning', label: 'Skipped for this input' },
} as const;

export function AgentPanel({ agent, stage, horizontal }: { agent: AgentConfig; stage: StageRecord | undefined; horizontal: boolean }) {
  const workflow = useStore((s) => s.workflow);
  const running = useStore(isRunning);
  const update = useStore((s) => s.updateAgent);
  const move = useStore((s) => s.moveAgent);
  const remove = useStore((s) => s.removeAgent);
  const index = workflow.agents.findIndex((a) => a.id === agent.id);
  const spec = ROLE_SPECS[agent.role];
  const parsed = parseInstructions(agent.role, agent.instructions, workflow.input.kind);
  const issues = validationOf(workflow).issues.filter((i) => i.agentId === agent.id);
  const nameId = useId();
  const instrId = useId();
  const roleId = useId();

  // Which earlier stage produces each payload this agent needs.
  const producer = (type: string) => {
    if (type === 'input') return 'Workflow input';
    for (let i = index - 1; i >= 0; i--) {
      if (ROLE_SPECS[workflow.agents[i].role].produces === type) return workflow.agents[i].name || `Stage ${i + 1}`;
    }
    return null;
  };

  const insertExample = (example: string) => {
    const text = agent.instructions.trim();
    update(agent.id, { instructions: text ? `${text}\n${example}` : example });
  };

  const Prev = horizontal ? ArrowLeft : ArrowUp;
  const Next = horizontal ? ArrowRight : ArrowDown;
  const status = stage ? STAGE_STATUS[stage.status] : null;

  return (
    <div className={`role-${agent.role}`}>
      <div className="flex items-center gap-3">
        <RoleChip role={agent.role} />
        <div className="min-w-0 flex-1">
          <div className="t-meta">
            Stage {index + 1} of {workflow.agents.length}
          </div>
          <h2 className="truncate text-[16px] font-[640] leading-tight" style={{ fontStretch: '106%' }}>
            {agent.name || 'Unnamed agent'}
          </h2>
        </div>
        {status && <StatusPill label={status.label} tone={status.tone} live={status.live} />}
      </div>

      {running && <p className="mt-3 rounded-lg border border-[oklch(0.7_0.19_292/0.3)] bg-[oklch(0.7_0.19_292/0.08)] px-3 py-2 text-[12.5px] text-[oklch(0.88_0.06_292)]">Editing is paused while the workflow runs.</p>}

      <fieldset disabled={running} className="mt-5 space-y-5">
        <div>
          <label htmlFor={nameId} className="label">
            Name
          </label>
          <input
            id={nameId}
            className="field"
            value={agent.name}
            maxLength={80}
            aria-invalid={!agent.name.trim()}
            onChange={(e) => update(agent.id, { name: e.target.value })}
          />
        </div>

        <div role="radiogroup" aria-labelledby={roleId}>
          <div id={roleId} className="label">
            Role
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {AGENT_ROLES.map((r) => {
              const Icon = ROLE_ICONS[r];
              const checked = agent.role === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => update(agent.id, { role: r })}
                  className={`role-${r} flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] transition-colors ${
                    checked ? 'border-[oklch(0.7_0.17_252/0.8)] bg-[oklch(0.7_0.17_252/0.1)] text-ink' : 'border-line bg-well text-ink-2 hover:border-line-strong hover:text-ink'
                  }`}
                >
                  <Icon size={15} strokeWidth={1.75} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                  {ROLE_SPECS[r].label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12.5px] leading-snug text-ink-3">{spec.summary}</p>
          {parsed.directives.length === 0 && agent.instructions.trim() && DEFAULT_INSTRUCTIONS[agent.role] && (
            <button type="button" className="btn btn-ghost btn-sm mt-1.5 -ml-2.5" onClick={() => update(agent.id, { instructions: DEFAULT_INSTRUCTIONS[agent.role] })}>
              Use the default {spec.label} instructions
            </button>
          )}
        </div>

        <div>
          <label htmlFor={instrId} className="label">
            Instructions
          </label>
          <textarea
            id={instrId}
            className="field"
            rows={6}
            spellCheck={false}
            value={agent.instructions}
            aria-describedby={`${instrId}-help`}
            aria-invalid={parsed.errors.length > 0}
            onChange={(e) => update(agent.id, { instructions: e.target.value })}
          />
          <p id={`${instrId}-help`} className="mt-1.5 text-[12px] leading-snug text-ink-3">
            Lines written as <span className="t-mono text-ink-2">key: value</span> are directives this agent runs. Anything else is kept as a note and not executed.
          </p>
          {parsed.lines.length > 0 && (
            <ul className="mt-3 space-y-1.5" aria-label="How each line is read">
              {parsed.lines.map((l) => {
                const st = LINE_STYLE[l.kind];
                return (
                  <li key={l.line} className="flex items-start gap-2 text-[12.5px] leading-snug">
                    <st.Icon size={13} className={`mt-[3px] flex-none ${st.cls}`} aria-label={st.label} />
                    <span className="min-w-0">
                      <span className={l.kind === 'note' ? 'text-ink-3' : 'text-ink-2'}>{l.kind === 'directive' ? l.message : l.text}</span>
                      {l.kind !== 'directive' && <span className={`block ${l.kind === 'error' ? 'text-[oklch(0.84_0.1_25)]' : 'text-ink-3'}`}>{l.message ?? st.label}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <details className="group mt-3 rounded-xl border border-line">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12.5px] font-[560] text-ink-2 hover:text-ink">
              <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden="true" />
              Directives a {spec.label} understands
            </summary>
            <ul className="space-y-2.5 border-t border-line px-3 py-3">
              {DIRECTIVES[agent.role].map((d) => (
                <li key={d.key} className="text-[12.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="t-mono text-ink">{d.example}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => insertExample(d.example)} aria-label={`Insert ${d.example}`}>
                      Insert
                    </button>
                  </div>
                  <p className="leading-snug text-ink-3">
                    {d.help}
                    {d.kinds && ` ${d.kinds.map((k) => (k === 'content' ? 'Social post' : k === 'website' ? 'Website' : 'Dataset')).join(' and ')} input only.`}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </fieldset>

      <Section title="Contract">
        <dl className="space-y-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Receives</dt>
            <dd className="text-right">
              {spec.consumes.map((c) => {
                const from = producer(c);
                return (
                  <span key={c} className="block">
                    <span className="text-ink">{PAYLOAD_LABELS[c]}</span>{' '}
                    <span className={from ? 'text-ink-3' : 'text-[oklch(0.84_0.1_25)]'}>{from ? `from ${from}` : 'no earlier stage produces this'}</span>
                  </span>
                );
              })}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Produces</dt>
            <dd className="text-ink">{PAYLOAD_LABELS[spec.produces]}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Processing</dt>
            <dd className="text-right text-ink">{spec.processing === 'deterministic' ? 'Deterministic' : 'Rule-based'}, no AI model</dd>
          </div>
        </dl>
      </Section>

      <Section title="Validation">
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-[13px] text-ink-2">
            <Check size={14} className="text-success" aria-hidden="true" /> Ready to run.
          </p>
        ) : (
          <ul className="space-y-2">
            {issues.map((i, k) => (
              <li key={k} className="flex gap-2 text-[13px] leading-snug">
                <CircleAlert size={14} className={`mt-0.5 flex-none ${i.level === 'error' ? 'text-error' : 'text-warning'}`} aria-label={i.level === 'error' ? 'Error' : 'Warning'} />
                <span className="text-ink-2">{i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Last run">{stage ? <StageDetails stage={stage} /> : <p className="text-[13px] text-ink-3">Not yet run. Results for this stage appear here after a run.</p>}</Section>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
        <button type="button" className="btn btn-secondary btn-sm" disabled={running || index === 0} onClick={() => move(agent.id, -1)}>
          <Prev size={14} aria-hidden="true" /> Move earlier
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={running || index === workflow.agents.length - 1} onClick={() => move(agent.id, 1)}>
          <Next size={14} aria-hidden="true" /> Move later
        </button>
        <button type="button" className="btn btn-danger btn-sm ml-auto" disabled={running} onClick={() => remove(agent.id)}>
          <Trash2 size={14} aria-hidden="true" /> Remove
        </button>
      </div>
    </div>
  );
}

function StageDetails({ stage }: { stage: StageRecord }) {
  const out = stage.output;
  return (
    <div className="space-y-3 text-[13px]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-ink-3">Started</dt>
        <dd className="t-mono text-right text-ink-2">{timeOfDay(stage.startedAt)}</dd>
        <dt className="text-ink-3">Ended</dt>
        <dd className="t-mono text-right text-ink-2">{timeOfDay(stage.endedAt)}</dd>
        <dt className="text-ink-3">Processing</dt>
        <dd className="t-mono text-right text-ink-2">{stage.processingMs !== undefined ? formatDuration(stage.processingMs) : '–'}</dd>
      </dl>
      {stage.input && (
        <p className="text-ink-2">
          <span className="text-ink-3">Input: </span>
          {stage.input.summary} <span className="text-ink-3">from {stage.input.from}</span>
        </p>
      )}
      {out && (
        <p className="text-ink-2">
          <span className="text-ink-3">Output: </span>
          {out.summary}
        </p>
      )}
      {stage.error && <p className="rounded-lg border border-[oklch(0.7_0.19_25/0.35)] bg-[oklch(0.7_0.19_25/0.08)] px-3 py-2 text-[oklch(0.88_0.08_25)]">{stage.error}</p>}
      {stage.warnings.map((w, i) => (
        <p key={i} className="rounded-lg border border-[oklch(0.83_0.15_80/0.3)] bg-[oklch(0.83_0.15_80/0.07)] px-3 py-2 text-[oklch(0.9_0.08_82)]">
          {w}
        </p>
      ))}
      {stage.directivesApplied.length > 0 && (
        <p className="text-ink-3">
          Applied: <span className="text-ink-2">{stage.directivesApplied.join('; ')}</span>
        </p>
      )}
      {stage.notes.length > 0 && <p className="text-ink-3">Notes recorded but not executed: {stage.notes.length}</p>}
      {out && (
        <details className="group rounded-xl border border-line">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12.5px] font-[560] text-ink-2 hover:text-ink">
            <ChevronRight size={14} className="transition-transform group-open:rotate-90" aria-hidden="true" />
            Show recorded output
          </summary>
          <div className="max-h-[420px] overflow-auto border-t border-line p-3">
            {out.type === 'evidence' && <EvidenceTable evidence={out.data as EvidenceSet} />}
            {out.type === 'analysis' && <AnalysisView analysis={out.data as Analysis} />}
            {out.type === 'review' && <ReviewView review={out.data as Review} />}
            {out.type === 'summary' && <SummaryView summary={out.data as Summary} />}
          </div>
        </details>
      )}
    </div>
  );
}
