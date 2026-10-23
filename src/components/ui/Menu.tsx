import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface MenuItem {
  label: string;
  description?: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Extra classes for the item, e.g. a role accent. */
  className?: string;
}

/** A menu button with arrow-key navigation, Escape to close and focus return. */
export function Menu({
  label,
  trigger,
  items,
  align = 'end',
  triggerClassName = 'btn btn-ghost icon-btn',
  width = 240,
  placement = 'below',
}: {
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  triggerClassName?: string;
  width?: number;
  placement?: 'below' | 'above';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = list.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])');
    first?.focus();
    const onDown = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      els[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      els[els.length - 1]?.focus();
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    }
  };

  return (
    <div className="relative">
      <button
        ref={btn}
        type="button"
        className={triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{ width, animation: 'rise-in 160ms var(--ease-out-soft) both' }}
          className={`absolute z-50 ${placement === 'below' ? 'top-full mt-1.5' : 'bottom-full mb-1.5'} ${align === 'end' ? 'right-0' : 'left-0'} max-w-[calc(100vw-24px)] rounded-xl border border-line-strong bg-slab-2 p-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.85)]`}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  btn.current?.focus();
                  item.onSelect();
                }}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none transition-colors hover:bg-slab-3 focus-visible:bg-slab-3 focus-visible:outline-none disabled:opacity-40 ${item.danger ? 'text-[oklch(0.82_0.12_25)]' : 'text-ink'} ${item.className ?? ''}`}
              >
                {Icon && <Icon size={15} strokeWidth={1.75} className={`mt-0.5 flex-none ${item.danger ? '' : 'text-[var(--accent,var(--color-ink-3))]'}`} aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="block font-medium">{item.label}</span>
                  {item.description && <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{item.description}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
