"""Verify custom bindings in Chrome. An optional URL tests the installed game."""
from pathlib import Path
import sys
import time

from playwright.sync_api import expect, sync_playwright


def run(page, url):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    def flight_reaches(expression):
        end = time.monotonic() + 8
        while time.monotonic() < end:
            if page.evaluate(expression):
                return
            time.sleep(.03)
        raise AssertionError(expression)

    page.goto(url)
    launch = page.locator("#launch:enabled")
    launch.click()
    controls = page.get_by_role("tab", name="Controls")
    resume = page.get_by_role("button", name="Resume", exact=True)
    status = page.locator(".binding-status")

    def binding(action, slot="first"):
        return page.locator(f'button[aria-label^="{action}, {slot} binding,"]')

    page.keyboard.press("p")
    controls.click()
    page.locator("#captureMouse").uncheck()
    primary = binding("Primary weapon")
    primary.click()
    page.keyboard.press("f")
    expect(status).to_contain_text("already controls missile")
    page.keyboard.press("j")
    expect(primary).to_have_text("J")
    missile = binding("Missile")
    missile.click()
    missile.click()
    expect(missile).to_have_text("Left click")
    boost = binding("Afterburner", "alternate")
    boost.click()
    boost.click(button="middle")
    expect(boost).to_have_text("Middle click")
    pause_key = binding("Pause / resume")
    pause_key.click()
    page.keyboard.press("o")
    expect(pause_key).to_have_text("O")
    primary.click()
    page.keyboard.press("Escape")
    expect(resume).to_be_visible()
    expect(primary).to_have_text("J")
    primary.click()
    page.get_by_role("tab", name="Wave").click()
    controls.click()
    expect(primary).to_have_attribute("aria-pressed", "false")
    page.reload()
    launch.click()
    page.keyboard.press("p")
    expect(resume).to_be_hidden()
    page.keyboard.press("o")
    controls.click()
    expect(primary).to_have_text("J")
    expect(missile).to_have_text("Left click")
    expect(boost).to_have_text("Middle click")
    resume.click()
    page.mouse.move(600, 400)
    page.keyboard.down("j")
    page.mouse.down(button="middle")
    flight_reaches("patrol.game.player.boost && patrol.game.shots.some(s => s.kind === 'cannon')")
    page.keyboard.down("Shift")
    page.mouse.up(button="middle")
    page.mouse.click(600, 400)
    flight_reaches("patrol.game.player.missiles === 3 && patrol.game.player.boost")
    page.keyboard.up("Shift")
    page.keyboard.up("j")
    flight_reaches("!patrol.game.player.boost")
    page.keyboard.press("Escape")
    controls.click()
    boost.click()
    page.keyboard.press("Delete")
    expect(boost).to_have_text("+ Add")
    page.get_by_role("button", name="Restore defaults").click()
    expect(primary).to_have_text("Left click")
    expect(missile).to_have_text("Right click")
    expect(pause_key).to_have_text("P")
    assert not errors, errors


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else (Path(__file__).resolve().parents[1] / "index.html").as_uri()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome")
        run(browser.new_page(viewport={"width": 1200, "height": 800}), url)
        browser.close()
    print("Custom keyboard and mouse bindings, conflicts, simultaneous inputs, persistence, cancellation and restore passed.")
