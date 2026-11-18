const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function patrol(save = {}) {
  const storage = new Map(Object.entries(save));
  const env = vm.createContext({ window: {}, navigator: {}, localStorage: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
  } });
  for (const file of ["game.js", "hangar.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), env);
  }
  const game = env.window.PatrolGame.create({ height: () => 0 });
  return { game, hangar: env.window.PatrolHangar };
}
const step = 1 / 60;
function hit(game, target) {
  game.shots.push({ kind: "cannon", ...position(target), vx: 0, vy: 0, vz: 1, power: 9999, life: 1 });
  game.step(step);
}
function position({ x, y, z }) { return { x, y, z }; }

test("legacy ranks carry forward and a new purchase only tunes its airframe", async () => {
  const { game, hangar } = patrol({ "patrol.career.v1": JSON.stringify({ credits: 740,
    ranks: { cannon: 2, shield: 1, missiles: 3 } }) });
  assert.equal(await hangar.purchase("needle", "speed"), true);
  assert.equal(await hangar.purchase("fleet", "respawn"), true);
  const profile = hangar.read();
  assert.equal(profile.credits, 100);
  assert.equal(await hangar.purchase("fleet", "respawn"), false);
  for (const [id, ranks] of Object.entries(profile.ships)) {
    assert.deepEqual([ranks.cannon, ranks.shield, ranks.missiles], [2, 1, 3]);
    assert.equal(ranks.speed, id === "needle" ? 1 : 0);
    game.start(10, ranks, id, profile.fleet);
    assert.equal(game.charges.respawn, 1);
    assert.equal(game.player.speed, { needle: 147, kestrel: 112, manta: 92 }[id]);
  }
});

test("draft perks replace offers without spending the pilot level and replenish next patrol", () => {
  const { game } = patrol();
  const fleet = { banish: 1, reroll: 1 };
  game.start(10, {}, "needle", fleet);
  const enemies = game.enemies.filter(e => e.mandatory);
  hit(game, enemies[0]); hit(game, enemies[1]);
  const first = new Set(game.choices.map(c => c.id));
  assert.ok(game.reroll());
  assert.ok(game.choices.every(c => !first.has(c.id)));
  assert.equal(game.reroll(), false);
  const [removed, kept] = game.choices;
  assert.ok(game.banish(removed.id));
  assert.ok(game.choices.some(c => c.id === kept.id));
  assert.equal(game.choose(removed.id), false);
  assert.equal(game.banish(kept.id), false);
  assert.equal(game.loadout.length, 0);
  assert.ok(game.choose(kept.id));
  hit(game, enemies[2]);
  for (let i = 0; i < 80 && game.state === "playing"; i++) game.step(step);
  assert.equal(game.state, "draft");
  assert.ok(game.choices.every(c => c.id !== removed.id));
  game.start(10, {}, "manta", fleet);
  assert.equal(game.banished.size, 0);
  assert.equal(game.charges.reroll, 1);
});

test("reserve aircraft preserves mission, gear and earnings and cannot be claimed twice", async () => {
  const { game, hangar } = patrol();
  game.start(10, { hull: 3, capacity: 2 }, "manta", { respawn: 1 });
  hit(game, game.enemies.find(e => e.mandatory));
  game.upgrades.link = 1;
  game.player.y = -1;
  game.step(step);
  assert.equal(game.state, "downed");
  assert.ok(game.respawn());
  assert.equal(game.respawn(), false);
  assert.deepEqual([game.charges.respawn, game.wave, game.kills, game.upgrades.link], [0, 1, 1, 1]);
  assert.deepEqual([game.player.hull, game.player.shield, game.player.missiles], [136, 124, 4]);
  game.player.y = -1;
  game.step(step);
  assert.equal(game.state, "dead");
  const bill = hangar.statement(game);
  await hangar.deposit(game, bill);
  await hangar.deposit(game, bill);
  assert.equal(hangar.read().credits, bill.total);
});

test("signature kits change the actual weapon pattern", () => {
  function armed(id, specialty) {
    const { game } = patrol();
    game.start(10, { specialty }, id);
    game.enemies.length = 0;
    return game;
  }
  const kestrel = armed("kestrel", 3);
  for (let t = 0; t < 35; t++) kestrel.step(step, { fire: true, moved: true });
  assert.equal(kestrel.shots.length, 6); // Four volleys, including two linked rounds.
  function spread(rank) {
    const game = armed("manta", rank);
    game.step(step, { fire: true, moved: true });
    const shot = game.shots[0];
    return Math.abs(Math.atan2(shot.vx, shot.vz));
  }
  assert.ok(Math.abs(spread(3) / spread(0) - .55) < .001);
  const needle = armed("needle", 2);
  const line = Array.from({ length: 5 }, (_, i) => ({ id: i, kind: "relay", ground: true,
    x: 0, y: needle.player.y, z: 200 + 30 * i, hp: 200, radius: 12, age: 0, fireIn: 100 }));
  needle.enemies.push(...line);
  for (let i = 0; i < 30; i++) needle.step(step, { fire: i === 0, moved: true });
  assert.deepEqual(line.map(e => e.hp), [173, 173, 173, 173, 200]);
});

test("a depleted draft still offers service and a declined reserve ends the patrol", () => {
  const { game } = patrol();
  game.start(10, { capacity: 2 }, "needle", { reroll: 2, banish: 2, respawn: 1 });
  for (const id of Object.keys(game.upgrades)) game.upgrades[id] = 3;
  game.upgrades.cannon = 1;
  const enemies = game.enemies.filter(e => e.mandatory);
  hit(game, enemies[0]); hit(game, enemies[1]);
  assert.equal(game.choices.length, 1);
  assert.equal(game.canReroll, false);
  assert.equal(game.reroll(), false);
  assert.equal(game.charges.reroll, 2);
  assert.ok(game.banish("cannon"));
  assert.equal(game.upgrades.cannon, 1);
  assert.equal(game.banish("service"), false);
  game.player.shield = 2;
  assert.ok(game.choose("service"));
  assert.equal(game.player.shield, 124);
  game.player.y = -1;
  game.step(step);
  assert.equal(game.state, "downed");
  game.finish();
  assert.equal(game.state, "dead");
  assert.equal(game.respawn(), false);
});
