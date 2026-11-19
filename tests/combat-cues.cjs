const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const scope = { window: {} };
vm.runInNewContext(readFileSync(join(__dirname, "..", "src", "game", "game.js"), "utf8"), scope);
const step = 1 / 60;

function launch(id = "kestrel") {
  const sounds = [];
  const game = scope.window.SplashOneGame.create({ height: () => 0 }, (event, value) => {
    if (event === "sound") sounds.push(value);
  });
  game.start(10, {}, id);
  return { game, sounds };
}

test("incoming rounds identify their source side and only a shield break plays the crack", () => {
  const { game, sounds } = launch();
  const p = game.player;
  function hit(vx, power) {
    game.shots.push({ kind: "enemy", x: p.x - vx * step, y: p.y, z: p.z, vx, vy: 0, vz: 0, power, life: 1 });
    game.step(step);
  }
  hit(-200, 10);
  assert.ok(p.hitFrom[0] > 0);
  assert.ok(sounds.includes("deflect"));
  hit(200, p.shield);
  assert.ok(p.hitFrom[0] < 0);
  assert.equal(p.shield, 0);
  assert.equal(p.hull, 100);
  hit(-200, 5);
  assert.ok(p.hull < 100);
  assert.ok(sounds.includes("hurt"));
  assert.equal(sounds.filter(id => id === "shieldBreak").length, 1);
  p.shield = 4;
  hit(-200, 10);
  assert.equal(sounds.filter(id => id === "shieldBreak").length, 2);
});

test("round flight and crossing-target prediction meet at the same time for each aircraft", () => {
  const times = {};
  for (const id of ["needle", "kestrel", "manta"]) {
    const { game } = launch(id);
    const p = game.player, target = game.enemies.find(e => e.kind === "jet");
    game.enemies = [target];
    Object.assign(target, { x: p.x, y: p.y + 12, z: p.z + 380, yaw: Math.PI / 2 });
    game.step(step, { moved: true, fire: true });
    assert.equal(game.lockTarget, target);
    const pip = game.gunLead;
    const rounds = game.shots.filter(s => s.kind === "cannon");
    const round = rounds[Math.floor(rounds.length / 2)];
    assert.ok(pip.x > target.x);
    assert.equal(round.vx, 0);
    const t = (pip.x - target.x) / target.vx;
    const speed = Math.hypot(round.vx, round.vy, round.vz);
    const travel = Math.hypot(pip.x - p.x, pip.y - (p.y - .65), pip.z - (p.z + p.frame.nose + 1));
    assert.ok(Math.abs(travel - speed * t) < 1e-5);
    times[id] = t;
    game.showGunLead = false;
    assert.equal(game.gunLead, null);
    assert.equal(game.lockTarget, target);
    game.showGunLead = true;
    target.z += speed * 2;
    assert.equal(game.gunLead, null);
    target.z -= speed * 2;
    target.hp = 0;
    assert.equal(game.gunLead, null);
  }
  assert.ok(times.needle < times.kestrel && times.kestrel < times.manta);
});
