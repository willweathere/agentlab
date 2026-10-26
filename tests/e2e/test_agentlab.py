"""Browser tests for AgentLab, run against the production build in Microsoft Edge.

    npm run build
    python tests/e2e/test_agentlab.py

Each check prints PASS or FAIL; the script exits non-zero if anything fails.
"""

from __future__ import annotations

import re
import sys
import traceback
from pathlib import Path
from typing import Callable

from playwright.sync_api import Browser, Page, expect, sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from server import DIST, serve  # noqa: E402

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str):
    def wrap(fn: Callable[..., None]):
        def run(*args, **kwargs):
            try:
                fn(*args, **kwargs)
                RESULTS.append((name, True, ""))
                print(f"PASS  {name}")
            except Exception as e:  # noqa: BLE001
                RESULTS.append((name, False, f"{e}"))
                print(f"FAIL  {name}\n      {e}")
                traceback.print_exc(limit=2)

        return run

    return wrap


# --- helpers ---------------------------------------------------------------------------


def run_button(page: Page):
    return page.locator("header").get_by_role("button", name=re.compile(r"^(Run workflow|Run again|Completed)$"))


def run_and_wait(page: Page):
    run_button(page).click()
    page.wait_for_function("() => !document.querySelector('header [data-state=running]')", timeout=20_000)
    page.wait_for_timeout(150)


def header_status(page: Page) -> str:
    return page.locator("header .pill").first.inner_text()


def agent_cards(page: Page):
    return page.locator("button.agent-card")


def discard_if_asked(page: Page):
    dialog = page.get_by_role("dialog")
    try:
        dialog.get_by_role("button", name="Discard changes").click(timeout=800)
    except Exception:  # noqa: BLE001 - no unsaved-changes prompt
        pass


def load_example(page: Page, base: str, name: str):
    page.goto(base + "/templates")
    card = page.locator("article").filter(has=page.get_by_role("heading", name=name))
    card.get_by_role("button", name="Use this example").click()
    discard_if_asked(page)
    expect(page.locator("#workflow-name")).to_have_value(name)


def stage_rows(page: Page):
    return page.get_by_role("region", name="Execution").locator("tbody tr")


def no_horizontal_scroll(page: Page) -> bool:
    return page.evaluate("() => document.documentElement.scrollWidth <= window.innerWidth + 1")


# --- checks ----------------------------------------------------------------------------


@check("Navigation: every sidebar item opens its page")
def t_navigation(page: Page, base: str):
    page.goto(base + "/")
    expect(page.locator("[data-node='input']")).to_be_visible()
    for label, heading in [("Templates", "Templates"), ("Execution history", "Execution history"), ("Settings", "Settings"), ("About", "About AgentLab")]:
        link = page.get_by_role("navigation", name="Main").get_by_role("link", name=label)
        link.click()
        expect(page.get_by_role("heading", level=1)).to_have_text(heading)
        expect(link).to_have_attribute("aria-current", "page")
    page.get_by_role("navigation", name="Main").get_by_role("link", name="Workspace").click()
    expect(page.locator("[data-node='input']")).to_be_visible()


@check("Direct loads of client routes work (SPA fallback)")
def t_direct_routes(page: Page, base: str):
    for path, text in [("/history", "Execution history"), ("/about", "About AgentLab"), ("/templates", "Templates"), ("/settings", "Settings"), ("/runs/run_missing", "Report not found"), ("/no-such-page", "Page not found")]:
        page.goto(base + path)
        expect(page.get_by_role("heading", level=1)).to_have_text(text)


@check("Settings: step delay can be changed")
def t_settings(page: Page, base: str):
    page.goto(base + "/settings")
    page.get_by_label(re.compile(r"^None")).check()
    expect(page.get_by_label(re.compile(r"^None"))).to_be_checked()


@check("New workflow: empty state, add, rename, reorder, remove and undo")
def t_editor(page: Page, base: str):
    page.goto(base + "/")
    page.get_by_role("button", name="New workflow").click()
    discard_if_asked(page)
    expect(page.get_by_role("heading", name="Add your first agent")).to_be_visible()
    expect(page.locator("#workflow-name")).to_have_value("Untitled workflow")

    page.get_by_role("button", name=re.compile(r"^Researcher")).click()
    for role in ["Analyst", "Reviewer"]:
        page.get_by_role("button", name="Add agent").click()
        page.get_by_role("menuitem", name=re.compile(rf"^{role}")).click()
    expect(agent_cards(page)).to_have_count(3)

    # Rename the analyst; the card follows.
    agent_cards(page).nth(1).click()
    name = page.get_by_label("Name", exact=True)
    name.fill("Test analyst")
    expect(agent_cards(page).nth(1)).to_contain_text("Test analyst")

    # Moving the Reviewer before the Analyst breaks the contract chain and blocks the run.
    agent_cards(page).nth(2).click()
    page.get_by_role("button", name="Move earlier").click()
    expect(agent_cards(page).nth(1)).to_contain_text("Reviewer")
    expect(page.locator("header")).to_contain_text("issue")
    expect(run_button(page)).to_have_attribute("aria-disabled", "true")
    page.get_by_role("button", name="Move later").click()
    expect(agent_cards(page).nth(2)).to_contain_text("Reviewer")

    # Add, remove and undo a Summariser.
    page.get_by_role("button", name="Add agent").click()
    page.get_by_role("menuitem", name=re.compile(r"^Summariser")).click()
    expect(agent_cards(page)).to_have_count(4)
    page.get_by_role("button", name="Remove", exact=True).click()
    expect(agent_cards(page)).to_have_count(3)
    page.get_by_role("button", name="Undo").click()
    expect(agent_cards(page)).to_have_count(4)
    page.get_by_role("button", name="Remove", exact=True).click()
    expect(agent_cards(page)).to_have_count(3)

    # Edit the input, then run the hand-built workflow.
    page.locator("[data-node='input']").click()
    page.get_by_role("button", name="Insert sample dataset").click()
    expect(page.get_by_label("Dataset (CSV)")).to_have_value(re.compile(r"^month,region,revenue"))
    run_and_wait(page)
    expect(page.locator("header")).to_contain_text("Completed")
    expect(stage_rows(page)).to_have_count(3)


@check("Examples: all three run in order and pass outputs between stages")
def t_examples(page: Page, base: str):
    expected = {
        "Sales performance analysis": "Completed",
        "Website quality review": "Completed with warnings",
        "Content quality check": "Completed",
    }
    for name, status in expected.items():
        load_example(page, base, name)
        run_and_wait(page)
        expect(page.locator("header .pill").first).to_have_text(status)
        rows = stage_rows(page)
        expect(rows).to_have_count(3)
        outputs = [rows.nth(i).locator("td").nth(5).inner_text() for i in range(3)]
        assert re.search(r"\d+ facts", outputs[0]), outputs
        assert "statements" in outputs[1], outputs
        assert re.search(r"(Passed|checks)", outputs[2]), outputs
        starts = [rows.nth(i).locator("td").nth(2).inner_text() for i in range(3)]
        assert starts == sorted(starts), f"stages did not start in order: {starts}"
        # The Analyst received the Researcher's output.
        agent_cards(page).nth(1).click()
        expect(page.get_by_role("complementary", name="Inspector")).to_contain_text(re.compile(r"Input: Evidence set \(\d+ facts\)"))
        page.get_by_role("link", name="Open report").first.click()
        expect(page.get_by_role("heading", level=2, name="Findings")).to_be_visible()
        expect(page.locator("#evidence")).to_be_visible()
        page.get_by_role("navigation", name="Main").get_by_role("link", name="Workspace").click()


@check("Results change when the input changes")
def t_results_change(page: Page, base: str):
    load_example(page, base, "Sales performance analysis")
    run_and_wait(page)
    page.get_by_role("link", name="Open report").first.click()
    before = page.locator("article").inner_text()
    assert "£343,200" in before
    page.get_by_role("navigation", name="Main").get_by_role("link", name="Workspace").click()
    page.locator("[data-node='input']").click()
    box = page.get_by_label("Dataset (CSV)")
    box.fill(box.input_value().replace("2026-06,North,23100", "2026-06,North,43100"))
    run_and_wait(page)
    page.get_by_role("link", name="Open report").first.click()
    after = page.locator("article").inner_text()
    assert "£363,200" in after and "£343,200" not in after


@check("Reviewer flags an unsupported claim and fails the run")
def t_unsupported_claim(page: Page, base: str):
    load_example(page, base, "Sales performance analysis")
    page.locator("[data-node='input']").click()
    claims = page.get_by_label("Claims to verify")
    claims.fill(claims.input_value() + "\nCustomer satisfaction rose to 92%.")
    run_and_wait(page)
    expect(page.locator("header .pill").first).to_have_text("Failed at stage 3")
    expect(stage_rows(page).nth(2)).to_contain_text("Failed")
    page.get_by_role("link", name="Open report").first.click()
    expect(page.get_by_role("alert")).to_contain_text("failed at stage 3")
    expect(page.locator("article")).to_contain_text("“Customer satisfaction rose to 92%.”")
    expect(page.locator("article .pill", has_text="unsupported")).to_have_count(1)
    expect(page.get_by_role("heading", level=1)).to_be_visible()
    assert "Failed, partial results" in page.locator("main").inner_text()


@check("A processing error fails the stage and skips the rest")
def t_failing_run(page: Page, base: str):
    load_example(page, base, "Sales performance analysis")
    page.locator("[data-node='input']").click()
    page.get_by_label("Dataset (CSV)").fill("name,colour\nmug,blue\nplate,green")
    run_and_wait(page)
    rows = stage_rows(page)
    expect(rows.nth(0)).to_contain_text("Failed")
    expect(rows.nth(1)).to_contain_text("Skipped")
    expect(rows.nth(2)).to_contain_text("Skipped")
    expect(page.get_by_role("region", name="Execution")).to_contain_text("no numeric columns")
    page.get_by_role("link", name="Open report").first.click()
    expect(page.get_by_role("alert")).to_contain_text("failed at stage 1")
    expect(page.locator("article")).to_contain_text("Not produced")


@check("Cancel stops a run between stages")
def t_cancel(page: Page, base: str):
    page.goto(base + "/settings")
    page.get_by_label(re.compile(r"^Slow")).check()
    load_example(page, base, "Content quality check")
    run_button(page).click()
    page.locator("header").get_by_role("button", name="Cancel run").click()
    page.wait_for_function("() => !document.querySelector('header [data-state=running]')", timeout=10_000)
    expect(page.locator("header .pill").first).to_have_text("Cancelled")
    page.goto(base + "/settings")
    page.get_by_label(re.compile(r"^None")).check()


@check("History records runs with real timestamps and opens their reports")
def t_history(page: Page, base: str):
    page.goto(base + "/history")
    runs = page.get_by_role("list", name="Runs, newest first")
    expect(runs).to_be_visible()
    items = runs.get_by_role("listitem")
    count = items.count()
    assert count >= 6, f"expected at least 6 runs, found {count}"
    first = items.first
    expect(first.locator("time")).to_have_attribute("datetime", re.compile(r"^\d{4}-\d{2}-\d{2}T"))
    expect(first).to_contain_text(re.compile(r"\d of \d stages"))
    first.get_by_role("link").click()
    expect(page.get_by_role("heading", level=2, name="Stage trace")).to_be_visible()


@check("Report exports as Markdown and text")
def t_export(page: Page, base: str):
    load_example(page, base, "Website quality review")
    run_and_wait(page)
    page.get_by_role("link", name="Open report").first.click()
    with page.expect_download() as d:
        page.get_by_role("button", name="Markdown").click()
    md = Path(d.value.path()).read_text(encoding="utf-8")
    assert md.startswith("# Website quality review"), md[:80]
    assert "Status: Completed with warnings" in md and "## Recommendations" in md
    assert "No website was visited" in md
    with page.expect_download() as d2:
        page.get_by_role("button", name="Text").click()
    txt = Path(d2.value.path()).read_text(encoding="utf-8")
    assert txt.startswith("Website quality review\n=") and "Limitations\n-" in txt


@check("Saves persist after a reload; deleting needs confirmation")
def t_persistence(page: Page, base: str):
    load_example(page, base, "Content quality check")
    page.locator("#workflow-name").fill("Persistence check")
    page.locator("header").get_by_role("button", name="Save workflow").click()
    expect(page.locator("header").get_by_role("button", name="Saved")).to_be_visible()
    page.reload()
    expect(page.locator("#workflow-name")).to_have_value("Persistence check")
    page.goto(base + "/templates")
    row = page.get_by_role("listitem").filter(has_text="Persistence check")
    expect(row).to_have_count(1)
    row.get_by_role("button", name="Delete Persistence check").click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_contain_text("Delete “Persistence check”?")
    dialog.get_by_role("button", name="Cancel").click()
    expect(row).to_have_count(1)
    row.get_by_role("button", name="Delete Persistence check").click()
    page.get_by_role("dialog").get_by_role("button", name="Delete workflow").click()
    expect(page.get_by_role("listitem").filter(has_text="Persistence check")).to_have_count(0)
    page.reload()
    expect(page.get_by_role("heading", name="No saved workflows yet")).to_be_visible()


@check("Clearing history needs confirmation")
def t_clear_history(page: Page, base: str):
    page.goto(base + "/history")
    page.get_by_role("button", name="Clear history").click()
    page.get_by_role("dialog").get_by_role("button", name="Cancel").click()
    expect(page.get_by_role("list", name="Runs, newest first")).to_be_visible()


@check("Malformed or old stored data is tolerated")
def t_malformed_storage(page: Page, base: str):
    page.goto(base + "/")
    page.evaluate(
        """() => {
        localStorage.setItem('agentlab:v1:workflows', JSON.stringify([
          { id: 'wf_old', name: 'Old shape', input: { kind: 'dataset', primary: 'a,b\\n1,2' },
            agents: [{ id: 'a1', name: 'Mystery', role: 'oracle' }, { id: 'a2', name: 'R', role: 'researcher' }] },
          { nonsense: true }
        ]));
        localStorage.setItem('agentlab:v1:history', '{not json');
      }"""
    )
    page.reload()
    expect(page.get_by_role("status").filter(has_text="unreadable")).to_be_visible()
    page.goto(base + "/templates")
    expect(page.get_by_role("listitem").filter(has_text="Old shape")).to_contain_text("1 agent")
    page.evaluate("() => localStorage.clear()")


@check("Reduced motion turns off moving connections")
def t_reduced_motion(browser: Browser, base: str):
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
    page = ctx.new_page()
    page.goto(base + "/settings")
    page.get_by_label(re.compile(r"^Slow")).check()
    page.goto(base + "/")
    run_button(page).click()
    page.wait_for_selector(".wire-flow", state="attached", timeout=5000)
    display = page.evaluate("() => getComputedStyle(document.querySelector('.wire-flow')).display")
    assert display == "none", display
    ctx.close()


@check("Visible keyboard focus")
def t_focus(page: Page, base: str):
    page.goto(base + "/about")
    page.keyboard.press("Tab")
    page.keyboard.press("Tab")
    style = page.evaluate("() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth, document.activeElement.tagName]; }")
    assert style[0] != "none" and style[1] != "0px", style


@check("No horizontal scroll at 1440, 1280, 768 and 390 px")
def t_viewports(browser: Browser, base: str):
    for w, h in [(1440, 900), (1280, 800), (768, 1024), (390, 844)]:
        ctx = browser.new_context(viewport={"width": w, "height": h}, is_mobile=w < 500, has_touch=w < 500)
        page = ctx.new_page()
        for path in ["/", "/templates", "/history", "/settings", "/about"]:
            page.goto(base + path)
            page.wait_for_timeout(250)
            assert no_horizontal_scroll(page), f"horizontal scroll at {w}px on {path}"
        ctx.close()


@check("Mobile: navigation drawer and inspector sheet work at 390 px")
def t_mobile(browser: Browser, base: str):
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(base + "/")
    page.get_by_role("button", name="Open navigation").click()
    nav = page.get_by_role("dialog", name="Navigation")
    expect(nav).to_be_visible()
    nav.get_by_role("link", name="About").click()
    expect(page.get_by_role("heading", level=1)).to_have_text("About AgentLab")
    page.goto(base + "/")
    agent_cards(page).first.tap()
    sheet = page.get_by_role("dialog", name="Inspector")
    expect(sheet).to_be_visible()
    box = page.get_by_role("button", name="Close inspector").bounding_box()
    assert box and box["width"] >= 36 and box["height"] >= 36, box
    page.get_by_role("button", name="Close inspector").click()
    expect(sheet).to_have_count(0)
    run_and_wait(page)
    expect(page.locator("header")).to_contain_text(re.compile(r"Run again|Completed"))
    assert no_horizontal_scroll(page)
    ctx.close()


@check("No secrets or API keys in the build")
def t_secrets(_: Page, __: str):
    patterns = [r"sk-[A-Za-z0-9]{16,}", r"AKIA[0-9A-Z]{16}", r"ghp_[A-Za-z0-9]{20,}", r"github_pat_", r"-----BEGIN [A-Z ]*PRIVATE KEY", r"(?i)api[_-]?key\s*[:=]\s*['\"][^'\"]{8,}", r"(?i)bearer\s+[A-Za-z0-9._-]{20,}", r"anthropic|openai\.com/v1"]
    hits = []
    for f in DIST.rglob("*"):
        if f.suffix in {".js", ".css", ".html", ".json", ".txt", ".map"}:
            text = f.read_text(encoding="utf-8", errors="ignore")
            hits += [f"{f.name}: {p}" for p in patterns if re.search(p, text)]
    assert not hits, hits


def main() -> int:
    with serve() as base, sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page = ctx.new_page()
        console_errors: list[str] = []
        external: list[str] = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.on("request", lambda r: external.append(r.url) if not r.url.startswith(base) and not r.url.startswith("data:") and not r.url.startswith("blob:") else None)
        page.goto(base + "/")
        page.evaluate("() => localStorage.clear()")

        for t in [t_navigation, t_direct_routes, t_settings, t_editor, t_examples, t_results_change, t_unsupported_claim, t_failing_run, t_cancel, t_history, t_export, t_persistence, t_clear_history, t_malformed_storage, t_focus]:
            t(page, base)
        for t in [t_reduced_motion, t_viewports, t_mobile]:
            t(browser, base)
        t_secrets(page, base)

        @check("No console errors and no requests to other hosts")
        def t_clean():
            noise = [e for e in console_errors if "favicon" not in e]
            assert not noise, noise
            assert not external, external

        t_clean()
        browser.close()

    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)} of {len(RESULTS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
