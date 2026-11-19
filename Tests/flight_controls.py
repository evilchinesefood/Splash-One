"""Run with Python Playwright and Chrome. Pass a URL to check a hosted release."""
from pathlib import Path
import re
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


def tab(page, name):
    return page.get_by_role("tab", name=name, exact=True)


def expect_tab(page, name):
    expect(tab(page, name)).to_have_attribute("aria-selected", "true")
    panel = page.get_by_role("tabpanel", name=name, exact=True)
    expect(panel).to_be_visible()
    expect(page.get_by_role("tabpanel")).to_have_count(1)
    return panel


def flight_hud(page, cockpit=False):
    pause = page.locator("#pause")
    expect(pause).to_have_accessible_name(re.compile("pause", re.I))
    expect(pause).to_be_visible()
    assert "pause" not in pause.inner_text().lower()
    assert pause.bounding_box()["width"] <= 48
    expect(page.locator("#flight #viewName")).to_have_count(0)
    expect(page.locator("#flight").get_by_role("button", name=re.compile("view|camera|cockpit|north-up", re.I))).to_have_count(0)
    expect(page.locator("#flight #wave, #flight #objective, #flight #missionTitle, #flight #bonus")).to_have_count(0)
    count = page.locator("#flight #missileCount")
    if cockpit:
        expect(count).to_be_hidden()
    else:
        expect(count).to_be_visible()
        expect(count).to_contain_text(re.compile(r"missiles?\s+\d", re.I))


def desktop(browser, url):
    page = browser.new_page(viewport={"width": 1200, "height": 800})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    page.locator("#launch:enabled").click()
    flight_hud(page)

    def pause():
        page.keyboard.press("p")
        expect_tab(page, "Equipment")

    def resume():
        page.get_by_role("button", name="Resume", exact=True).click()

    pause()
    expect(page.get_by_role("tab")).to_have_text(["Equipment", "Wave", "Controls", "Settings"])
    equipment = tab(page, "Equipment")
    equipment.focus()
    equipment.press("ArrowRight")
    wave = expect_tab(page, "Wave")
    expect(tab(page, "Wave")).to_be_focused()
    expect(wave.locator("#missionTitle")).to_have_text(page.evaluate("patrol.game.missionTitle"))
    expect(wave.locator("#objective")).to_have_text(page.evaluate("patrol.game.objective"))
    expect(wave.locator("#bonus")).to_contain_text(page.evaluate("patrol.game.bonus"))
    expect(wave.locator("#wave")).to_contain_text("1")
    tab(page, "Wave").press("End")
    expect_tab(page, "Settings")
    page.locator("#startingView").select_option("cockpit")
    page.locator("#showLead").uncheck()
    tab(page, "Settings").press("Home")
    expect_tab(page, "Equipment")
    tab(page, "Controls").click()
    expect_tab(page, "Controls")
    page.locator("#captureMouse").uncheck()
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
    tab(page, "Controls").click()
    slider.focus()
    slider.press("End")
    page.locator("#invertPitch").check()
    resume()
    page.mouse.move(660, 350)
    until(lambda: page.evaluate("patrol.game.player.pitch < -0.025"))
    assert page.evaluate("window.lastSteer.x") > low * 2

    pause()
    tab(page, "Controls").click()
    page.locator("#captureMouse").check()
    resume()
    until(lambda: page.evaluate("document.pointerLockElement === document.getElementById('stage')"))
    page.evaluate("""() => window.dispatchEvent(new MouseEvent("mousemove", { movementX: 30, movementY: 0 }))""")
    until(lambda: page.evaluate("Math.abs(window.lastSteer.x - 0.1) < 0.001"))
    page.reload()
    page.locator("#launch:enabled").click()
    assert page.evaluate("patrol.game.view === 1 && !patrol.game.showGunLead")
    flight_hud(page, cockpit=True)
    pause()
    tab(page, "Settings").click()
    expect(page.locator("#currentView")).to_have_value("cockpit")
    expect(page.locator("#startingView")).to_have_value("cockpit")
    expect(page.locator("#showLead")).not_to_be_checked()
    page.locator("#startingView").select_option("north")
    tab(page, "Controls").click()
    expect(slider).to_have_value("200")
    expect(page.locator("#invertPitch")).to_be_checked()
    page.locator("#captureMouse").uncheck()
    page.get_by_role("button", name="End", exact=True).click()
    page.get_by_role("button", name="Fly again", exact=True).click()
    assert page.evaluate("patrol.game.view === 2")
    flight_hud(page)
    page.mouse.move(600, 70)
    until(lambda: page.evaluate("patrol.game.elapsed > .4"))
    assert abs(page.evaluate("patrol.game.player.yaw")) < 0.15
    assert not errors, errors
    page.close()


def touch(browser, url):
    for width, height in [(568, 320), (320, 568)]:
        page = browser.new_page(viewport={"width": width, "height": height}, is_mobile=True, has_touch=True)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url)
        page.locator("#launch:enabled").tap()
        stick, pad = page.locator("#stick"), page.locator("#touch .pad")
        assert stick.bounding_box()["x"] < pad.bounding_box()["x"]
        flight_hud(page)
        page.locator("#pause").tap()
        expect_tab(page, "Equipment")
        for name in ["Wave", "Controls", "Settings"]:
            tab(page, name).tap()
            expect_tab(page, name)
            assert page.locator("#modal .panel").evaluate("el => el.scrollWidth <= el.clientWidth + 1")
        page.locator("#currentView").select_option("cockpit")
        page.get_by_role("button", name="Resume", exact=True).tap()
        assert page.evaluate("patrol.game.view === 1")
        flight_hud(page, cockpit=True)
        page.locator("#pause").tap()
        expect_tab(page, "Equipment")
        tab(page, "Controls").tap()
        page.locator("#leftHanded").tap()
        expect(page.locator("#stickSide")).to_have_text("right")
        tab(page, "Settings").tap()
        expect(page.locator("#startingView")).to_have_value("chase")
        page.locator("#startingView").select_option("cockpit")
        page.locator("#currentView").select_option("north")
        page.get_by_role("button", name="Resume", exact=True).tap()
        assert page.evaluate("patrol.game.view === 2")
        flight_hud(page)
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
        assert not errors, errors
        page.close()


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else (Path(__file__).resolve().parents[1] / "index.html").as_uri()
    with sync_playwright() as playwright:
        chrome = playwright.chromium.launch(channel="chrome")
        desktop(chrome, url)
        touch(chrome, url)
        chrome.close()
    print("Flight HUD, pause tabs, and control preferences passed on desktop and both phone layouts.")
