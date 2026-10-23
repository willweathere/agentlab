import type { AgentConfig, InputKind, WorkflowDefinition, WorkflowInput } from './types';

/**
 * The three bundled examples. All data is fictional and written for this project; none of it
 * describes a real business, website or post.
 */

export interface Example {
  id: string;
  name: string;
  description: string;
  produces: string;
  input: WorkflowInput;
  agents: Omit<AgentConfig, 'id'>[];
}

const SALES_CSV = `month,region,revenue,units,target
2026-01,North,18400,136,19000
2026-01,South,15200,113,15000
2026-01,East,12100,90,12500
2026-01,West,9800,73,10000
2026-02,North,17900,132,19000
2026-02,South,14800,110,15000
2026-02,East,11800,87,12500
2026-02,West,9600,71,10000
2026-03,North,19600,144,19000
2026-03,South,14300,106,15000
2026-03,East,12900,95,12500
2026-03,West,10100,74,10000
2026-04,North,18800,137,19000
2026-04,South,13900,,15000
2026-04,East,12400,91,12500
2026-04,West,9400,68,10000
2026-05,North,21200,151,19000
2026-05,South,13600,99,15000
2026-05,East,13800,99,12500
2026-05,West,10900,,10000
2026-06,North,23100,160,19000
2026-06,South,13300,96,15000
2026-06,East,14600,103,12500
2026-06,West,11700,81,10000`;

const WEBSITE_DESCRIPTION = `Site: Kilnhouse Pottery Studio (fictional)
Pages: Home, Classes, Shop, About, Contact
Primary call to action: Book a class, in the home page hero
Navigation items: 6
Page weight (home): 4.8 MB
Largest image (home): 2.1 MB hero photo
Image alt text: 9 of 14 images
Mobile layout: yes
HTTPS: yes
Meta descriptions: 2 of 5 pages
H1 headings (home): 2
Booking form fields: 11
Contact details: email only, in the footer
Prices shown: shop only, not on Classes
Last content update: 19 months ago`;

const WEBSITE_CHECKLIST = `high | Primary call to action | present
high | Page weight (home) | under 2 MB
high | Image alt text | all
high | HTTPS | present
medium | Navigation items | at most 6
medium | Meta descriptions | all
medium | Booking form fields | at most 6
medium | H1 headings (home) | exactly 1
medium | Mobile layout | present
low | Contact details | includes phone
low | Last content update | at most 6 months
low | Testimonials | present`;

const CONTENT_POST = `Big news!!! Harbour Desk is the ULTIMATE game-changer for remote workers. Join 10,000 happy members who have already discovered our revolutionary hot desks, fast wifi and the best flat white on the seafront, all for one simple monthly price that works whether you come in two days a week or every single day of the month. Book a free trial day this week. #coworking #remotework #harbourdesk #workspace #freelance`;

const CONTENT_RULES = `max length: 280 characters
hashtags: 1 to 3
must include: call to action
must include: Harbour Desk
avoid: game-changer, revolutionary, ultimate, synergy
max sentence length: 25 words
max exclamation marks: 1
max emoji: 2
no all caps
verified: 1,200 members
verified: open since 2021`;

export const EXAMPLES: Example[] = [
  {
    id: 'sales-performance',
    name: 'Sales performance analysis',
    description: 'Six months of a fictional homeware retailer’s sales by region, with targets, turned into a structured business report.',
    produces: 'Business report',
    input: {
      kind: 'dataset',
      primary: SALES_CSV,
      secondary: '',
      claims: `Total revenue for the half-year was above £340,000.
North was the strongest region by revenue.
Revenue grew by about 13% from January to June.`,
    },
    agents: [
      {
        name: 'Ledger researcher',
        role: 'researcher',
        instructions: `focus: revenue, units
group by: region
compare: revenue to target
ratio: revenue / units
Summarise monthly totals and flag gaps in the data.`,
      },
      {
        name: 'Performance analyst',
        role: 'analyst',
        instructions: `threshold: 10%
concentration: 30%
max recommendations: 5
interpretations: on
Keep interpretations cautious and tie every recommendation to a finding.`,
      },
      {
        name: 'Evidence reviewer',
        role: 'reviewer',
        instructions: `require: observations, interpretations, recommendations, limitations
unsupported claims: fail
max missing: 10%
Fail the review if any figure can't be traced to the evidence.`,
      },
    ],
  },
  {
    id: 'website-quality',
    name: 'Website quality review',
    description: 'A written description of a fictional pottery studio’s website, checked against a prioritised checklist. No site is visited.',
    produces: 'Prioritised improvement report',
    input: { kind: 'website', primary: WEBSITE_DESCRIPTION, secondary: WEBSITE_CHECKLIST, claims: '' },
    agents: [
      {
        name: 'Checklist auditor',
        role: 'researcher',
        instructions: `min priority: low
Work only from the supplied description.`,
      },
      {
        name: 'UX analyst',
        role: 'analyst',
        instructions: `max recommendations: 6
interpretations: on
Order fixes by checklist priority.`,
      },
      {
        name: 'QA reviewer',
        role: 'reviewer',
        instructions: `require: observations, recommendations, limitations
unassessed: warn
unsupported claims: fail`,
      },
    ],
  },
  {
    id: 'content-quality',
    name: 'Content quality check',
    description: 'A draft social post for a fictional co-working space, checked against editorial rules and verified facts.',
    produces: 'Strengths, issues and improvements',
    input: { kind: 'content', primary: CONTENT_POST, secondary: CONTENT_RULES, claims: '' },
    agents: [
      {
        name: 'Copy inspector',
        role: 'researcher',
        instructions: `long word length: 10
Measure the post and test every rule.`,
      },
      {
        name: 'Editorial analyst',
        role: 'analyst',
        instructions: `max recommendations: 6
interpretations: on`,
      },
      {
        name: 'Editor',
        role: 'reviewer',
        instructions: `require: observations, recommendations
unassessed: warn
unsupported claims: fail`,
      },
    ],
  },
];

export function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '').slice(0, 10) : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${rand}`;
}

export function workflowFromExample(example: Example, now = new Date()): WorkflowDefinition {
  const ts = now.toISOString();
  return {
    schemaVersion: 1,
    id: newId('wf'),
    name: example.name,
    description: example.description,
    templateId: example.id,
    input: { ...example.input },
    agents: example.agents.map((a) => ({ ...a, id: newId('ag') })),
    createdAt: ts,
    updatedAt: ts,
  };
}

export const DEFAULT_INSTRUCTIONS: Record<AgentConfig['role'], string> = {
  researcher: '',
  analyst: 'threshold: 10%\ninterpretations: on',
  reviewer: 'require: observations, recommendations, limitations\nunsupported claims: fail',
  summariser: 'points: 3\nnext steps: on',
};

export function blankWorkflow(kind: InputKind = 'dataset', now = new Date()): WorkflowDefinition {
  const ts = now.toISOString();
  return {
    schemaVersion: 1,
    id: newId('wf'),
    name: 'Untitled workflow',
    description: '',
    input: { kind, primary: '', secondary: '', claims: '' },
    agents: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Sample input for a kind, used by "Insert sample" in the input editor. */
export function sampleInput(kind: InputKind): WorkflowInput {
  const ex = EXAMPLES.find((e) => e.input.kind === kind)!;
  return { ...ex.input };
}
