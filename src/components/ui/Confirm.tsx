import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** An optional third choice, e.g. "Discard" next to "Save and continue". */
  altLabel?: string;
  tone?: 'danger' | 'default';
}

export type ConfirmResult = 'confirm' | 'alt' | 'cancel';

const Ctx = createContext<(o: ConfirmOptions) => Promise<ConfirmResult>>(() => Promise.resolve('cancel'));

export function useConfirm() {
  return useContext(Ctx);
}

/** A single native <dialog> used for every confirmation: focus trap, Esc and backdrop come free. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (opts && ref.current && !ref.current.open) ref.current.showModal();
  }, [opts]);

  const close = (r: ConfirmResult) => {
    ref.current?.close();
    resolver.current?.(r);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onCancel={(e) => {
          e.preventDefault();
          close('cancel');
        }}
        onClick={(e) => {
          if (e.target === ref.current) close('cancel');
        }}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border border-line-strong bg-slab p-0 text-ink shadow-2xl backdrop:bg-transparent"
      >
        {opts && (
          <div className="p-6" style={{ animation: 'sheet-in 200ms var(--ease-out-soft) both' }}>
            <h2 id="confirm-title" className="t-section">{opts.title}</h2>
            <div id="confirm-body" className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{opts.body}</div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => close('cancel')} autoFocus>
                {opts.cancelLabel ?? 'Cancel'}
              </button>
              {opts.altLabel && (
                <button type="button" className="btn btn-secondary" onClick={() => close('alt')}>
                  {opts.altLabel}
                </button>
              )}
              <button type="button" className={`btn ${opts.tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'}`} onClick={() => close('confirm')}>
                {opts.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}
