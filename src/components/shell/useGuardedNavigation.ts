import { useLocation } from 'wouter';
import { isDirty, isRunning, useStore } from '../../state/store';
import { useConfirm } from '../ui/Confirm';

/**
 * Wraps actions that replace the open workflow so unsaved edits are never lost silently.
 * Returns a function that asks first (Save and continue, Discard, Cancel) when needed.
 */
export function useGuardedSwitch() {
  const confirm = useConfirm();
  const [, navigate] = useLocation();
  return async (action: () => void, opts: { goTo?: string } = {}) => {
    const s = useStore.getState();
    if (isRunning(s)) {
      s.toast('Cancel the current run before switching workflows.', 'warning');
      return false;
    }
    if (isDirty(s)) {
      const r = await confirm({
        title: 'Keep your changes?',
        body: `“${s.workflow.name || 'Untitled workflow'}” has unsaved changes.`,
        confirmLabel: 'Save and continue',
        altLabel: 'Discard changes',
      });
      if (r === 'cancel') return false;
      if (r === 'confirm') s.save();
    }
    action();
    if (opts.goTo) navigate(opts.goTo);
    return true;
  };
}
