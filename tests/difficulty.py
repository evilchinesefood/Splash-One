"""Run with Python Playwright and Chrome. An optional URL checks a hosted release."""
from pathlib import Path
import sys

from playwright.sync_api import expect, sync_playwright


def check(browser, url, width, height, touch):
    p = browser.new_page(viewport={"width": width, "height": height}, is_mobile=touch, has_touch=touch)
    errors = []
    p.on("pageerror", lambda error: errors.append(str(error)))
    def press(locator):
        locator.tap() if touch else locator.click()

    p.goto(url)
    selector = p.get_by_role("group", name="Select difficulty")
    launch = p.locator("#launch:enabled")
    expect(launch).to_be_visible()
    expect(selector.get_by_role("button", name="1")).to_have_attribute("aria-pressed", "true")
    for level in (1, 2, 3):
        button = selector.get_by_role("button", name=str(level))
        press(button)
        expect(button).to_have_attribute("aria-pressed", "true")
        expected_hint = "Standard formations" if level == 1 else f"+{3 * (level - 1)} enemies per formation"
        expect(p.locator("#difficultyHint")).to_have_text(expected_hint)
        assert p.locator("#home").evaluate("el=>el.scrollWidth<=el.clientWidth")
        if level == 3:
            p.reload()
            expect(selector.get_by_role("button", name="3")).to_have_attribute("aria-pressed", "true")
        press(launch)
        state = p.evaluate("""() => ({level: splashOne.game.difficulty,
            fighters: splashOne.game.enemies.filter(e=>e.mandatory).length})""")
        assert state == {"level": level, "fighters": 9 + 3 * (level - 1)}, state
        if touch:
            press(p.get_by_role("button", name="Pause", exact=True))
        else:
            p.keyboard.press("p")
        press(p.get_by_role("tab", name="Wave", exact=True))
        expect(p.locator("#wave")).to_contain_text("Difficulty " + str(level))
        press(p.get_by_role("button", name="End", exact=True))
        press(p.get_by_role("button", name="Flight deck", exact=True))
    assert not errors, errors
    print(width, height, "selected, launched and verified all three levels; reload and touch layout passed", flush=True)
    p.close()


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else (Path(__file__).resolve().parents[1] / "index.html").as_uri()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        for size in [(1280, 800, False), (320, 568, True), (568, 320, True)]:
            check(browser, url, *size)
        browser.close()
