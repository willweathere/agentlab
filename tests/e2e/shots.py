"""Capture screenshots of the built app at the tested viewport widths.

Usage: python tests/e2e/shots.py <out_dir> [scenario ...]
Scenarios: workspace, running, done, failed, inspector, report, history, templates, about, mobile, empty
"""

from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from server import serve  # noqa: E402

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "screens")
WANT = set(sys.argv[2:])


def want(name: str) -> bool:
    return not WANT or name in WANT


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with serve() as base, sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(base + "/")
        page.wait_for_selector("[data-node='input']")
        page.wait_for_timeout(500)
        if want("workspace"):
            page.screenshot(path=str(OUT / "workspace-1440.png"))

        if want("inspector"):
            page.click("[data-node]:nth-of-type(3)")
            page.wait_for_timeout(300)
            page.screenshot(path=str(OUT / "inspector-agent-1440.png"))
            page.keyboard.press("Escape")

        if want("running") or want("done"):
            page.get_by_role("button", name="Run workflow").click()
            page.wait_for_timeout(900)
            if want("running"):
                page.screenshot(path=str(OUT / "running-1440.png"))
            page.wait_for_function("() => !document.querySelector('[data-state=running]')", timeout=15000)
            page.wait_for_timeout(2600)
            if want("done"):
                page.screenshot(path=str(OUT / "completed-1440.png"))

        if want("report"):
            page.get_by_role("link", name="Open report").first.click()
            page.wait_for_selector("h1")
            page.wait_for_timeout(400)
            page.screenshot(path=str(OUT / "report-1440.png"), full_page=False)

        for name, path in [("history", "/history"), ("templates", "/templates"), ("about", "/about"), ("settings", "/settings")]:
            if want(name):
                page.goto(base + path)
                page.wait_for_selector("h1")
                page.wait_for_timeout(400)
                page.screenshot(path=str(OUT / f"{name}-1440.png"))

        if want("mobile"):
            m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            mp = m.new_page()
            mp.goto(base + "/")
            mp.wait_for_selector("[data-node='input']")
            mp.wait_for_timeout(500)
            mp.screenshot(path=str(OUT / "workspace-390.png"))
            m.close()

        for w in (1280, 768):
            if want(f"w{w}"):
                c = browser.new_context(viewport={"width": w, "height": 860 if w > 800 else 1024}, device_scale_factor=2)
                cp = c.new_page()
                cp.goto(base + "/")
                cp.wait_for_selector("[data-node='input']")
                cp.wait_for_timeout(500)
                cp.screenshot(path=str(OUT / f"workspace-{w}.png"))
                c.close()

        if errors:
            print("Console errors:")
            for e in errors:
                print(" ", e)
        browser.close()


if __name__ == "__main__":
    main()
