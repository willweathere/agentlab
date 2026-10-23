# AgentLab hand-over (paused 2026-10-23)

Will paused the build to continue next week. This is where things stand.

## Done

- **Engine** (`src/engine/`): typed workflow engine with four roles (Researcher, Analyst,
  Reviewer, Summariser), three input kinds (dataset, website description, social post),
  instruction directives, claim verification, a Reviewer that can fail, cancel, restart,
  a concurrency guard and a report builder with Markdown and text export. `npm test` runs
  18 Vitest tests, all passing.
- **UI**: shell (sidebar, mobile drawer, header), custom pan/zoom canvas, agent cards,
  conduit connections, inspector (agent, input, report, overview), execution drawer, and the
  Templates, History, Report, Settings and About pages. `npm run build` is clean
  (typecheck plus Vite build).
- **Persistence**: localStorage with sanitising and repair (`src/state/persistence.ts`).
- Two commits on `main` in this folder: `9a39a55` (engine), `239d21b` (UI work in progress).

## Not done yet

1. **Visual pass.** The first screenshot at 1440 px shows fit-to-view landing at about 41%,
   so the cards are too small to read. Options: start at 100% scrolled to the start, cap the
   fit zoom at about 0.7 and allow panning, or lay out in two rows. Then review every
   screen against `docs/design-plan.md`.
2. **Browser tests** (`tests/e2e/`): `shots.py` works, but its Run button selector matches
   two buttons (the header one and the drawer one), so scope it to `header`. Still to write:
   the full Playwright suite (navigation, add/edit/remove/reorder, all three examples,
   unsupported claim, failing run, history, persistence after reload, export, mobile at
   390 px, no horizontal scroll at 1440/1280/768/390, no secrets in `dist`).
3. Lighthouse (measured, not claimed), README with real screenshots, `.gitattributes`
   (LF line endings).
4. **Deploy** to a new Netlify site: `netlify sites:create`, then
   `netlify deploy --prod --dir dist --site <new id>`. Always pass `--site` explicitly,
   because the CLI's current link elsewhere is `elite-frontend-starter-ww`. Verify the live
   URL and direct loads of `/history`, `/about` and `/runs/x` (`public/_redirects` is
   already in place).
5. **GitHub**: create a public `willweathere/agentlab` repo with `gh` (the active account was
   `willweathere` on 2026-10-23). Never use the anthony account.
6. Report the live URL to the portfolio session so it can be added to the portfolio.

## How to look at it

```bash
npm install
npm run build
python tests/e2e/shots.py <out-dir> workspace inspector
npm run dev   # http://localhost:5620
```
