import { Menu as MenuIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { LogoMark } from '../ui/icons';
import { MobileNav } from './Sidebar';

/** Top bar shown below the md breakpoint, where the sidebar is replaced by a drawer. */
export function MobileBar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-12 flex-none items-center gap-2 border-b border-line bg-[oklch(0.15_0.012_275)] px-2 md:hidden">
      <button type="button" className="btn btn-ghost icon-btn" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
        <MenuIcon size={19} />
      </button>
      <Link href="/" className="flex items-center gap-2 rounded-lg" aria-label="AgentLab workspace">
        <LogoMark size={24} />
        <span className="t-brand text-[15px]">AgentLab</span>
      </Link>
      <MobileNav open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
