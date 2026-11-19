const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function patrol(save = {}, random) {
  const storage = new Map(Object.entries(save));
  const env = vm.createContext({ window: {}, navigator: {}, localStorage: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
  } });
  if (random) {
    env.random = random;
    vm.runInContext("Math.random = random", env);
  }
  for (const file of ["src/game/game.js", "src/ui/hangar.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), env);
  }
  const game = env.window.SplashOneGame.create({ height: () => 0 });
  return { game, hangar: env.window.SplashOneHangar };
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

test("a finish is bought once per aircraft, equipped separately and retained with older saves", async () => {
  const { hangar } = patrol({ "patrol.career.v2": JSON.stringify({
    credits: 120, ships: { needle: { speed: 2 } }, fleet: { reroll: 1 }
  }) });
  assert.equal(hangar.read().looks.needle.paint, "stock");
  assert.equal(await hangar.equipFinish("fleet", "paint", "crimson"), false);
  assert.equal(await hangar.equipFinish("needle", "flame", "crimson"), false);
  await Promise.all([hangar.equipFinish("needle", "paint", "crimson"), hangar.equipFinish("needle", "paint", "crimson")]);
  assert.equal(hangar.read().credits, 60);
  assert.equal(await hangar.equipFinish("needle", "flame", "ion"), true);
  assert.equal(await hangar.equipFinish("manta", "paint", "crimson"), false);
  for (const paint of ["stock", "crimson"]) assert.equal(await hangar.equipFinish("needle", "paint", paint), true);
  const profile = hangar.read();
  assert.equal(profile.credits, 5);
  assert.equal(profile.looks.needle.paint, "crimson");
  assert.equal(profile.looks.needle.flame, "ion");
  assert.equal(profile.looks.manta.paint, "stock");
  assert.equal(profile.looks.manta.owned.paint.includes("crimson"), false);
  assert.equal(profile.ships.needle.speed, 2);
  assert.equal(profile.fleet.reroll, 1);
});

test("each offensive weapon gets only the HP it removes, including splash and support", () => {
  function exercise(id, layout, input = {}) {
    const { game } = patrol({}, () => 0.2);
    game.start();
    const targets = layout.map(([x, z, hp], i) => ({ id: i, kind: "relay", ground: true,
      x, y: game.player.y, z, hp, speed: 0, yaw: 0, radius: 12, age: 0, fireIn: 100 }));
    game.enemies = targets.slice();
    if (id === "none" && input.missile) {
      game.lockTarget = targets[0];
      game.lockProgress = 1;
    }
    if (Object.hasOwn(game.upgrades, id)) game.upgrades[id] = 1;
    if (id === "ally") game.pickup = { kind: "squadron", ...position(game.player), expires: 20 };
    for (let i = 0; i < 130 && game.state === "playing"; i++) {
      game.step(step, { moved: true, brake: true, ...(i === 0 ? input : {}) });
    }
    const removed = targets.reduce((sum, e, i) => sum + layout[i][2] - e.hp, 0);
    const credited = Object.values(game.damageByWeapon).reduce((sum, hp) => sum + hp, 0);
    assert.ok(Math.abs(removed - credited) < 1e-6, id + " damage added up");
    return game;
  }
  const primary = exercise("none", [[0, 210, 3]], { fire: true });
  assert.equal(primary.damageByWeapon.cannon, 3);
  const missile = exercise("none", [[5, 90, 14], [42, 90, 90]], { missile: true });
  assert.ok(missile.damageByWeapon.missile > 14);
  const wisps = exercise("wisps", [[100, 155, 8]]);
  assert.equal(wisps.damageByWeapon.wisps, 8);
  const tail = exercise("tail", [[0, -70, 12]]);
  assert.equal(tail.damageByWeapon.tail, 12);
  const salvo = exercise("salvo", [[-25, 145, 10]], { missile: true });
  assert.equal(salvo.damageByWeapon.salvo, 10);
  const arc = exercise("arc", [[0, 80, 4], [34, 80, 8]], { fire: true });
  assert.equal(arc.damageByWeapon.cannon, 4);
  assert.equal(arc.damageByWeapon.arc, 8);
  const support = exercise("ally", [[90, 230, 9]]);
  assert.equal(support.damageByWeapon.ally, 9);
  assert.equal(support.kills, 0);
  support.start();
  assert.ok(Object.values(support.damageByWeapon).every(hp => hp === 0));
});

test("aircraft records retain the best single payout across retries, endless and other runs", async () => {
  const { game, hangar } = patrol();
  game.start(10, {}, "needle");
  game.completedWaves = game.waveCount;
  const victory = hangar.statement(game);
  await Promise.all([hangar.deposit(game, victory), hangar.deposit(game, victory)]);
  game.kills += 4;
  const endless = hangar.statement(game);
  await hangar.deposit(game, endless);
  game.start(10, {}, "needle");
  await hangar.deposit(game, hangar.statement(game));
  game.start(10, {}, "manta");
  game.kills = 2;
  await hangar.deposit(game, hangar.statement(game));
  const profile = hangar.read();
  assert.deepEqual({ ...profile.bestEarnings }, { kestrel: 0, needle: endless.total, manta: 7 });
  assert.equal(profile.credits, endless.total + 1 + 7);
});

test("every draft rank has a stat change, including the tuned gun and the last service offer", () => {
  const { game } = patrol({ "patrol.hangar.v1": JSON.stringify(["comet", "arc"]) });
  const caps = { wisps: 3, link: 2, cannon: 3, missiles: 3, shield: 3, tail: 3, guard: 3, siphon: 3, salvo: 3, comet: 2, arc: 2 };
  for (const [id, max] of Object.entries(caps)) {
    for (let rank = 0; rank < max; rank++) {
      game.start(10, { cannon: 2, missiles: 1 }, "needle");
      Object.assign(game.upgrades, caps, { [id]: rank });
      const [first, second] = game.enemies.filter(e => e.mandatory);
      hit(game, first);
      hit(game, second);
      const [choice] = game.choices;
      assert.equal(choice.id, id);
      assert.equal(choice.level, rank + 1);
      assert.ok(choice.changes.length, id + " rank " + (rank + 1));
      for (const { before, after } of choice.changes) assert.notEqual(before, after);
      if (id === "cannon" && rank === 0) {
        const [power] = choice.changes;
        assert.deepEqual([power.before, power.after], [31, 36]);
        assert.ok(game.choose(id));
        game.step(step, { fire: true });
        assert.equal(game.shots.find(s => s.kind === "cannon" && s.style === "needle").power, power.after);
      }
    }
  }
  game.start(10, { capacity: 2 });
  Object.assign(game.upgrades, caps);
  game.player.shield = 20;
  game.player.missiles = 1;
  const [first, second] = game.enemies.filter(e => e.mandatory);
  hit(game, first);
  hit(game, second);
  const [service] = game.choices;
  assert.equal(service.id, "service");
  const [shield, missiles] = service.changes;
  assert.deepEqual([shield.before, missiles.before], [game.player.shield, game.player.missiles]);
  assert.ok(game.choose("service"));
  assert.deepEqual([shield.after, missiles.after], [game.player.shield, game.player.missiles]);
});
