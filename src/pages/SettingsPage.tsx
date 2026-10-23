import { useState } from 'react';
import { storageUsage } from '../state/persistence';
import { useStore } from '../state/store';
import { useConfirm } from '../components/ui/Confirm';
import { PageShell } from './PageShell';

const DELAYS = [
  { ms: 0, label: 'None', text: 'Stages run back to back. A run finishes in milliseconds.' },
  { ms: 300, label: 'Short', text: 'A 0.3 s pause before each stage.' },
  { ms: 600, label: 'Standard', text: 'A 0.6 s pause before each stage, enough to follow the hand-offs.' },
  { ms: 1200, label: 'Slow', text: 'A 1.2 s pause before each stage, for demos.' },
];

function Group({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-line py-7 md:grid-cols-[260px_1fr] md:gap-10">
      <div>
        <h2 className="t-section">{title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{help}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

function Radio({ name, checked, onChange, label, text }: { name: string; checked: boolean; onChange: () => void; label: string; text: string }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors ${checked ? 'border-[oklch(0.7_0.17_252/0.7)] bg-[oklch(0.7_0.17_252/0.08)]' : 'border-line hover:border-line-strong'}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-[oklch(0.7_0.17_252)]" />
      <span>
        <span className="block text-[13.5px] font-[580]">{label}</span>
        <span className="block text-[12.5px] text-ink-3">{text}</span>
      </span>
    </label>
  );
}

export default function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const historyCount = useStore((s) => s.history.length);
  const savedCount = useStore((s) => s.saved.length);
  const clearHistory = useStore((s) => s.clearHistory);
  const resetEverything = useStore((s) => s.resetEverything);
  const confirm = useConfirm();
  const [, force] = useState(0);
  const bytes = storageUsage();

  return (
    <PageShell title="Settings" lead="Preferences are stored in this browser only.">
      <Group title="Step delay" help="A visible pause before each stage so you can watch data move through the workflow. It is reported separately from processing time in every run.">
        <div className="grid gap-2 sm:grid-cols-2">
          {DELAYS.map((d) => (
            <Radio key={d.ms} name="delay" checked={settings.stepDelayMs === d.ms} onChange={() => update({ stepDelayMs: d.ms })} label={d.label} text={d.text} />
          ))}
        </div>
      </Group>

      <Group title="Motion" help="AgentLab follows your system’s reduced-motion setting. You can also turn motion down here.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Radio name="motion" checked={settings.motion === 'system'} onChange={() => update({ motion: 'system' })} label="Follow system" text="Animate hand-offs unless your device asks for reduced motion." />
          <Radio name="motion" checked={settings.motion === 'reduce'} onChange={() => update({ motion: 'reduce' })} label="Reduce motion" text="No moving connections or transitions. States still change colour and label." />
        </div>
      </Group>

      <Group title="Data in this browser" help="Workflows, history and settings live in localStorage. Nothing is sent to a server.">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13.5px]">
          <dt className="text-ink-3">Saved workflows</dt>
          <dd className="t-mono text-ink-2">{savedCount}</dd>
          <dt className="text-ink-3">Recorded runs</dt>
          <dd className="t-mono text-ink-2">{historyCount}</dd>
          <dt className="text-ink-3">Storage used</dt>
          <dd className="t-mono text-ink-2">{bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`}</dd>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={historyCount === 0}
            onClick={async () => {
              const r = await confirm({ title: 'Clear all run history?', body: 'Recorded runs and their reports will be removed. Saved workflows are kept.', confirmLabel: 'Clear history', tone: 'danger' });
              if (r === 'confirm') {
                clearHistory();
                force((n) => n + 1);
              }
            }}
          >
            Clear history
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={async () => {
              const r = await confirm({
                title: 'Reset AgentLab to its defaults?',
                body: 'This deletes every saved workflow, all run history and your settings from this browser. It can’t be undone.',
                confirmLabel: 'Delete everything',
                tone: 'danger',
              });
              if (r === 'confirm') {
                resetEverything();
                force((n) => n + 1);
              }
            }}
          >
            Reset everything
          </button>
        </div>
      </Group>
    </PageShell>
  );
}
