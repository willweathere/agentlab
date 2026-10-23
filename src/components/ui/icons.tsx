import { ChartNoAxesCombined, Globe, MessageSquareText, ScanSearch, ScrollText, ShieldCheck, Table2, type LucideIcon } from 'lucide-react';
import type { AgentRole, InputKind } from '../../engine/types';

export const ROLE_ICONS: Record<AgentRole, LucideIcon> = {
  researcher: ScanSearch,
  analyst: ChartNoAxesCombined,
  reviewer: ShieldCheck,
  summariser: ScrollText,
};

export const INPUT_ICONS: Record<InputKind, LucideIcon> = {
  dataset: Table2,
  website: Globe,
  content: MessageSquareText,
};

export function RoleChip({ role, size = 16 }: { role: AgentRole; size?: number }) {
  const Icon = ROLE_ICONS[role];
  return (
    <span className={`role-chip role-${role}`} aria-hidden="true">
      <Icon size={size} strokeWidth={1.75} />
    </span>
  );
}

/** The AgentLab mark: three stages on one arc, the conduit between them lit. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="al-stroke" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.78 0.16 292)" />
          <stop offset="1" stopColor="oklch(0.74 0.15 245)" />
        </linearGradient>
        <radialGradient id="al-glow" cx="0.5" cy="0.35" r="0.7">
          <stop offset="0" stopColor="oklch(0.6 0.2 290 / 0.45)" />
          <stop offset="1" stopColor="oklch(0.6 0.2 290 / 0)" />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="oklch(0.2 0.014 275)" stroke="oklch(1 0 0 / 0.14)" />
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#al-glow)" />
      <path d="M8 21.5 C 11 11.5, 21 11.5, 24 21.5" fill="none" stroke="url(#al-stroke)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="21.5" r="2.4" fill="oklch(0.2 0.014 275)" stroke="oklch(0.82 0.1 205)" strokeWidth="1.5" />
      <circle cx="16" cy="14" r="2.4" fill="oklch(0.2 0.014 275)" stroke="oklch(0.78 0.11 275)" strokeWidth="1.5" />
      <circle cx="24" cy="21.5" r="2.4" fill="oklch(0.78 0.12 335)" />
    </svg>
  );
}
