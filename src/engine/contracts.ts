import { parseInstructions } from './directives';
import type { AgentRole, InputKind, PayloadType, ValidationIssue, ValidationResult, WorkflowDefinition } from './types';
import { AGENT_ROLES } from './types';

export interface RoleSpec {
  role: AgentRole;
  label: string;
  /** One line describing what the role does. */
  summary: string;
  consumes: PayloadType[];
  produces: PayloadType;
  processing: 'deterministic' | 'rule-based';
}

export const ROLE_SPECS: Record<AgentRole, RoleSpec> = {
  researcher: {
    role: 'researcher',
    label: 'Researcher',
    summary: 'Extracts evidence from the input: totals, averages, changes, highs and lows, checks and gaps.',
    consumes: ['input'],
    produces: 'evidence',
    processing: 'deterministic',
  },
  analyst: {
    role: 'analyst',
    label: 'Analyst',
    summary: 'Turns evidence into observations, hedged interpretations, recommendations and stated gaps.',
    consumes: ['evidence'],
    produces: 'analysis',
    processing: 'rule-based',
  },
  reviewer: {
    role: 'reviewer',
    label: 'Reviewer',
    summary: 'Checks the analysis against the evidence with explicit rules, and can fail the run.',
    consumes: ['analysis', 'evidence'],
    produces: 'review',
    processing: 'rule-based',
  },
  summariser: {
    role: 'summariser',
    label: 'Summariser',
    summary: 'Condenses the analysis into a short brief that quotes its strongest findings.',
    consumes: ['analysis'],
    produces: 'summary',
    processing: 'deterministic',
  },
};

export const PAYLOAD_LABELS: Record<PayloadType, string> = {
  input: 'Workflow input',
  evidence: 'Evidence set',
  analysis: 'Analysis',
  review: 'Review verdict',
  summary: 'Summary',
};

export const INPUT_LABELS: Record<InputKind, { kind: string; primary: string; secondary?: string; primaryHelp: string; secondaryHelp?: string }> = {
  dataset: {
    kind: 'Dataset',
    primary: 'Dataset (CSV)',
    primaryHelp: 'First row is column names. A period column (month, date, week…) enables trend facts.',
  },
  website: {
    kind: 'Website description',
    primary: 'Site description',
    secondary: 'Checklist',
    primaryHelp: 'One attribute per line as "name: value". This is a written description; no site is visited.',
    secondaryHelp: 'One item per line: "priority | attribute | condition", e.g. "high | Page weight (home) | under 2 MB".',
  },
  content: {
    kind: 'Social post',
    primary: 'Post text',
    secondary: 'Editorial rules',
    primaryHelp: 'The post exactly as it would be published.',
    secondaryHelp: 'One rule per line, e.g. "max length: 280 characters", "avoid: game-changer", "verified: 3,200 customers".',
  },
};

const MAX_AGENTS = 12;
const MAX_INPUT_CHARS = 100_000;

/** Static validation. A workflow with any error is rejected before it runs. */
export function validateWorkflow(def: WorkflowDefinition): ValidationResult {
  const issues: ValidationIssue[] = [];
  const err = (message: string, extra: Partial<ValidationIssue> = {}) => issues.push({ level: 'error', message, ...extra });
  const warn = (message: string, extra: Partial<ValidationIssue> = {}) => issues.push({ level: 'warning', message, ...extra });

  if (!def.name.trim()) err('Give the workflow a name.', { field: 'name' });
  if (def.name.length > 80) err('Keep the workflow name under 80 characters.', { field: 'name' });

  // Input
  const { input } = def;
  const labels = INPUT_LABELS[input.kind];
  if (!labels) {
    err('The workflow input type is not recognised.', { field: 'input' });
  } else {
    if (!input.primary.trim()) err(`${labels.primary} is empty.`, { field: 'input' });
    if (labels.secondary && !input.secondary.trim()) err(`${labels.secondary} is empty. Add at least one line.`, { field: 'input' });
    const total = input.primary.length + input.secondary.length + input.claims.length;
    if (total > MAX_INPUT_CHARS) err(`The input is ${total.toLocaleString('en-GB')} characters; the limit is ${MAX_INPUT_CHARS.toLocaleString('en-GB')}.`, { field: 'input' });
  }

  // Agents
  if (def.agents.length === 0) err('Add at least one agent.', { field: 'agents' });
  if (def.agents.length > MAX_AGENTS) err(`A workflow can have up to ${MAX_AGENTS} agents.`, { field: 'agents' });

  const ids = new Set<string>();
  const available = new Map<PayloadType, string>([['input', 'the workflow input']]);
  let hasReviewer = false;

  def.agents.forEach((agent, index) => {
    const at = { agentId: agent.id };
    const label = agent.name.trim() || `Stage ${index + 1}`;
    if (ids.has(agent.id)) err(`Two agents share the id “${agent.id}”.`, at);
    ids.add(agent.id);
    if (!agent.name.trim()) err(`Stage ${index + 1} needs a name.`, { ...at, field: 'name' });
    if (!AGENT_ROLES.includes(agent.role)) {
      err(`${label} has an unknown role.`, { ...at, field: 'role' });
      return;
    }
    const spec = ROLE_SPECS[agent.role];
    for (const need of spec.consumes) {
      if (!available.has(need)) {
        const producer = Object.values(ROLE_SPECS).find((s) => s.produces === need);
        err(
          `${label} needs ${article(PAYLOAD_LABELS[need])}, but no earlier stage produces one.` +
            (producer ? ` Put a ${producer.label} before it.` : ''),
          { ...at, field: 'role' },
        );
      }
    }
    if (spec.produces !== 'review' && available.has(spec.produces) && spec.produces !== 'input') {
      warn(`${label} replaces the ${PAYLOAD_LABELS[spec.produces].toLowerCase()} from ${available.get(spec.produces)}; later stages use this one.`, at);
    }
    available.set(spec.produces, label);
    if (agent.role === 'reviewer') hasReviewer = true;

    const parsed = parseInstructions(agent.role, agent.instructions, input.kind);
    for (const e of parsed.errors) err(`${label}: ${e}`, { ...at, field: 'instructions' });
  });

  if (def.agents.length > 0 && !hasReviewer) {
    warn('There is no Reviewer, so nothing will check the analysis before the report is built.', { field: 'agents' });
  }

  return { ok: !issues.some((i) => i.level === 'error'), issues };
}

function article(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun.toLowerCase()}` : `a ${noun.toLowerCase()}`;
}
