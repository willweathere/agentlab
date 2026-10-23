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
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  length: number;
}

export const AGENT_W = 280;
export const AGENT_H = 188;
export const IO_W = 212;
export const IO_H = 156;
const GAP_H = 120;
const GAP_V = 76;

export function computeLayout(agentIds: string[], orientation: Orientation) {
  const nodes: NodeBox[] = [];
  const items = [
    { key: 'input', kind: 'input' as const, index: -1, w: IO_W, h: IO_H },
    ...agentIds.map((id, i) => ({ key: id, kind: 'agent' as const, index: i, w: AGENT_W, h: AGENT_H })),
    { key: 'report', kind: 'report' as const, index: -1, w: IO_W, h: IO_H },
  ];
  let cursor = 0;
  for (const it of items) {
    if (orientation === 'horizontal') {
      nodes.push({ ...it, x: cursor, y: (AGENT_H - it.h) / 2 });
      cursor += it.w + GAP_H;
    } else {
      nodes.push({ ...it, x: (AGENT_W - it.w) / 2, y: cursor });
      cursor += it.h + GAP_V;
    }
  }
  const edges: EdgeGeom[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    const [x1, y1, x2, y2] =
      orientation === 'horizontal'
        ? [a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2]
        : [a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y];
    edges.push({ key: `${a.key}->${b.key}`, target: i, x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2, length: Math.hypot(x2 - x1, y2 - y1) });
  }
  const last = nodes[nodes.length - 1];
  const width = orientation === 'horizontal' ? last.x + last.w : AGENT_W;
  const height = orientation === 'horizontal' ? AGENT_H : last.y + last.h;
  return { nodes, edges, width, height };
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

export function fitView(contentW: number, contentH: number, boxW: number, boxH: number, pad = 48): View {
  const k = clampZoom(Math.min((boxW - pad * 2) / contentW, (boxH - pad * 2) / contentH, 1.05));
  return { k, x: (boxW - contentW * k) / 2, y: (boxH - contentH * k) / 2 };
}

export function zoomAround(view: View, factor: number, px: number, py: number): View {
  const k = clampZoom(view.k * factor);
  const r = k / view.k;
  return { k, x: px - (px - view.x) * r, y: py - (py - view.y) * r };
}
