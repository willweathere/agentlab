import { Check, CircleAlert, CircleMinus, TriangleAlert } from 'lucide-react';
import type { Analysis, CheckStatus, ClaimVerdict, EvidenceSet, Review, Statement, Summary } from '../../engine/types';

const CHECK_ICON: Record<CheckStatus, { Icon: typeof Check; cls: string; label: string }> = {
  pass: { Icon: Check, cls: 'text-success', label: 'Pass' },
  warn: { Icon: TriangleAlert, cls: 'text-warning', label: 'Warning' },
  fail: { Icon: CircleAlert, cls: 'text-error', label: 'Fail' },
};

const CLAIM_TONE: Record<ClaimVerdict['status'], string> = {
  supported: 'tone-success',
  unsupported: 'tone-error',
  contradicted: 'tone-error',
};

export function Refs({ refs, linkFacts }: { refs: string[]; linkFacts?: boolean }) {
  if (!refs.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {refs.map((r) =>
        linkFacts && r.startsWith('F') ? (
          <a key={r} href={`#fact-${r}`} className="ref-chip" aria-label={`Evidence ${r}`}>
            {r}
          </a>
        ) : (
          <span key={r} className="ref-chip">
            {r}
          </span>
        ),
      )}
    </span>
  );
}

export function StatementList({ items, linkFacts, showPriority }: { items: Statement[]; linkFacts?: boolean; showPriority?: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li key={s.id} className="flex gap-2.5 text-[13.5px] leading-relaxed">
          <span className="stmt-id mt-[2px] w-8 flex-none">{s.id}</span>
          <span className="min-w-0">
            {showPriority && s.priority && (
              <span className={`pill mr-1.5 align-middle ${s.priority === 'high' ? 'tone-error' : s.priority === 'medium' ? 'tone-warning' : 'tone-muted'}`}>
                {s.priority}
              </span>
            )}
            <span className="text-ink">{s.text}</span>
            <Refs refs={s.refs} linkFacts={linkFacts} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function EvidenceTable({ evidence, anchors }: { evidence: EvidenceSet; anchors?: boolean }) {
  const groups = Array.from(new Set(evidence.facts.map((f) => f.group)));
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g}>
          <h4 className="mb-1.5 text-[12.5px] font-[600] text-ink-2">{g}</h4>
          <dl className="divide-y divide-line rounded-xl border border-line">
            {evidence.facts
              .filter((f) => f.group === g)
              .map((f) => (
                <div key={f.id} id={anchors ? `fact-${f.id}` : undefined} className="grid scroll-mt-24 grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 px-3 py-2 target:bg-[oklch(0.7_0.17_252/0.08)] sm:grid-cols-[2.25rem_minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <span className="t-mono pt-px text-[11px] text-ink-3">{f.id}</span>
                  <dt className="text-[13px] text-ink-2">
                    {f.check && (
                      <span className="mr-1.5 inline-block align-[-2px]" aria-label={f.check === 'pass' ? 'Pass' : f.check === 'fail' ? 'Fail' : 'Not assessed'}>
                        {f.check === 'pass' ? <Check size={13} className="text-success" /> : f.check === 'fail' ? <CircleAlert size={13} className="text-error" /> : <CircleMinus size={13} className="text-ink-3" />}
                      </span>
                    )}
                    {f.label}
                  </dt>
                  <dd className="col-start-2 text-[13px] text-ink sm:col-start-3">
                    {f.display}
                    <span className="mt-0.5 block t-meta text-[11.5px]">{f.source}</span>
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
      {evidence.claims.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[12.5px] font-[600] text-ink-2">Claims to verify (not evidence)</h4>
          <ul className="space-y-1.5">
            {evidence.claims.map((c) => (
              <li key={c.id} className="flex gap-2.5 text-[13px]">
                <span className="stmt-id w-8 flex-none">{c.id}</span>
                <span className="text-ink-2">“{c.text}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AnalysisView({ analysis, linkFacts }: { analysis: Analysis; linkFacts?: boolean }) {
  const sections: [string, Statement[]][] = [
    ['Observations', analysis.observations],
    ['Interpretations', analysis.interpretations],
    ['Recommendations', analysis.recommendations],
    ['Unavailable information', analysis.unavailable],
  ];
  return (
    <div className="space-y-4">
      {sections.map(([title, items]) => (
        <div key={title}>
          <h4 className="mb-2 text-[12.5px] font-[600] text-ink-2">
            {title} <span className="t-mono text-ink-3">{items.length}</span>
          </h4>
          {items.length ? <StatementList items={items} linkFacts={linkFacts} showPriority={title === 'Recommendations'} /> : <p className="t-meta">None.</p>}
        </div>
      ))}
    </div>
  );
}

export function ReviewView({ review }: { review: Review }) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {review.checks.map((c) => {
          const { Icon, cls, label } = CHECK_ICON[c.status];
          return (
            <li key={c.id} className="rounded-xl border border-line bg-well/60 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <Icon size={15} className={`mt-0.5 flex-none ${cls}`} aria-label={label} />
                <div className="min-w-0">
                  <div className="text-[13px] font-[600] text-ink">{c.label}</div>
                  <div className="text-[12.5px] text-ink-2">{c.detail}</div>
                  {c.findings.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {c.findings.map((f, i) => (
                        <li key={i} className="text-[12.5px] leading-snug text-ink-2">
                          {f.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {review.claims.length > 0 && (
        <div>
          <h4 className="mb-2 text-[12.5px] font-[600] text-ink-2">Claims</h4>
          <ul className="space-y-2">
            {review.claims.map((c) => (
              <li key={c.claimId} className="text-[13px] leading-relaxed">
                <span className={`pill ${CLAIM_TONE[c.status]} mr-2 align-middle`}>{c.status}</span>
                <span className="text-ink">“{c.text}”</span>
                <span className="block text-[12.5px] text-ink-3">{c.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SummaryView({ summary }: { summary: Summary }) {
  return (
    <div className="space-y-3">
      <p className="text-[13.5px] text-ink">{summary.headline}</p>
      <StatementList items={summary.points} />
      {summary.next.length > 0 && (
        <>
          <h4 className="text-[12.5px] font-[600] text-ink-2">Next steps</h4>
          <StatementList items={summary.next} />
        </>
      )}
    </div>
  );
}
