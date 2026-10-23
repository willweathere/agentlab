/**
 * Core types for the AgentLab workflow engine.
 *
 * The engine is plain TypeScript with no UI dependencies. A workflow is an ordered list of
 * agents; each agent's role decides which processor runs it and what it consumes and
 * produces. Data moves between stages in a typed envelope.
 */

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

export type AgentRole = 'researcher' | 'analyst' | 'reviewer' | 'summariser';

export const AGENT_ROLES: readonly AgentRole[] = ['researcher', 'analyst', 'reviewer', 'summariser'];

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  /** Free text. Lines in `key: value` form are parsed into directives; other lines are notes. */
  instructions: string;
}

export type InputKind = 'dataset' | 'website' | 'content';

export const INPUT_KINDS: readonly InputKind[] = ['dataset', 'website', 'content'];

export interface WorkflowInput {
  kind: InputKind;
  /** Dataset: CSV. Website: a written description. Content: the post text. */
  primary: string;
  /** Website: the checklist. Content: the editorial rules. Unused for datasets. */
  secondary: string;
  /** Optional statements someone wants in the final report; the Reviewer verifies each. */
  claims: string;
}

export interface WorkflowDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  /** Set when the workflow was created from a bundled example, so it can be reset. */
  templateId?: string;
  input: WorkflowInput;
  agents: AgentConfig[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Payloads passed between stages
// ---------------------------------------------------------------------------

export type PayloadType = 'input' | 'evidence' | 'analysis' | 'review' | 'summary';

export type NumberUnit = 'currency' | 'percent' | 'count' | 'number' | 'size' | 'duration';

export interface FactNumber {
  value: number;
  unit: NumberUnit;
}

export type Priority = 'high' | 'medium' | 'low';
export type Polarity = 'positive' | 'negative' | 'neutral';

/** A single piece of evidence derived from the input. Everything downstream cites these by id. */
export interface Fact {
  id: string;
  group: string;
  label: string;
  /** Human-readable value, e.g. "£486,200" or "4.8 MB (target: under 2 MB)". */
  display: string;
  /** Numbers this fact establishes. The Reviewer checks figures in the analysis against these. */
  numbers: FactNumber[];
  /** Where the fact came from, e.g. "column revenue, 24 rows". */
  source: string;
  /** Lower-case words describing what the fact is about, used to match claims. */
  terms: string[];
  polarity?: Polarity;
  priority?: Priority;
  /** Rule outcome for checklist and editorial-rule facts. */
  check?: 'pass' | 'fail' | 'not-assessed';
  /** Machine-readable details the analyst rules use. */
  meta?: Record<string, string | number | boolean | string[]>;
}

export interface Claim {
  id: string;
  text: string;
  source: string;
}

export interface EvidenceSet {
  kind: InputKind;
  subject: string;
  facts: Fact[];
  claims: Claim[];
  /** Things the input cannot tell us, found while extracting evidence. */
  gaps: string[];
}

export type StatementKind = 'observation' | 'interpretation' | 'recommendation' | 'unavailable';

export interface Statement {
  id: string;
  kind: StatementKind;
  text: string;
  /** Observation: fact ids. Interpretation: observation ids. Recommendation: observation or interpretation ids. */
  refs: string[];
  group?: string;
  polarity?: Polarity;
  priority?: Priority;
  /** Used to rank statements; larger is more significant. */
  weight?: number;
}

export interface Analysis {
  kind: InputKind;
  subject: string;
  observations: Statement[];
  interpretations: Statement[];
  recommendations: Statement[];
  unavailable: Statement[];
  /** Claims carried forward from the input, unverified. */
  claims: Claim[];
}

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ReviewCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  findings: { ref?: string; message: string }[];
}

export type ClaimStatus = 'supported' | 'unsupported' | 'contradicted';

export interface ClaimVerdict {
  claimId: string;
  text: string;
  status: ClaimStatus;
  refs: string[];
  reason: string;
}

export interface Review {
  reviewerId: string;
  reviewerName: string;
  verdict: CheckStatus;
  checks: ReviewCheck[];
  claims: ClaimVerdict[];
  summary: string;
}

export interface Summary {
  headline: string;
  points: Statement[];
  next: Statement[];
}

/** Everything produced so far in a run. Each stage reads what it needs and adds its output. */
export interface Envelope {
  input: WorkflowInput;
  evidence?: EvidenceSet;
  analysis?: Analysis;
  reviews: Review[];
  summary?: Summary;
}

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

export interface ParsedDirective {
  key: string;
  label: string;
  raw: string;
  value: string | number | boolean | string[];
  line: number;
}

export interface InstructionLine {
  line: number;
  text: string;
  kind: 'directive' | 'note' | 'error' | 'inapplicable';
  message?: string;
}

export interface ParsedInstructions {
  directives: ParsedDirective[];
  lines: InstructionLine[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  level: 'error' | 'warning';
  message: string;
  agentId?: string;
  field?: 'name' | 'role' | 'instructions' | 'input' | 'agents';
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export type StageStatus =
  | 'queued'
  | 'receiving'
  | 'running'
  | 'passed'
  | 'warning'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type RunStatus = 'running' | 'completed' | 'warning' | 'failed' | 'cancelled';

export interface StageRecord {
  index: number;
  agentId: string;
  agentName: string;
  role: AgentRole;
  status: StageStatus;
  /** ISO timestamps for the processing itself (pacing pauses are excluded). */
  startedAt?: string;
  endedAt?: string;
  processingMs?: number;
  input?: { types: PayloadType[]; from: string; summary: string };
  output?: { type: PayloadType; summary: string; data: EvidenceSet | Analysis | Review | Summary };
  warnings: string[];
  error?: string;
  directivesApplied: string[];
  notes: string[];
}

export interface RunFailure {
  stageIndex: number;
  agentName: string;
  kind: 'error' | 'review' | 'cancelled';
  message: string;
}

export interface RunRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  /** Snapshot of the definition that ran, so history stays accurate after later edits. */
  definition: WorkflowDefinition;
  definitionHash: string;
  status: RunStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  processingMs: number;
  pacingMs: number;
  stepDelayMs: number;
  stages: StageRecord[];
  failure?: RunFailure;
}

export type ExecutionEvent =
  | { type: 'run-started'; run: RunRecord }
  | { type: 'handoff'; run: RunRecord; toIndex: number }
  | { type: 'stage-started'; run: RunRecord; index: number }
  | { type: 'stage-finished'; run: RunRecord; index: number }
  | { type: 'report-handoff'; run: RunRecord }
  | { type: 'run-finished'; run: RunRecord };
