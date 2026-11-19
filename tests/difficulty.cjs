const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function run(difficulty) {
  const env = vm.createContext({ window: {}, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/game/game.js"), "utf8"), env);
  const game = env.window.SplashOneGame.create({ height: x => x < 0 ? -12 : 32 });
  game.start(10, {}, "kestrel", {}, difficulty);
  const waves = [];
  for (let i = 0; i < 2200 && waves.length < 10; ++i) {
    if (game.state === "won") {
      game.continueRun();
    } else if (game.state === "draft") {
      game.choose(game.choices[0].id);
    } else {
      assert.equal(game.state, "playing");
      if (game.wave > waves.length) {
        const mandatory = game.enemies.filter(e => e.mandatory);
        waves.push({
          total: game.enemies.length, mandatory: mandatory.length, carriers: mandatory.filter(e => e.kind === "carrier").length,
          boats: mandatory.filter(e => e.boat).length, ground: mandatory.filter(e => e.ground).length,
          objective: game.objective, level: game.difficulty,
        });
      }
      for (const {x, y, z} of game.enemies) {
        game.shots.push({kind: "cannon", x, y, z, vx: 0, vy: 0, vz: 1, life: 1, power: 9999});
      }
      game.step(0.25);
    }
  }
  assert.equal(waves.length, 10, "All campaign waves and four endless encounters were reachable");
  return waves;
}

test("difficulty preserves the original formations and adds three or six wingmen throughout campaign and endless", () => {
  const baseline = run();
  assert.deepEqual(run(1), baseline);
  assert.deepEqual(baseline.map(w => w.total), [10, 5, 6, 8, 6, 6, 6, 8, 6, 6]);
  for (const level of [2, 3]) {
    const waves = run(level);
    const extra = 3 * (level - 1);
    for (const [i, w] of waves.entries()) {
      assert.equal(w.total, baseline[i].total + extra, "additional contacts on wave " + (i + 1));
      assert.equal(w.level, level);
      assert.equal(w.carriers, baseline[i].carriers);
      assert.equal(w.boats, baseline[i].boats);
      assert.equal(w.ground, baseline[i].ground);
    }
    assert.equal(waves[1].mandatory, 2);
    assert.equal(waves[5].mandatory, 1);
    assert.match(waves[0].objective, new RegExp("0/" + (level + 2) + " jets"));
  }
});
