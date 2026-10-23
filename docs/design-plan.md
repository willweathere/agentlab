# AgentLab design plan

The working token system and layout I set before writing UI code. The brief fixes the
direction (near-black, charcoal, violet and electric-blue accents, fixed state colours);
this plan covers the choices the brief leaves open.

## Colour

| Token | Value | Use |
|---|---|---|
| `void` | `oklch(0.135 0.012 275)` | App background, the canvas floor |
| `slab` | `oklch(0.185 0.012 275)` | Panels, agent cards |
| `slab-raised` | `oklch(0.225 0.014 275)` | Inputs, hovered rows, menus |
| `line` | `oklch(1 0 0 / 0.08)` | Hairline borders |
| `ink` | `oklch(0.95 0.008 275)` | Primary text |
| `ink-muted` | `oklch(0.72 0.014 275)` | Secondary text (≥ 4.5:1 on `slab`) |

State colours (fixed by the brief, always paired with a text label, never colour alone):
activity violet `oklch(0.70 0.19 292)`, selected blue `oklch(0.70 0.17 252)`,
success `oklch(0.78 0.15 160)`, warning `oklch(0.83 0.15 80)`, error `oklch(0.70 0.19 25)`.

Role accents sit at matched lightness and chroma, so they read as one family. They only
tint the role glyph and the card's top seam. State is never shown in a role colour.

| Role | Accent | Glyph |
|---|---|---|
| Researcher | aqua `oklch(0.82 0.10 205)` | scan-search |
| Analyst | iris `oklch(0.78 0.11 275)` | chart |
| Reviewer | orchid `oklch(0.78 0.12 335)` | shield-check |
| Summariser | sand `oklch(0.84 0.09 75)` | scroll-text |

## Type

- **Mona Sans** (variable weight and width). The width axis carries the hierarchy: the
  brand wordmark is set wide (125) and heavy, page titles semi-wide (112), and body and
  agent names stay at normal width. That gives a distinct voice without a second display
  face.
- **Geist Mono** is used only for timestamps, durations, IDs, evidence references and
  execution details, as the brief asks.
- Scale (px): 28 page title / 18 section / 15 agent name / 14 body / 12.5 metadata / 12 status.
- Sentence case everywhere. No all-caps eyebrow labels.

## Layout

```
┌────┬───────────────────────────────────────────────────────┬──────────────┐
│ ◆  │ Sales performance analysis   ● Ready   [Save] [▶ Run] ⋯│  Inspector   │
│    ├───────────────────────────────────────────────────────┤              │
│ +  │  grid + soft radial light                              │  name        │
│ ▦  │                                                        │  role        │
│ ▤  │  [Input]──▶[1 Researcher]──▶[2 Analyst]──▶[3 Reviewer]─▶[Report]     │
│ ◷  │   CSV       evidence         analysis       verdict    │  instructions│
│ ⚙  │                                                        │  contract    │
│ ⓘ  │  [−][+][fit]                                           │  validation  │
│    ├───────────────────────────────────────────────────────┤  last run    │
│    │ Execution ▸ ▮▮▯ 2 of 3 · 14:02:11.204 · 1.2 s           │              │
└────┴───────────────────────────────────────────────────────┴──────────────┘
```

- The graph is derived from the definition: Input → agents in order → Report. Nothing is
  freely positioned and connections can't be drawn by hand, so the picture and the engine
  can't disagree.
- Horizontal on wide canvases, vertical when the canvas is taller than it is wide (phones).
- Content is left-aligned throughout. Numbers in tables are right-aligned and tabular.

## Principles

1. **One memorable thing: the conduit.** Connections are the signature. They carry a
   label for what actually crossed them ("18 facts", "24 statements"), animate only while
   the engine is handing a payload to the next stage, settle into a solid line on success,
   break into a red dash on failure and fade to a dotted line when skipped.
2. **Instruments, not dashboard cards.** Agent cards read like modules in a rack: a role
   seam along the top edge, ports on the sides, and an I/O strip in mono at the foot.
   Panels are flat charcoal; glass blur is reserved for the floating canvas controls and
   the header, where content scrolls beneath it.
3. **Honesty is visible.** Instructions are parsed into directives the engine runs and
   notes it does not. The UI shows which is which. Pacing between stages is labelled as
   pacing, and processing time is reported separately.
4. **Quiet motion.** Only what the person or the engine just did moves. Everything has a
   reduced-motion path.
