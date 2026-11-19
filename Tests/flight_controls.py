"""Run with Python Playwright and Chrome. Pass a URL to check a hosted release."""
from pathlib import Path
import sys
import time

from playwright.sync_api import expect, sync_playwright


def until(check):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.04)
    raise AssertionError("Flight did not reach the expected state")


def desktop(browser, url):
    page = browser.new_page(viewport={"width": 1200, "height": 800})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    page.locator("#launch:enabled").click()
    pause = lambda: page.keyboard.press("p")
    resume = lambda: page.get_by_role("button", name="Resume", exact=True).click()
    pause()
    page.locator("#captureMouse").uncheck()
    page.locator("#startingView").select_option("cockpit")
    page.locator("#showLead").uncheck()
    slider = page.locator("#sensitivity")
    slider.focus()
    slider.press("Home")
    expect(page.locator("#sensitivityValue")).to_have_text("50%")
    resume()
    page.evaluate("""() => {
      const g = patrol.game, step = g.step;
      g.step = (dt, input) => {
        if (input?.moved) window.lastSteer = {x: input.x, y: input.y};
        step(dt, input);
      };
    }""")
    page.mouse.move(660, 350)
    until(lambda: page.evaluate("window.lastSteer?.x > 0 && patrol.game.player.pitch > 0.02"))
    low = page.evaluate("window.lastSteer.x")
    assert not page.evaluate("patrol.game.showGunLead")
    pause()
    slider.focus()
    slider.press("End")
    page.locator("#invertPitch").check()
    resume()
    page.mouse.move(660, 350)
    until(lambda: page.evaluate("patrol.game.player.pitch < -0.025"))
    assert page.evaluate("window.lastSteer.x") > low * 2

    pause()
    page.locator("#captureMouse").check()
    resume()
    until(lambda: page.evaluate("document.pointerLockElement === document.getElementById('stage')"))
    page.evaluate("""() => window.dispatchEvent(new MouseEvent("mousemove", { movementX: 30, movementY: 0 }))""")
    until(lambda: page.evaluate("Math.abs(window.lastSteer.x - 0.1) < 0.001"))
    page.reload()
    page.locator("#launch:enabled").click()
    assert page.evaluate("patrol.game.view === 1 && !patrol.game.showGunLead")
    pause()
    expect(page.locator("#startingView")).to_have_value("cockpit")
    expect(slider).to_have_value("200")
    expect(page.locator("#invertPitch")).to_be_checked()
    expect(page.locator("#showLead")).not_to_be_checked()
    page.locator("#startingView").select_option("north")
    page.locator("#captureMouse").uncheck()
    page.get_by_role("button", name="End", exact=True).click()
    page.get_by_role("button", name="Fly again", exact=True).click()
    assert page.evaluate("patrol.game.view === 2")
    page.mouse.move(600, 70)
    until(lambda: page.evaluate("patrol.game.elapsed > .4"))
    assert abs(page.evaluate("patrol.game.player.yaw")) < 0.15
    assert not errors, errors
    page.close()


def touch(browser, url):
    for width, height in [(568, 320), (320, 568)]:
        page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=True, has_touch=True)
        page.goto(url)
        page.locator("#launch:enabled").tap()
        stick, pad = page.locator("#stick"), page.locator("#touch .pad")
        assert stick.bounding_box()["x"] < pad.bounding_box()["x"]
        page.locator("#pause").tap()
        page.locator("#leftHanded").tap()
        page.locator("#startingView").select_option("cockpit")
        expect(page.locator("#stickSide")).to_have_text("right")
        page.reload()
        page.locator("#launch:enabled").tap()
        assert page.evaluate("patrol.game.view === 1")
        stick_box, pad_box = stick.bounding_box(), pad.bounding_box()
        assert stick_box["x"] > pad_box["x"] + pad_box["width"]
        if width > height:
            until(lambda: page.evaluate("patrol.camera.cockpitSpace?.length === 2"))
        def center(box):
            return {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}
        thumb = {**center(stick_box), "id": 1}
        trigger = {**center(page.locator('[data-control="fire"]').bounding_box()), "id": 2}
        cdp = page.context.new_cdp_session(page)
        def fingers(kind, points):
            cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})
        fingers("touchStart", [thumb, trigger])
        fingers("touchMove", [{**thumb, "x": thumb["x"] + 25}, trigger])
        until(lambda: page.evaluate("patrol.game.player.yaw > 0.04 && patrol.game.shots.some(s => s.kind === 'cannon')"))
        fingers("touchEnd", [])
        page.close()


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else (Path(__file__).resolve().parents[1] / "index.html").as_uri()
    with sync_playwright() as playwright:
        chrome = playwright.chromium.launch(channel="chrome")
        desktop(chrome, url)
        touch(chrome, url)
        chrome.close()
    print("Flight control checks passed on desktop and both mirrored phone layouts.")
