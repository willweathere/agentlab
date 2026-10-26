import { History, Info, LayoutTemplate, PanelLeftClose, PanelLeftOpen, Plus, Settings2, Workflow, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useMediaQuery } from '../../lib/hooks';
import { useStore } from '../../state/store';
import { LogoMark } from '../ui/icons';
import { useGuardedSwitch } from './useGuardedNavigation';

const NAV: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: '/', label: 'Workspace', icon: Workflow, match: (p) => p === '/' },
  { href: '/templates', label: 'Templates', icon: LayoutTemplate, match: (p) => p.startsWith('/templates') },
  { href: '/history', label: 'Execution history', icon: History, match: (p) => p.startsWith('/history') || p.startsWith('/runs') },
  { href: '/settings', label: 'Settings', icon: Settings2, match: (p) => p.startsWith('/settings') },
  { href: '/about', label: 'About', icon: Info, match: (p) => p.startsWith('/about') },
];

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const [path] = useLocation();
  const guarded = useGuardedSwitch();
  const newWorkflow = useStore((s) => s.newWorkflow);
  const historyCount = useStore((s) => s.history.length);

  const item = 'group relative flex h-10 items-center gap-3 rounded-[10px] text-[13.5px] font-[540] transition-colors';
  const pad = collapsed ? 'justify-center px-0 w-10 mx-auto' : 'px-3';

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      <button
        type="button"
        className={`${item} ${pad} mb-2 border border-line-strong bg-slab-2 text-ink hover:bg-slab-3`}
        title={collapsed ? 'New workflow' : undefined}
        aria-label={collapsed ? 'New workflow' : undefined}
        onClick={async () => {
          if (await guarded(newWorkflow, { goTo: '/' })) onNavigate?.();
        }}
      >
        <Plus size={17} strokeWidth={1.9} aria-hidden="true" />
        {!collapsed && 'New workflow'}
      </button>
      {NAV.map(({ href, label, icon: Icon, match }) => {
        const active = match(path);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
            onClick={onNavigate}
            className={`${item} ${pad} ${active ? 'bg-slab-2 text-ink' : 'text-ink-2 hover:bg-slab-2/60 hover:text-ink'}`}
          >
            {active && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-[linear-gradient(var(--color-activity),var(--color-selected))]" />}
            <Icon size={17} strokeWidth={1.75} aria-hidden="true" className={active ? 'text-[oklch(0.85_0.08_270)]' : ''} />
            {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
            {!collapsed && href === '/history' && historyCount > 0 && <span className="t-mono text-[11px] text-ink-3">{historyCount}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 rounded-lg ${collapsed ? 'justify-center' : 'px-1'}`} aria-label="AgentLab workspace">
      <LogoMark />
      {!collapsed && <span className="t-brand text-[16px] text-ink">AgentLab</span>}
    </Link>
  );
}

const FOOTNOTE = 'Runs in your browser with deterministic processing. No AI model, no server, no account.';

export function Sidebar() {
  const setting = useStore((s) => s.settings.sidebarCollapsed);
  const wide = useMediaQuery('(min-width: 1536px)');
  const collapsed = setting ?? !wide;
  const update = useStore((s) => s.updateSettings);
  return (
    <aside
      aria-label="Sidebar"
      className={`hidden h-dvh flex-none flex-col border-r border-line bg-[oklch(0.15_0.012_275)] py-4 transition-[width] duration-200 md:flex ${collapsed ? 'w-16 px-3' : 'w-[232px] px-3'}`}
    >
      <div className={`mb-6 ${collapsed ? '' : 'px-1'}`}>
        <Brand collapsed={collapsed} />
      </div>
      <NavList collapsed={collapsed} />
      <div className="mt-auto">
        {!collapsed && <p className="mb-3 px-2 text-[11.5px] leading-snug text-ink-3">{FOOTNOTE}</p>}
        <button
          type="button"
          className={`btn btn-ghost btn-sm ${collapsed ? 'icon-btn mx-auto flex' : 'w-full justify-start'}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          onClick={() => update({ sidebarCollapsed: !collapsed })}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}

/** Phone navigation: a modal drawer opened from the top bar. */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label="Navigation"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 h-dvh max-h-none w-[min(300px,86vw)] border-r border-line-strong bg-[oklch(0.15_0.012_275)] p-0 text-ink"
    >
      <div className="flex h-full flex-col px-3 py-4" style={{ animation: 'slide-in-left 200ms var(--ease-out-soft) both' }}>
        <div className="mb-6 flex items-center justify-between px-1">
          <Brand collapsed={false} />
          <button type="button" className="btn btn-ghost icon-btn" aria-label="Close navigation" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <NavList collapsed={false} onNavigate={onClose} />
        <p className="mt-auto px-2 text-[11.5px] leading-snug text-ink-3">{FOOTNOTE}</p>
      </div>
    </dialog>
  );
}
