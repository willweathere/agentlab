"""Capture the screenshots used in the README from the production build.

Usage: python tests/e2e/readme_shots.py [out_dir]   (default: docs/screenshots)
"""

from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from server import serve  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / "docs" / "screenshots"


def run(page: Page):
    page.locator("header").get_by_role("button", name="Run workflow").click()


def wait_done(page: Page):
    page.wait_for_function("() => !document.querySelector('header [data-state=running]')", timeout=20_000)
    page.wait_for_timeout(2600)  # let the brief "Completed" button state settle


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with serve(5632) as base, sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5)
        page = ctx.new_page()
        page.goto(base + "/")
        page.evaluate("() => localStorage.clear()")
        page.reload()
        page.wait_for_selector("[data-node='input']")
        page.wait_for_timeout(400)

        # Mid-run: the Analyst is receiving the evidence set.
        page.goto(base + "/settings")
        page.get_by_label("Slow").check()
        page.goto(base + "/")
        run(page)
        page.wait_for_selector("[data-status='receiving'] >> nth=0")
        page.wait_for_function("() => document.querySelectorAll('.agent-card[data-status=passed]').length === 1 && document.querySelector('.agent-card[data-status=receiving]')")
        page.wait_for_timeout(500)
        page.screenshot(path=str(OUT / "workspace-running.png"))
        wait_done(page)
        page.screenshot(path=str(OUT / "workspace-completed.png"))

        page.locator(".agent-card").nth(1).click()
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "inspector.png"))

        page.get_by_role("link", name="Open report").first.click()
        page.wait_for_selector("#evidence")
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "report.png"))

        # A run the Reviewer fails because of an unsupported claim.
        page.goto(base + "/settings")
        page.get_by_label("None").check()
        page.goto(base + "/")
        page.locator("[data-node='input']").click()
        claims = page.get_by_label("Claims to verify")
        claims.fill(claims.input_value() + "\nCustomer satisfaction rose to 92%.")
        page.mouse.click(700, 760)
        run(page)
        wait_done(page)
        page.screenshot(path=str(OUT / "workspace-failed.png"))
        page.get_by_role("link", name="Open report").first.click()
        page.wait_for_selector("[role=alert]")
        page.get_by_role("heading", name="Reviewer feedback").scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "report-failed.png"))

        page.goto(base + "/history")
        page.wait_for_selector("h1")
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / "history.png"))

        m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mp = m.new_page()
        mp.goto(base + "/")
        mp.wait_for_selector("[data-node='input']")
        mp.locator("header").get_by_role("button", name="Run workflow").click()
        mp.wait_for_function("() => !document.querySelector('header [data-state=running]')", timeout=20_000)
        mp.wait_for_timeout(2600)
        mp.get_by_role("button", name="Execution").click()
        mp.wait_for_timeout(300)
        mp.screenshot(path=str(OUT / "mobile.png"))
        m.close()
        browser.close()
    print("Saved to", OUT)


if __name__ == "__main__":
    main()
