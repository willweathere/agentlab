import { ArrowUpRight, Check, CircleDashed } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageShell } from './PageShell';

export const PORTFOLIO_URL = 'https://willwportfolio.co.uk';
export const REPO_URL = 'https://github.com/willweathere/agentlab';

const IMPLEMENTED = [
  'A sequential engine that runs agents strictly in order and records every stage’s status, real start and end times, input and output.',
  'Four roles with typed contracts: Researcher, Analyst, Reviewer and Summariser. A workflow whose contracts don’t line up is rejected before it runs.',
  'Three input types (CSV datasets, written website descriptions, social posts) with a bundled fictional example for each.',
  'Instructions parsed into directives that change what a processor does. Lines that aren’t directives are kept as notes and shown as not executed.',
  'A Reviewer with explicit rules: figures traced to evidence, required sections, observations kept apart from assumptions, recommendations linked to findings, claims verified. It can fail a run.',
  'Cancel, restart and a guard against two concurrent runs of the same workflow.',
  'Local saves that tolerate malformed or older data, run history, and Markdown or plain-text report export.',
];

const PLANNED = [
  'AI-backed processors behind a server endpoint, so no API key ever reaches the browser. Their output would go through the same Reviewer.',
  'Branching and parallel stages. v1 is deliberately sequential.',
  'File upload for datasets, and more input types.',
  'Sharing or syncing workflows between devices. Everything currently stays in one browser.',
];

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-7">
      <h2 className="t-section">{title}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

function Layer({ name, body, tone }: { name: string; body: string; tone?: 'planned' }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone === 'planned' ? 'border-dashed border-line-strong' : 'border-line-strong bg-slab'}`}>
      <div className="flex items-center gap-2 text-[13.5px] font-[620] text-ink">
        {name}
        {tone === 'planned' && <span className="pill tone-muted">Planned</span>}
      </div>
      <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{body}</p>
    </div>
  );
}

export default function AboutPage() {
  return (
    <PageShell
      title="About AgentLab"
      lead="AgentLab is a workflow engine with deterministic processing, for experimenting with agent-style workflows. You chain specialised agents, run them in order, and inspect exactly what each one received and produced."
    >
      <div className="max-w-[760px] space-y-10">
        <Part title="What it is, and what it isn’t">
          <p>
            Version 1 calls no AI model. Every agent is TypeScript running in your browser with explicit, readable rules, so the same input always produces the same output. The point is the workflow itself: orchestration, structured
            hand-offs, validation and honest reporting, built so that a model could later take one of the seats without the rest changing.
          </p>
          <p>The bundled datasets, website description and social post are fictional and were written for this project.</p>
        </Part>

        <Part title="How a run works">
          <ol className="space-y-2.5">
            {[
              ['Validate.', 'Each role declares what it consumes and produces. If an agent needs something no earlier stage makes, or an instruction can’t be parsed, the run is refused with a specific reason.'],
              ['Research.', 'The Researcher turns the input into facts: totals, averages, period changes, highs and lows, checklist results, rule checks and missing values. Each fact gets an id like F12.'],
              ['Analyse.', 'The Analyst writes observations that cite facts, hedged interpretations that cite observations, recommendations linked to both, and a list of what the data can’t tell you.'],
              ['Review.', 'The Reviewer re-reads the written statements, pulls every figure back out of the text and checks it against the facts it cites. Unsupported claims fail the review and stop the run.'],
              ['Report.', 'The report is assembled from the recorded outputs. A failed or cancelled run produces a partial report that says where it stopped.'],
            ].map(([head, body], i) => (
              <li key={head} className="flex gap-3">
                <span className="t-mono mt-0.5 text-[12px] text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <span className="font-[600] text-ink">{head}</span> {body}
                </span>
              </li>
            ))}
          </ol>
        </Part>

        <Part title="Architecture">
          <p>The engine is plain TypeScript with no UI dependencies. The interface only sends it a workflow definition and listens to the events it emits.</p>
          <div className="grid gap-2 pt-2 sm:grid-cols-2">
            <Layer name="Interface" body="React 19 and Tailwind CSS. A custom canvas whose layout is derived from the workflow order." />
            <Layer name="State and persistence" body="Zustand store. localStorage with validation and repair on every read." />
            <Layer name="Orchestration" body="Runs stages in order, records events, handles errors, cancellation and the concurrency guard." />
            <Layer name="Deterministic processors" body="Researcher and Summariser (arithmetic and extraction), Analyst (rules)." />
            <Layer name="Validation" body="Static contract checks before a run; the Reviewer’s evidence checks during it." />
            <Layer name="Report builder" body="Builds the report and its Markdown and text exports from recorded outputs only." />
            <Layer name="AI processing seam" body="A processor interface an AI adapter would implement. Nothing uses it in v1." tone="planned" />
          </div>
        </Part>

        <Part title="AI workflow design">
          <p>
            The Reviewer is written as if it cannot trust the Analyst. Today the Analyst is deterministic, so its figures always trace back to the evidence. If a model took that seat, the same checks would catch an invented number, a recommendation
            with no finding behind it, or an assumption presented as fact.
          </p>
          <p>Free-text notes in an agent’s instructions are recorded but not executed. They mark the place where a model would add judgement, and the interface says plainly that, for now, nothing reads them.</p>
        </Part>

        <Part title="Implemented in v1">
          <ul className="space-y-2">
            {IMPLEMENTED.map((t) => (
              <li key={t} className="flex gap-2.5">
                <Check size={15} className="mt-1 flex-none text-success" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Part>

        <Part title="Planned, not built">
          <ul className="space-y-2">
            {PLANNED.map((t) => (
              <li key={t} className="flex gap-2.5">
                <CircleDashed size={15} className="mt-1 flex-none text-ink-3" aria-hidden="true" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Part>

        <Part title="Who made it">
          <p>Designed and built by Will Weatherhead with React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, wouter and Lucide icons.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={PORTFOLIO_URL} className="btn btn-secondary" rel="noopener">
              Will’s portfolio <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a href={REPO_URL} className="btn btn-ghost" rel="noopener">
              Source code <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </Part>
      </div>
    </PageShell>
  );
}
