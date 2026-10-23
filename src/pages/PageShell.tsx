import { useEffect, type ReactNode } from 'react';

export function PageShell({ title, lead, actions, children, docTitle }: { title: string; lead?: ReactNode; actions?: ReactNode; children: ReactNode; docTitle?: string }) {
  useEffect(() => {
    document.title = `${docTitle ?? title} | AgentLab`;
  }, [title, docTitle]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1040px] px-4 pb-16 pt-7 sm:px-8 sm:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-[640px]">
            <h1 className="t-title">{title}</h1>
            {lead && <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{lead}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-xl border border-line-strong bg-slab-2 text-ink-2" aria-hidden="true">
        {icon}
      </span>
      <h2 className="t-section mt-4">{title}</h2>
      <p className="mt-1.5 max-w-[420px] text-[13.5px] leading-relaxed text-ink-3">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
