import type { AgentRole, InputKind, InstructionLine, ParsedDirective, ParsedInstructions } from './types';

/**
 * Instructions are free text, but the deterministic processors only act on lines written as
 * `key: value` directives that they recognise. Everything else is kept as a note: visible to
 * the person editing, recorded with the run, and not executed. A future AI processor is the
 * place where notes would start to mean something (see processors/ai-seam.ts).
 */

type ParseResult = { ok: true; value: ParsedDirective['value']; display: string } | { ok: false; error: string };

export interface DirectiveSpec {
  key: string;
  aliases: string[];
  label: string;
  help: string;
  example: string;
  kinds?: InputKind[];
  parse(raw: string): ParseResult;
}

function percent(min: number, max: number): DirectiveSpec['parse'] {
  return (raw) => {
    const m = /^(\d+(?:\.\d+)?)\s*%?$/.exec(raw.trim());
    if (!m) return { ok: false, error: `Use a percentage, e.g. "10%".` };
    const v = Number(m[1]);
    if (v < min || v > max) return { ok: false, error: `Use a value between ${min}% and ${max}%.` };
    return { ok: true, value: v, display: `${v}%` };
  };
}

function integer(min: number, max: number): DirectiveSpec['parse'] {
  return (raw) => {
    const m = /^(\d+)$/.exec(raw.trim());
    if (!m) return { ok: false, error: `Use a whole number, e.g. "${Math.min(max, Math.max(min, 3))}".` };
    const v = Number(m[1]);
    if (v < min || v > max) return { ok: false, error: `Use a number from ${min} to ${max}.` };
    return { ok: true, value: v, display: String(v) };
  };
}

function toggle(raw: string): ParseResult {
  const t = raw.trim().toLowerCase();
  if (['on', 'yes', 'true'].includes(t)) return { ok: true, value: true, display: 'on' };
  if (['off', 'no', 'false'].includes(t)) return { ok: true, value: false, display: 'off' };
  return { ok: false, error: 'Use "on" or "off".' };
}

function oneOf(options: string[]): DirectiveSpec['parse'] {
  return (raw) => {
    const t = raw.trim().toLowerCase();
    if (!options.includes(t)) return { ok: false, error: `Use one of: ${options.join(', ')}.` };
    return { ok: true, value: t, display: t };
  };
}

function list(allowed?: string[]): DirectiveSpec['parse'] {
  return (raw) => {
    const items = raw
      .split(/,|\band\b/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (items.length === 0) return { ok: false, error: 'List at least one item, separated by commas.' };
    if (allowed) {
      const bad = items.filter((i) => !allowed.includes(i));
      if (bad.length) return { ok: false, error: `Not recognised: ${bad.join(', ')}. Use: ${allowed.join(', ')}.` };
    }
    return { ok: true, value: items, display: items.join(', ') };
  };
}

function pair(separators: RegExp, hint: string): DirectiveSpec['parse'] {
  return (raw) => {
    const parts = raw.split(separators).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (parts.length !== 2) return { ok: false, error: hint };
    return { ok: true, value: parts, display: parts.join(' → ') };
  };
}

function text(raw: string): ParseResult {
  const t = raw.trim().toLowerCase();
  if (!t) return { ok: false, error: 'Give a value after the colon.' };
  return { ok: true, value: t, display: t };
}

export const SECTION_NAMES = ['observations', 'interpretations', 'recommendations', 'limitations'];

export const DIRECTIVES: Record<AgentRole, DirectiveSpec[]> = {
  researcher: [
    {
      key: 'focus', aliases: ['columns', 'metrics'], label: 'Columns to analyse', kinds: ['dataset'],
      help: 'Numeric columns to summarise. Defaults to every numeric column.', example: 'focus: revenue, units',
      parse: list(),
    },
    {
      key: 'group by', aliases: ['group', 'segment by'], label: 'Group by column', kinds: ['dataset'],
      help: 'Category column used for breakdowns. Defaults to the first text column.', example: 'group by: region',
      parse: text,
    },
    {
      key: 'compare', aliases: ['compare to target'], label: 'Actual vs target', kinds: ['dataset'],
      help: 'Compares an actual column with a target column.', example: 'compare: revenue to target',
      parse: pair(/\s+(?:to|vs\.?|versus|against)\s+/i, 'Write it as "actual to target", e.g. "revenue to target".'),
    },
    {
      key: 'ratio', aliases: ['derive'], label: 'Derived ratio', kinds: ['dataset'],
      help: 'Divides one column by another, e.g. revenue per unit.', example: 'ratio: revenue / units',
      parse: pair(/\s*(?:\/|\bper\b)\s*/i, 'Write it as "a / b", e.g. "revenue / units".'),
    },
    {
      key: 'min priority', aliases: ['priority'], label: 'Lowest priority checked', kinds: ['website'],
      help: 'Skip checklist items below this priority.', example: 'min priority: medium',
      parse: oneOf(['high', 'medium', 'low']),
    },
    {
      key: 'long word length', aliases: ['long words'], label: 'Long-word threshold', kinds: ['content'],
      help: 'Words with at least this many letters count as long.', example: 'long word length: 9',
      parse: integer(6, 20),
    },
  ],
  analyst: [
    {
      key: 'threshold', aliases: ['change threshold'], label: 'Notable change', kinds: ['dataset'],
      help: 'Changes at or above this size are reported as notable.', example: 'threshold: 10%',
      parse: percent(0.1, 100),
    },
    {
      key: 'concentration', aliases: ['share alert'], label: 'Concentration alert', kinds: ['dataset'],
      help: 'Flags a single group holding at least this share of the total.', example: 'concentration: 35%',
      parse: percent(1, 100),
    },
    {
      key: 'max recommendations', aliases: ['recommendations'], label: 'Recommendation limit',
      help: 'Keeps only the highest-priority recommendations.', example: 'max recommendations: 4',
      parse: integer(0, 20),
    },
    {
      key: 'interpretations', aliases: [], label: 'Interpretations',
      help: 'Turn hedged interpretations on or off.', example: 'interpretations: on',
      parse: toggle,
    },
  ],
  reviewer: [
    {
      key: 'require', aliases: ['required sections'], label: 'Required sections',
      help: 'Sections that must contain at least one statement.', example: 'require: observations, recommendations, limitations',
      parse: list(SECTION_NAMES),
    },
    {
      key: 'unsupported claims', aliases: ['claims'], label: 'Unsupported claims',
      help: 'Whether an unsupported or contradicted claim fails the review or only warns.', example: 'unsupported claims: fail',
      parse: oneOf(['fail', 'warn']),
    },
    {
      key: 'max missing', aliases: ['missing data'], label: 'Missing-data limit', kinds: ['dataset'],
      help: 'Warns when more than this share of analysed cells is missing.', example: 'max missing: 5%',
      parse: percent(0, 100),
    },
    {
      key: 'unassessed', aliases: ['unchecked'], label: 'Unassessed items', kinds: ['website', 'content'],
      help: 'What to do with checklist items or rules the evidence could not assess.', example: 'unassessed: warn',
      parse: oneOf(['warn', 'fail', 'ignore']),
    },
    {
      key: 'strict', aliases: ['strict mode'], label: 'Strict mode',
      help: 'Treat every warning as a failure.', example: 'strict: on',
      parse: toggle,
    },
  ],
  summariser: [
    {
      key: 'points', aliases: ['key points'], label: 'Key points',
      help: 'How many findings the summary keeps.', example: 'points: 3',
      parse: integer(1, 8),
    },
    {
      key: 'next steps', aliases: ['include recommendations'], label: 'Next steps',
      help: 'Include the top recommendations.', example: 'next steps: on',
      parse: toggle,
    },
  ],
};

function normaliseKey(key: string): string {
  return key.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

function findSpec(role: AgentRole, key: string): DirectiveSpec | undefined {
  const k = normaliseKey(key);
  return DIRECTIVES[role].find((s) => s.key === k || s.aliases.includes(k));
}

export function parseInstructions(role: AgentRole, instructions: string, kind: InputKind): ParsedInstructions {
  const directives: ParsedDirective[] = [];
  const lines: InstructionLine[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();

  instructions.split(/\r?\n/).forEach((rawLine, i) => {
    const line = i + 1;
    const t = rawLine.trim();
    if (!t) return;
    const m = /^([A-Za-z][A-Za-z _-]{1,40}):\s*(.*)$/.exec(t);
    const spec = m ? findSpec(role, m[1]) : undefined;
    if (!m || !spec) {
      lines.push({ line, text: t, kind: 'note', message: m ? 'Not a directive this agent recognises, so it is kept as a note.' : undefined });
      return;
    }
    if (spec.kinds && !spec.kinds.includes(kind)) {
      lines.push({ line, text: t, kind: 'inapplicable', message: `“${spec.key}” only applies to ${spec.kinds.join(' and ')} inputs, so it is skipped.` });
      return;
    }
    const result = spec.parse(m[2]);
    if (!result.ok) {
      const message = `Line ${line} (“${spec.key}”): ${result.error}`;
      errors.push(message);
      lines.push({ line, text: t, kind: 'error', message: result.error });
      return;
    }
    const previous = seen.get(spec.key);
    if (previous !== undefined) {
      const message = `“${spec.key}” is set on line ${previous} and again on line ${line}. Keep one.`;
      errors.push(message);
      lines.push({ line, text: t, kind: 'error', message });
      return;
    }
    seen.set(spec.key, line);
    directives.push({ key: spec.key, label: spec.label, raw: t, value: result.value, line });
    lines.push({ line, text: t, kind: 'directive', message: `${spec.label}: ${result.display}` });
  });

  return { directives, lines, errors };
}

export function directiveValue<T extends ParsedDirective['value']>(parsed: ParsedInstructions, key: string, fallback: T): T {
  const d = parsed.directives.find((x) => x.key === key);
  return (d ? d.value : fallback) as T;
}

export function describeApplied(parsed: ParsedInstructions): string[] {
  return parsed.lines.filter((l) => l.kind === 'directive').map((l) => l.message ?? l.text);
}

export function notes(parsed: ParsedInstructions): string[] {
  return parsed.lines.filter((l) => l.kind === 'note').map((l) => l.text);
}
