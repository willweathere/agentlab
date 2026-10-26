"""Smoke-test a deployed copy of AgentLab.

Usage: python tests/e2e/verify_live.py https://agentlab-ww.netlify.app [screenshot_dir]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://agentlab-ww.netlify.app"
SHOTS = Path(sys.argv[2]) if len(sys.argv) > 2 else None


def main() -> int:
    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page.on("console", lambda m: problems.append(f"console: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        hosts: set[str] = set()
        page.on("request", lambda r: hosts.add(re.sub(r"^(https?://[^/]+).*$", r"\1", r.url)))

        for path, heading in [("/about", "About AgentLab"), ("/history", "Execution history"), ("/templates", "Templates"), ("/settings", "Settings"), ("/runs/run_missing", "Report not found")]:
            page.goto(BASE + path)
            expect(page.get_by_role("heading", level=1)).to_have_text(heading)
            print(f"ok   direct load {path}")

        page.goto(BASE + "/")
        page.evaluate("() => localStorage.clear()")
        page.reload()
        expect(page.locator("#workflow-name")).to_have_value("Sales performance analysis")
        page.locator("header").get_by_role("button", name="Run workflow").click()
        page.wait_for_function("() => !document.querySelector('header [data-state=running]')", timeout=20_000)
        expect(page.locator("header .pill").first).to_have_text("Completed")
        print("ok   sales example ran to Completed")
        if SHOTS:
            SHOTS.mkdir(parents=True, exist_ok=True)
            page.wait_for_timeout(2600)
            page.screenshot(path=str(SHOTS / "live-workspace.png"))
        page.get_by_role("link", name="Open report").first.click()
        expect(page.locator("article")).to_contain_text("£343,200")
        print("ok   report built from real outputs")
        page.reload()
        expect(page.locator("article")).to_contain_text("£343,200")
        print("ok   report reloads from history")
        with page.expect_download() as d:
            page.get_by_role("button", name="Markdown").click()
        assert Path(d.value.path()).read_text(encoding="utf-8").startswith("# Sales performance analysis")
        print("ok   Markdown export downloads")
        if SHOTS:
            page.screenshot(path=str(SHOTS / "live-report.png"))

        other = sorted(h for h in hosts if not h.startswith(BASE) and not h.startswith("data:") and not h.startswith("blob:"))
        if other:
            problems.append(f"requests to other hosts: {other}")
        browser.close()

    for pr in problems:
        print("FAIL", pr)
    print("live checks", "passed" if not problems else "failed")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
