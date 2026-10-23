import { CircleAlert, Info } from 'lucide-react';
import { useId } from 'react';
import { INPUT_LABELS } from '../../engine/contracts';
import { sampleInput } from '../../engine/examples';
import { INPUT_KINDS, type InputKind } from '../../engine/types';
import { isRunning, useStore, validationOf } from '../../state/store';
import { useConfirm } from '../ui/Confirm';
import { INPUT_ICONS } from '../ui/icons';
import { Section } from './Section';

const CLAIMS_HELP = 'One per line. Statements someone wants in the final report. The Reviewer checks each against the evidence and flags anything unsupported.';

export function InputPanel() {
  const input = useStore((s) => s.workflow.input);
  const workflow = useStore((s) => s.workflow);
  const running = useStore(isRunning);
  const updateInput = useStore((s) => s.updateInput);
  const setKind = useStore((s) => s.setInputKind);
  const confirm = useConfirm();
  const labels = INPUT_LABELS[input.kind];
  const issues = validationOf(workflow).issues.filter((i) => i.field === 'input');
  const pId = useId();
  const sId = useId();
  const cId = useId();
  const hasContent = Boolean(input.primary.trim() || input.secondary.trim());

  const changeKind = async (kind: InputKind) => {
    if (kind === input.kind) return;
    if (hasContent) {
      const r = await confirm({
        title: `Switch to ${INPUT_LABELS[kind].kind.toLowerCase()} input?`,
        body: 'This clears the current input. Claims to verify are kept.',
        confirmLabel: 'Switch and clear',
        tone: 'danger',
      });
      if (r !== 'confirm') return;
    }
    setKind(kind);
  };

  const insertSample = async () => {
    if (hasContent) {
      const r = await confirm({
        title: 'Replace the input with sample data?',
        body: `The current ${labels.kind.toLowerCase()} input will be replaced with the fictional sample used by the bundled example.`,
        confirmLabel: 'Replace input',
      });
      if (r !== 'confirm') return;
    }
    updateInput(sampleInput(input.kind));
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="role-chip" style={{ ['--accent' as string]: 'var(--color-ink-2)' }} aria-hidden="true">
          {(() => {
            const Icon = INPUT_ICONS[input.kind];
            return <Icon size={16} strokeWidth={1.75} />;
          })()}
        </span>
        <div className="min-w-0">
          <div className="t-meta">Workflow input</div>
          <h2 className="text-[16px] font-[640] leading-tight" style={{ fontStretch: '106%' }}>
            {labels.kind}
          </h2>
        </div>
      </div>

      <fieldset disabled={running} className="mt-5 space-y-5">
        <div role="radiogroup" aria-label="Input type" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-well p-1">
          {INPUT_KINDS.map((k) => {
            const Icon = INPUT_ICONS[k];
            const checked = input.kind === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => changeKind(k)}
                className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[12.5px] font-[560] transition-colors ${checked ? 'bg-slab-3 text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-ink-3 hover:text-ink'}`}
              >
                <Icon size={14} aria-hidden="true" />
                {k === 'dataset' ? 'Dataset' : k === 'website' ? 'Website' : 'Post'}
              </button>
            );
          })}
        </div>

        {input.kind === 'website' && (
          <p className="flex gap-2 rounded-lg border border-line bg-well px-3 py-2 text-[12.5px] leading-snug text-ink-2">
            <Info size={14} className="mt-0.5 flex-none text-ink-3" aria-hidden="true" />
            AgentLab reviews the description you write here. It never visits, crawls or measures a live website.
          </p>
        )}

        <div>
          <div className="flex items-end justify-between gap-2">
            <label htmlFor={pId} className="label">
              {labels.primary}
            </label>
            <span className="t-mono mb-1.5 text-[11px] text-ink-3">{input.primary.length.toLocaleString('en-GB')} chars</span>
          </div>
          <textarea
            id={pId}
            className={`field ${input.kind === 'dataset' ? 'field-mono' : ''}`}
            rows={input.kind === 'content' ? 6 : 10}
            spellCheck={input.kind === 'content'}
            wrap={input.kind === 'dataset' ? 'off' : 'soft'}
            value={input.primary}
            aria-describedby={`${pId}-help`}
            onChange={(e) => updateInput({ primary: e.target.value })}
          />
          <p id={`${pId}-help`} className="mt-1.5 text-[12px] leading-snug text-ink-3">
            {labels.primaryHelp}
          </p>
        </div>

        {labels.secondary && (
          <div>
            <label htmlFor={sId} className="label">
              {labels.secondary}
            </label>
            <textarea id={sId} className="field field-mono" rows={7} spellCheck={false} value={input.secondary} aria-describedby={`${sId}-help`} onChange={(e) => updateInput({ secondary: e.target.value })} />
            <p id={`${sId}-help`} className="mt-1.5 text-[12px] leading-snug text-ink-3">
              {labels.secondaryHelp}
            </p>
          </div>
        )}

        <div>
          <label htmlFor={cId} className="label">
            Claims to verify <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <textarea id={cId} className="field" rows={3} value={input.claims} aria-describedby={`${cId}-help`} onChange={(e) => updateInput({ claims: e.target.value })} />
          <p id={`${cId}-help`} className="mt-1.5 text-[12px] leading-snug text-ink-3">
            {CLAIMS_HELP}
          </p>
        </div>

        <button type="button" className="btn btn-secondary btn-sm" onClick={insertSample}>
          Insert sample {labels.kind.toLowerCase()}
        </button>
      </fieldset>

      {issues.length > 0 && (
        <Section title="Validation">
          <ul className="space-y-2">
            {issues.map((i, k) => (
              <li key={k} className="flex gap-2 text-[13px] leading-snug">
                <CircleAlert size={14} className={`mt-0.5 flex-none ${i.level === 'error' ? 'text-error' : 'text-warning'}`} aria-hidden="true" />
                <span className="text-ink-2">{i.message}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
