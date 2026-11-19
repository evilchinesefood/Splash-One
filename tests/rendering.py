"""Check terrain redraws in flight, in a paused view, and after a resize."""
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else (Path(__file__).resolve().parents[1] / 'index.html').as_uri()


def draws_over_frames(page, frames):
    return page.evaluate('''frames => new Promise(resolve => {
      const before = window.terrainDraws;
      function tick() {
        if (--frames === 0) resolve(window.terrainDraws - before);
        else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    })''', frames)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', args=['--use-angle=metal'])
    page = browser.new_page(viewport={'width': 900, 'height': 600})
    page.goto(url)
    page.locator('#launch:enabled').click()
    page.evaluate('''() => {
      const world = splashOne.game.world;
      const render = world.render.bind(world);
      window.terrainDraws = 0;
      world.render = (...args) => { window.terrainDraws++; return render(...args); };
    }''')
    assert draws_over_frames(page, 8) >= 6, 'Flight should render continuously'
    page.keyboard.press('p')
    page.get_by_role('tab', name='Settings').click()
    draws_over_frames(page, 3)
    idle = draws_over_frames(page, 12)
    assert idle == 0, f'Paused terrain redrew {idle} times over 12 animation frames'
    before = page.evaluate('window.terrainDraws')
    page.locator('#currentView').select_option('cockpit')
    page.wait_for_function('start => window.terrainDraws > start && splashOne.game.cockpitBlend === 1', arg=before)
    before = page.evaluate('window.terrainDraws')
    page.set_viewport_size({'width': 680, 'height': 535})
    page.wait_for_function('start => window.terrainDraws > start', arg=before)
    draws_over_frames(page, 3)
    assert draws_over_frames(page, 8) == 0, 'Resizing a paused view should redraw it once it settles'
    page.evaluate("""() => {
      const gl = document.querySelector('#world').getContext('webgl2');
      window.contextLoss = gl.getExtension('WEBGL_lose_context');
      contextLoss.loseContext();
    }""")
    recovery = page.locator('#graphicsRecovery')
    expect(recovery).to_be_visible()
    before = page.evaluate('window.terrainDraws')
    page.evaluate('contextLoss.restoreContext()')
    expect(recovery).to_be_hidden()
    page.wait_for_function('start => window.terrainDraws > start', arg=before)
    expect(page.get_by_role('tab', name='Settings')).to_be_visible()
    page.get_by_role('button', name='Resume', exact=True).click()
    expect(page.locator('#pause')).to_be_visible()
    assert draws_over_frames(page, 8) >= 6, 'Resuming must restart terrain rendering'
    browser.close()
    print('Flight, idle pause, cockpit change, resize, graphics recovery, and resume rendering passed.')
