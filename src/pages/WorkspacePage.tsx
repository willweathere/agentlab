import { useEffect } from 'react';
import { Canvas } from '../components/canvas/Canvas';
import { ExecutionDrawer } from '../components/drawer/ExecutionDrawer';
import { Inspector } from '../components/inspector/Inspector';
import { WorkspaceHeader } from '../components/shell/WorkspaceHeader';
import { isDirty, useStore } from '../state/store';

export default function WorkspacePage() {
  const dirty = useStore(isDirty);
  const name = useStore((s) => s.workflow.name);

  useEffect(() => {
    document.title = `${name || 'Untitled workflow'} | AgentLab`;
  }, [name]);

  // Unsaved edits live only in memory, so warn before the tab closes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">Workspace: {name}</h1>
      <WorkspaceHeader />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Canvas />
          <ExecutionDrawer />
        </div>
        <Inspector />
      </div>
    </div>
  );
}
