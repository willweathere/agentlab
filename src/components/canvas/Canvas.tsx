import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ROLE_SPECS } from '../../engine/contracts';
import { AGENT_ROLES } from '../../engine/types';
import { isRunning, isRunStale, useStore, validationOf } from '../../state/store';
import { ROLE_ICONS, RoleChip } from '../ui/icons';
import { Menu } from '../ui/Menu';
import { bestOrientation, computeLayout, fitView, zoomAround, type Orientation, type View } from './layout';
import { AgentCard, InputNode, ReportNode } from './Nodes';
import { edgeLabel, edgeState, liveRun } from './runView';

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure before the first paint so the graph is never drawn at the wrong scale.
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function Canvas() {
  const workflow = useStore((s) => s.workflow);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const addAgent = useStore((s) => s.addAgent);
  const rawRun = useStore((s) => s.run);
  const stale = useStore(isRunStale);
  const running = useStore(isRunning);
  const run = liveRun(rawRun, stale);
  const validation = validationOf(workflow);

  const [ref, size] = useSize<HTMLDivElement>();
  const ids = workflow.agents.map((a) => a.id);
  const idKey = ids.join('|');
  const pad = size.w < 640 ? 20 : 48;
  const orientation: Orientation = useMemo(() => bestOrientation(idKey ? idKey.split('|') : [], size.w, size.h, pad), [idKey, size.w, size.h, pad]);
  const layout = useMemo(() => computeLayout(idKey ? idKey.split('|') : [], orientation), [idKey, orientation]);

  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [animate, setAnimate] = useState(false);
  const touched = useRef(false);

  const fit = useCallback(
    (smooth: boolean) => {
      if (!size.w || !size.h) return;
      setAnimate(smooth);
      setView(fitView(layout.bounds, size.w, size.h, pad));
      touched.current = false;
    },
    [layout.bounds, size.w, size.h, pad],
  );

  // Refit when the graph changes shape, and on resize until the person pans or zooms.
  const shapeKey = `${ids.length}:${orientation}`;
  const lastShape = useRef('');
  const [fitted, setFitted] = useState(false);
  useLayoutEffect(() => {
    if (!size.w) return;
    setFitted(true);
    if (lastShape.current !== shapeKey) {
      fit(lastShape.current !== '');
      lastShape.current = shapeKey;
    } else if (!touched.current) {
      fit(false);
    }
  }, [shapeKey, size.w, size.h, fit]);

  // --- Pan, zoom and pinch ----------------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; dist?: number; mid?: { x: number; y: number } } | null>(null);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setAnimate(false);
      touched.current = true;
      setView((v) => zoomAround(v, factor, p.x, p.y));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, [role="menu"]')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    gesture.current = { moved: false };
    setAnimate(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const g = gesture.current;
      if (g.dist && g.mid) {
        const dx = mid.x - g.mid.x;
        const dy = mid.y - g.mid.y;
        setView((v) => zoomAround({ ...v, x: v.x + dx, y: v.y + dy }, dist / g.dist!, mid.x, mid.y));
      }
      g.dist = dist;
      g.mid = mid;
      g.moved = true;
      touched.current = true;
      return;
    }
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) {
      gesture.current.moved = true;
      touched.current = true;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2 && gesture.current) {
      gesture.current.dist = undefined;
      gesture.current.mid = undefined;
    }
    if (pointers.current.size === 0) {
      if (gesture.current && !gesture.current.moved) select(null);
      gesture.current = null;
    }
  };

  const zoomBy = (factor: number) => {
    setAnimate(true);
    touched.current = true;
    setView((v) => zoomAround(v, factor, size.w / 2, size.h / 2));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    const step = 48;
    const pan = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (pan) {
      e.preventDefault();
      setAnimate(true);
      touched.current = true;
      setView((v) => ({ ...v, x: v.x + pan[0], y: v.y + pan[1] }));
    } else if (e.key === '+' || e.key === '=') zoomBy(1.2);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.2);
    else if (e.key === '0') fit(true);
    else if (e.key === 'Escape') select(null);
  };

  // --- Render ---------------------------------------------------------------------
  const agentIssues = (id: string) => validation.issues.filter((i) => i.agentId === id);
  const inputHasError = validation.issues.some((i) => i.field === 'input' && i.level === 'error');
  const n = workflow.agents.length;
  const addItems = AGENT_ROLES.map((role) => ({
    label: ROLE_SPECS[role].label,
    description: ROLE_SPECS[role].summary,
    icon: ROLE_ICONS[role],
    className: `role-${role}`,
    disabled: running,
    onSelect: () => addAgent(role),
  }));

  return (
    <section aria-label="Workflow canvas" className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-roledescription="canvas"
        aria-label="Workflow graph. Arrow keys pan, plus and minus zoom, 0 fits the workflow to the view."
        className="canvas-floor absolute inset-0 touch-none select-none outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-selected)]"
        style={{ backgroundSize: `${24 * view.k}px ${24 * view.k}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="canvas-light pointer-events-none absolute inset-0" aria-hidden="true" />
        {n > 0 && fitted && (
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
              transition: animate ? 'transform 320ms var(--ease-out-soft)' : undefined,
              width: layout.width,
              height: layout.height,
            }}
          >
            <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden="true">
              {layout.edges.map((e) => {
                const state = edgeState(run, e.target, n);
                const ux = (e.x2 - e.x1) / e.length;
                const uy = (e.y2 - e.y1) / e.length;
                const tip = { x: e.x2 - ux * 7, y: e.y2 - uy * 7 };
                const arrow = `M ${tip.x - ux * 6 - uy * 4.5} ${tip.y - uy * 6 + ux * 4.5} L ${tip.x} ${tip.y} L ${tip.x - ux * 6 + uy * 4.5} ${tip.y - uy * 6 - ux * 4.5}`;
                const d = `M ${e.x1 + ux * 6} ${e.y1 + uy * 6} L ${tip.x} ${tip.y}`;
                const len = e.length - 13;
                return (
                  <g key={e.key}>
                    <path className="wire" data-state={state} d={d} />
                    <path className="wire" data-state={state} d={arrow} strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 'none' }} />
                    {state === 'active' && (
                      <path className="wire-flow" d={d} style={{ strokeDasharray: `22 ${len}`, ['--len' as string]: `${len + 22}` }} />
                    )}
                  </g>
                );
              })}
            </svg>

            {layout.edges.filter((e) => e.between).map((e) => {
              const state = edgeState(run, e.target, n);
              const label = state === 'active' ? 'Handing over' : edgeLabel(workflow, run, e.target - 1);
              const horizontal = orientation === 'horizontal';
              return (
                <span
                  key={`label-${e.key}`}
                  aria-hidden="true"
                  className={`pointer-events-none absolute whitespace-nowrap rounded-md border px-1.5 py-0.5 t-mono text-[10.5px] transition-colors ${
                    state === 'active'
                      ? 'border-[oklch(0.7_0.19_292/0.45)] bg-[oklch(0.25_0.06_292)] text-[oklch(0.9_0.06_292)]'
                      : state === 'failed'
                        ? 'border-[oklch(0.7_0.19_25/0.4)] bg-[oklch(0.22_0.04_25)] text-[oklch(0.86_0.08_25)]'
                        : state === 'done' || state === 'warning'
                          ? 'border-line-strong bg-slab text-ink-2'
                          : 'border-line bg-void text-ink-3'
                  }`}
                  style={
                    horizontal
                      ? { left: e.mx, top: e.my - 24, transform: 'translateX(-50%)' }
                      : { left: e.mx + 14, top: e.my, transform: 'translateY(-50%)' }
                  }
                >
                  {state === 'failed' ? 'Stopped' : state === 'skipped' || state === 'cancelled' ? 'Not sent' : label}
                </span>
              );
            })}

            {layout.nodes.map((box) => {
              if (box.kind === 'input') {
                return (
                  <InputNode
                    key="input"
                    input={workflow.input}
                    box={box}
                    orientation={orientation}
                    selected={selection?.type === 'input'}
                    hasError={inputHasError}
                    onSelect={() => select({ type: 'input' })}
                  />
                );
              }
              if (box.kind === 'report') {
                return <ReportNode key="report" run={run} box={box} orientation={orientation} selected={selection?.type === 'report'} onSelect={() => select({ type: 'report' })} />;
              }
              const agent = workflow.agents[box.index];
              return (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  index={box.index}
                  count={n}
                  box={box}
                  orientation={orientation}
                  stage={run?.stages.find((s) => s.agentId === agent.id)}
                  selected={selection?.type === 'agent' && selection.id === agent.id}
                  issues={agentIssues(agent.id)}
                  onSelect={() => select({ type: 'agent', id: agent.id })}
                />
              );
            })}
          </div>
        )}
      </div>

      {n === 0 ? (
        <EmptyCanvas />
      ) : (
        <>
          <div className="absolute left-3 top-3 z-10 sm:left-4 sm:top-4">
            <Menu
              label="Add agent"
              align="start"
              width={300}
              triggerClassName="btn btn-secondary glass"
              trigger={
                <>
                  <Plus size={15} aria-hidden="true" /> Add agent
                </>
              }
              items={addItems}
            />
          </div>
          <div className="glass absolute bottom-3 left-3 z-10 flex items-center gap-0.5 rounded-xl p-1 sm:bottom-4 sm:left-4" role="toolbar" aria-label="Zoom">
            <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
              <Minus size={15} />
            </button>
            <span className="t-mono w-11 text-center text-[11px] text-ink-2" aria-live="polite" aria-label={`Zoom ${Math.round(view.k * 100)} percent`}>
              {Math.round(view.k * 100)}%
            </span>
            <button type="button" className="btn btn-ghost btn-sm icon-btn" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>
              <Plus size={15} />
            </button>
            <span className="mx-0.5 h-4 w-px bg-line-strong" aria-hidden="true" />
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Fit workflow to view" onClick={() => fit(true)}>
              <Maximize2 size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Fit</span>
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function EmptyCanvas() {
  const addAgent = useStore((s) => s.addAgent);
  const addStandard = useStore((s) => s.addStandardAgents);
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-y-auto p-4">
      <div className="glass pointer-events-auto w-full max-w-[520px] rounded-2xl p-6 sm:p-7 rise-in">
        <div className="flex items-center gap-2" aria-hidden="true">
          {(['researcher', 'analyst', 'reviewer'] as const).map((r, i) => (
            <span key={r} className="flex items-center gap-2">
              <RoleChip role={r} size={14} />
              {i < 2 && <span className="h-px w-6 bg-line-strong" />}
            </span>
          ))}
        </div>
        <h2 className="t-section mt-5">Add your first agent</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
          Agents run in order, left to right. Each one receives the previous stage’s output, so start with a Researcher to turn the input into evidence.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {AGENT_ROLES.map((role) => (
            <button key={role} type="button" onClick={() => addAgent(role)} className={`role-${role} flex items-start gap-3 rounded-xl border border-line bg-slab/60 p-3 text-left transition-colors hover:border-line-strong hover:bg-slab-2`}>
              <RoleChip role={role} size={15} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-[600]">{ROLE_SPECS[role].label}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{ROLE_SPECS[role].summary}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" onClick={addStandard}>
            Add Researcher, Analyst and Reviewer
          </button>
          <Link href="/templates" className="btn btn-ghost">
            Start from an example
          </Link>
        </div>
      </div>
    </div>
  );
}
