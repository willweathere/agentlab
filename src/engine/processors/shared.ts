import type {
  AgentConfig,
  AgentRole,
  Analysis,
  Envelope,
  EvidenceSet,
  Fact,
  ParsedInstructions,
  PayloadType,
  Review,
  Statement,
  StatementKind,
  Summary,
} from '../types';
import { toTerms } from '../text';

/** A failure a processor reports in plain language. The engine marks the stage as failed. */
export class StageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StageError';
  }
}

export interface StageContext {
  agent: AgentConfig;
  parsed: ParsedInstructions;
  signal: AbortSignal;
  /** Record a warning against this stage. The stage still passes, with status "warning". */
  warn(message: string): void;
}

export type StageOutput =
  | { type: 'evidence'; data: EvidenceSet }
  | { type: 'analysis'; data: Analysis }
  | { type: 'review'; data: Review }
  | { type: 'summary'; data: Summary };

/**
 * The processing seam. v1 registers deterministic and rule-based processors only; an AI-backed
 * processor would implement the same interface (see ai-seam.ts) and be validated the same way.
 */
export interface StageProcessor {
  role: AgentRole;
  mode: 'deterministic' | 'rule-based' | 'ai';
  produces: PayloadType;
  run(envelope: Envelope, ctx: StageContext): Promise<StageOutput> | StageOutput;
}

export class FactBuilder {
  readonly facts: Fact[] = [];
  private n = 0;

  add(fact: Omit<Fact, 'id' | 'terms'> & { terms?: string[] }): string {
    const id = `F${++this.n}`;
    const terms = Array.from(new Set([...(fact.terms ?? []).flatMap((t) => toTerms(t)), ...toTerms(fact.label)]));
    this.facts.push({ ...fact, id, terms });
    return id;
  }
}

const PREFIX: Record<StatementKind, string> = {
  observation: 'O',
  interpretation: 'I',
  recommendation: 'R',
  unavailable: 'U',
};

export class StatementBuilder {
  readonly items: Statement[] = [];
  private counters: Record<StatementKind, number> = { observation: 0, interpretation: 0, recommendation: 0, unavailable: 0 };

  add(kind: StatementKind, text: string, refs: string[], extra: Partial<Statement> = {}): string {
    const id = `${PREFIX[kind]}${++this.counters[kind]}`;
    this.items.push({ id, kind, text, refs, ...extra });
    return id;
  }

  of(kind: StatementKind): Statement[] {
    return this.items.filter((s) => s.kind === kind);
  }
}

export const PRIORITY_RANK = { high: 3, medium: 2, low: 1 } as const;

export function sortRecommendations(recs: Statement[]): Statement[] {
  return [...recs].sort(
    (a, b) => PRIORITY_RANK[b.priority ?? 'low'] - PRIORITY_RANK[a.priority ?? 'low'] || (b.weight ?? 0) - (a.weight ?? 0),
  );
}

export function parseClaims(text: string): { id: string; text: string; source: string }[] {
  return text
    .split(/\r?\n/)
    .map((t, i) => ({ text: t.trim().replace(/^[-*•]\s*/, ''), line: i + 1 }))
    .filter((c) => c.text.length > 0)
    .map((c, i) => ({ id: `C${i + 1}`, text: c.text, source: `Claims to verify, line ${c.line}` }));
}
