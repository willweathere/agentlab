import type { ReactNode } from 'react';

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-6 border-t border-line pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-[620] text-ink" style={{ fontStretch: '106%' }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
