/**
 * The canvas layout is derived entirely from the workflow order: Input, then each agent, then
 * Report. There is no free positioning, so the drawing can never disagree with the definition.
 */

export type Orientation = 'horizontal' | 'vertical';

export interface NodeBox {
  key: string;
  kind: 'input' | 'agent' | 'report';
  index: number; // agent index for agents, -1 otherwise
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeGeom {
  key: string;
  /** Index of the target node in the node list (1..n). */
  target: number;
  /** True when both ends are agents; only these edges carry a payload label. */
  between: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  length: number;
}

export const AGENT_W = 252;
export const AGENT_H = 178;
/** Input and Report are round terminals; their captions sit outside the circle. */
export const TERMINAL = 60;

const GAP = {
  horizontal: { terminal: 76, agent: 108 },
  vertical: { terminal: 64, agent: 84 },
};

/** Extra room the terminal captions need beyond the circles, so fit-to-view keeps them visible. */
const CAPTION = { horizontal: { x: 40, y: 64 }, vertical: { x: 150, y: 0 } };

export function computeLayout(agentIds: string[], orientation: Orientation) {
  const nodes: NodeBox[] = [];
  const items = [
    { key: 'input', kind: 'input' as const, index: -1, w: TERMINAL, h: TERMINAL },
    ...agentIds.map((id, i) => ({ key: id, kind: 'agent' as const, index: i, w: AGENT_W, h: AGENT_H })),
    { key: 'report', kind: 'report' as const, index: -1, w: TERMINAL, h: TERMINAL },
  ];
  const gaps = GAP[orientation];
  let cursor = 0;
  items.forEach((it, i) => {
    if (orientation === 'horizontal') nodes.push({ ...it, x: cursor, y: (AGENT_H - it.h) / 2 });
    else nodes.push({ ...it, x: (AGENT_W - it.w) / 2, y: cursor });
    const next = items[i + 1];
    const gap = next && it.kind === 'agent' && next.kind === 'agent' ? gaps.agent : gaps.terminal;
    cursor += (orientation === 'horizontal' ? it.w : it.h) + gap;
  });

  const edges: EdgeGeom[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    const [x1, y1, x2, y2] =
      orientation === 'horizontal'
        ? [a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2]
        : [a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y];
    edges.push({
      key: `${a.key}->${b.key}`,
      target: i,
      between: a.kind === 'agent' && b.kind === 'agent',
      x1, y1, x2, y2,
      mx: (x1 + x2) / 2,
      my: (y1 + y2) / 2,
      length: Math.hypot(x2 - x1, y2 - y1),
    });
  }
  const last = nodes[nodes.length - 1];
  const width = orientation === 'horizontal' ? last.x + last.w : AGENT_W;
  const height = orientation === 'horizontal' ? AGENT_H : last.y + last.h;
  // Bounds used for fitting include the captions around the terminals.
  const pad = CAPTION[orientation];
  const bounds = orientation === 'horizontal'
    ? { x: -pad.x, y: 0, w: width + pad.x * 2, h: Math.max(height, (AGENT_H + TERMINAL) / 2 + pad.y) }
    : { x: 0, y: 0, w: Math.max(width, width / 2 + TERMINAL / 2 + pad.x), h: height };
  return { nodes, edges, width, height, bounds };
}

export interface View {
  x: number;
  y: number;
  k: number;
}

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 1.6;

export function clampZoom(k: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

export function fitView(bounds: { x: number; y: number; w: number; h: number }, boxW: number, boxH: number, pad = 48): View {
  const k = clampZoom(Math.min((boxW - pad * 2) / bounds.w, (boxH - pad * 2) / bounds.h, 1));
  return { k, x: (boxW - bounds.w * k) / 2 - bounds.x * k, y: (boxH - bounds.h * k) / 2 - bounds.y * k };
}

/** Pick the orientation that shows the workflow larger; prefer horizontal unless vertical is clearly better. */
export function bestOrientation(agentIds: string[], boxW: number, boxH: number, pad: number): Orientation {
  if (!boxW || !boxH) return 'horizontal';
  const kH = fitView(computeLayout(agentIds, 'horizontal').bounds, boxW, boxH, pad).k;
  const kV = fitView(computeLayout(agentIds, 'vertical').bounds, boxW, boxH, pad).k;
  return kV > kH * 1.15 ? 'vertical' : 'horizontal';
}

export function zoomAround(view: View, factor: number, px: number, py: number): View {
  const k = clampZoom(view.k * factor);
  const r = k / view.k;
  return { k, x: px - (px - view.x) * r, y: py - (py - view.y) * r };
}
