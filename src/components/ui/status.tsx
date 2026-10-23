import type { RunStatus, StageStatus } from '../../engine/types';

export type Tone = 'activity' | 'success' | 'warning' | 'error' | 'selected' | 'muted';

export const STAGE_STATUS: Record<StageStatus | 'idle', { label: string; tone: Tone; live?: boolean }> = {
  idle: { label: 'Not run', tone: 'muted' },
  queued: { label: 'Queued', tone: 'muted' },
  receiving: { label: 'Receiving input', tone: 'activity', live: true },
  running: { label: 'Running', tone: 'activity', live: true },
  passed: { label: 'Passed', tone: 'success' },
  warning: { label: 'Warnings', tone: 'warning' },
  failed: { label: 'Failed', tone: 'error' },
  skipped: { label: 'Skipped', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const RUN_STATUS: Record<RunStatus, { label: string; tone: Tone; live?: boolean }> = {
  running: { label: 'Running', tone: 'activity', live: true },
  completed: { label: 'Completed', tone: 'success' },
  warning: { label: 'Completed with warnings', tone: 'warning' },
  failed: { label: 'Failed', tone: 'error' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export function StatusPill({ label, tone, live, className = '' }: { label: string; tone: Tone; live?: boolean; className?: string }) {
  return (
    <span className={`pill tone-${tone} ${className}`}>
      <span className="pill-dot" data-live={live ? 'true' : undefined} aria-hidden="true" />
      {label}
    </span>
  );
}
