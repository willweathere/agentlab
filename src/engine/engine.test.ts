import { describe, expect, it } from 'vitest';
import { validateWorkflow } from './contracts';
import { parseInstructions } from './directives';
import { ConcurrentRunError, InvalidWorkflowError, WorkflowEngine } from './engine';
import { EXAMPLES, workflowFromExample } from './examples';
import { extractNumbers, numberMatches } from './numbers';
import { review } from './processors/review';
import { buildReport, exportReport } from './report';
import type { Analysis, EvidenceSet, ExecutionEvent, WorkflowDefinition } from './types';

const example = (id: string) => workflowFromExample(EXAMPLES.find((e) => e.id === id)!);
const sales = () => example('sales-performance');

describe('bundled examples', () => {
  it('runs every example in order and passes each output to the next stage', async () => {
    const expected: Record<string, string> = { 'sales-performance': 'completed', 'website-quality': 'warning', 'content-quality': 'completed' };
    for (const ex of EXAMPLES) {
      const events: ExecutionEvent[] = [];
      const run = await new WorkflowEngine().run(workflowFromExample(ex), { onEvent: (e) => events.push(e) });
      expect(run.status).toBe(expected[ex.id]);

      const started = events.filter((e) => e.type === 'stage-started').map((e) => (e as { index: number }).index);
      expect(started).toEqual([0, 1, 2]);
      expect(run.stages.map((s) => s.output?.type)).toEqual(['evidence', 'analysis', 'review']);
      expect(run.stages[1].input?.from).toBe(run.stages[0].agentName);
      expect(run.stages[2].input?.types).toEqual(['analysis', 'evidence']);

      // Stage timestamps are real and ordered.
      for (const s of run.stages) expect(Date.parse(s.endedAt!)).toBeGreaterThanOrEqual(Date.parse(s.startedAt!));
      expect(Date.parse(run.stages[1].startedAt!)).toBeGreaterThanOrEqual(Date.parse(run.stages[0].endedAt!));

      // Every observation cites facts that exist in the researcher's output.
      const ev = run.stages[0].output!.data as EvidenceSet;
      const an = run.stages[1].output!.data as Analysis;
      const ids = new Set(ev.facts.map((f) => f.id));
      for (const o of an.observations) expect(o.refs.every((r) => ids.has(r))).toBe(true);
    }
  });

  it('changes the results when the input changes', async () => {
    const a = await new WorkflowEngine().run(sales());
    const def = sales();
    def.input.primary = def.input.primary.replace('2026-06,North,23100', '2026-06,North,43100');
    const b = await new WorkflowEngine().run(def);
    const total = (r: typeof a) => (r.stages[0].output!.data as EvidenceSet).facts.find((f) => f.label === 'Total revenue')!.display;
    expect(total(a)).toBe('£343,200');
    expect(total(b)).toBe('£363,200');
    const text = (r: typeof a) => (r.stages[1].output!.data as Analysis).observations.map((o) => o.text).join(' ');
    expect(text(a)).not.toEqual(text(b));
  });
});

describe('reviewer', () => {
  it('fails the run when a claim is unsupported', async () => {
    const def = sales();
    def.input.claims += '\nCustomer satisfaction rose to 92%.';
    const run = await new WorkflowEngine().run(def);
    expect(run.status).toBe('failed');
    expect(run.failure).toMatchObject({ stageIndex: 2, kind: 'review' });
    const r = run.stages[2].output!.data as { claims: { text: string; status: string }[] };
    expect(r.claims.find((c) => c.text.startsWith('Customer'))?.status).toBe('unsupported');
  });

  it('marks a claim contradicted when the subject matches but the figure does not', async () => {
    const def = sales();
    def.input.claims = 'South revenue grew 25% between January and June.';
    const run = await new WorkflowEngine().run(def);
    const r = run.stages[2].output!.data as { claims: { status: string }[] };
    expect(r.claims[0].status).toBe('contradicted');
  });

  it('only warns about unsupported claims when told to', async () => {
    const def = sales();
    def.input.claims = 'Customer satisfaction rose to 92%.';
    def.agents[2].instructions = 'unsupported claims: warn';
    const run = await new WorkflowEngine().run(def);
    expect(run.status).toBe('warning');
  });

  it('fails when a required section is empty', async () => {
    const def = sales();
    def.agents[1].instructions = 'max recommendations: 0';
    const run = await new WorkflowEngine().run(def);
    expect(run.status).toBe('failed');
    const r = run.stages[2].output!.data as { checks: { id: string; status: string }[] };
    expect(r.checks.find((c) => c.id === 'sections')?.status).toBe('fail');
  });

  it('catches a figure that is not in the cited evidence', async () => {
    const run = await new WorkflowEngine().run(sales());
    const ev = run.stages[0].output!.data as EvidenceSet;
    const an = structuredClone(run.stages[1].output!.data as Analysis);
    an.observations[0].text = an.observations[0].text.replace('£343,200', '£400,000');
    const ctx = { agent: run.definition.agents[2], parsed: parseInstructions('reviewer', '', 'dataset'), signal: new AbortController().signal, warn() {} };
    const result = review(an, ev, undefined, ctx);
    expect(result.verdict).toBe('fail');
    expect(result.checks.find((c) => c.id === 'numbers')?.findings[0].message).toContain('£400,000');
  });
});

describe('validation and control', () => {
  it('rejects a workflow whose contracts do not line up', async () => {
    const def = sales();
    def.agents = [def.agents[1], def.agents[0], def.agents[2]];
    const v = validateWorkflow(def);
    expect(v.ok).toBe(false);
    expect(v.issues[0].message).toMatch(/needs an evidence set/);
    await expect(new WorkflowEngine().run(def)).rejects.toBeInstanceOf(InvalidWorkflowError);
  });

  it('rejects malformed directives and empty workflows', () => {
    const def = sales();
    def.agents[1].instructions = 'threshold: lots';
    expect(validateWorkflow(def).ok).toBe(false);
    const empty: WorkflowDefinition = { ...sales(), agents: [] };
    expect(validateWorkflow(empty).issues.some((i) => i.message === 'Add at least one agent.')).toBe(true);
  });

  it('prevents two concurrent runs of the same workflow', async () => {
    const eng = new WorkflowEngine();
    const def = sales();
    const first = eng.run(def, { stepDelayMs: 30 });
    await expect(eng.run(def)).rejects.toBeInstanceOf(ConcurrentRunError);
    await first;
    await expect(eng.run(def)).resolves.toMatchObject({ status: 'completed' });
  });

  it('cancels a run between stages', async () => {
    const eng = new WorkflowEngine();
    const def = sales();
    const p = eng.run(def, {
      stepDelayMs: 40,
      onEvent: (e) => {
        if (e.type === 'stage-finished' && e.index === 0) eng.cancel(def.id);
      },
    });
    const run = await p;
    expect(run.status).toBe('cancelled');
    expect(run.stages.map((s) => s.status)).toEqual(['passed', 'cancelled', 'cancelled']);
    expect(eng.isRunning(def.id)).toBe(false);
  });

  it('fails the stage and skips the rest when the input cannot be processed', async () => {
    const def = sales();
    def.input.primary = 'name,colour\nmug,blue\nplate,green';
    const run = await new WorkflowEngine().run(def);
    expect(run.status).toBe('failed');
    expect(run.stages.map((s) => s.status)).toEqual(['failed', 'skipped', 'skipped']);
    expect(run.stages[0].error).toMatch(/no numeric columns/);
  });
});

describe('instructions', () => {
  it('separates directives, notes and errors', () => {
    const p = parseInstructions('analyst', 'threshold: 15%\nBe careful with outliers.\nmax recommendations: lots\nfocus: revenue', 'dataset');
    expect(p.directives.map((d) => d.key)).toEqual(['threshold']);
    expect(p.lines.map((l) => l.kind)).toEqual(['directive', 'note', 'error', 'note']);
  });

  it('changes behaviour when a directive changes', async () => {
    const def = sales();
    def.agents[1].instructions = 'threshold: 30%';
    const run = await new WorkflowEngine().run(def);
    const an = run.stages[1].output!.data as Analysis;
    expect(an.observations.some((o) => o.text.startsWith('Revenue rose'))).toBe(false);
    expect(an.observations.some((o) => o.text.startsWith('Revenue moved'))).toBe(true);
  });
});

describe('other input kinds', () => {
  it('re-evaluates the website checklist from the description', async () => {
    const def = example('website-quality');
    def.input.primary = def.input.primary.replace('Page weight (home): 4.8 MB', 'Page weight (home): 1.6 MB');
    const run = await new WorkflowEngine().run(def);
    const ev = run.stages[0].output!.data as EvidenceSet;
    expect(ev.facts.find((f) => f.check && f.label.startsWith('Page weight'))?.check).toBe('pass');
  });

  it('checks figures in a post against verified notes', async () => {
    const def = example('content-quality');
    def.input.primary = def.input.primary.replace('10,000', '1,200');
    const run = await new WorkflowEngine().run(def);
    const ev = run.stages[0].output!.data as EvidenceSet;
    expect(ev.facts.find((f) => f.group === 'Figures')?.check).toBe('pass');
  });
});

describe('numbers', () => {
  it('skips years and dates but keeps money and percentages', () => {
    const n = extractNumbers('From Jan 2026 to 2026-06, revenue rose 13.0% to £62,700 (about £63k).');
    expect(n.map((x) => x.raw)).toEqual(['13.0%', '£62,700', '£63k']);
    expect(numberMatches(n[2], { value: 62700, unit: 'currency' })).toBe(true);
  });
});

describe('report', () => {
  it('never presents a failed run as a success', async () => {
    const def = sales();
    def.input.claims = 'Customer satisfaction rose to 92%.';
    const report = buildReport(await new WorkflowEngine().run(def));
    expect(report.statusLabel).toBe('Failed');
    expect(report.partial).toBe(true);
    const md = exportReport(report, 'md');
    expect(md).toContain('Status: Failed (partial results)');
    expect(md).toContain('Run stopped at stage 3');
  });
});
