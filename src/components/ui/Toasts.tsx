import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useStore } from '../../state/store';

const ICON = { neutral: Info, success: CircleCheck, warning: CircleAlert, error: CircleAlert };
const COLOR = { neutral: 'text-ink-3', success: 'text-success', warning: 'text-warning', error: 'text-error' };

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div key={t.id} className="rise-in pointer-events-auto flex max-w-[min(520px,100%)] items-center gap-3 rounded-xl border border-line-strong bg-slab-2 py-2 pl-3 pr-2 text-[13px] shadow-[0_18px_50px_-18px_rgb(0_0_0/0.9)]">
            <Icon size={16} className={`flex-none ${COLOR[t.tone]}`} aria-hidden="true" />
            <span className="min-w-0 text-ink">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
