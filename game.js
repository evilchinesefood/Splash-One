/* The patrol simulation uses meters, seconds, and radians. The renderer reads
   this state, so flying, shooting, and mission rules also run without WebGL. */
(() => {
  "use strict";

  const TAU = 2 * Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const ease = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const groundUnit = (e) => e.kind === "relay" || e.kind === "radar" || e.kind === "prism";
  const shuffled = (array) => {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; --i) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  function rollPickup(shield) {
    const missing = 1 - clamp(shield / 100, 0, 1);
    const shieldChance = 0.1 + 0.6 * missing;
    const roll = Math.random();
    if (roll < shieldChance) return "shield";
    return roll < shieldChance + (1 - shieldChance) / 2 ? "squadron" : "rapid";
  }

  const pickupHints = {
    squadron: "Fly through the squadron beacon for an attack pass",
    shield: "Fly through the shield beacon for a full recharge",
    rapid: "Fly through the rapid-fire beacon to boost your cannon",
  };
  const rapidFireDuration = 12;

  const gear = {
    wisps: {
      name: "Wing Wisps",
      levels: [
        "A gold wingmate fires on nearby enemies.",
        "A second wisp joins the formation.",
        "Four wisps. With Target Link, all focus your missile lock.",
      ],
    },
    link: {
      name: "Target Link",
      levels: [
        "Acquire a missile lock faster and farther away. Max wisps follow your lock.",
        "Widen the lock circle and accelerate acquisition again.",
      ],
    },
    cannon: {
      name: "Pulse Cannon",
      levels: [
        "Your cannon fires harder-hitting rounds.",
        "Fire a faster stream of heavy rounds.",
        "Twin barrels fire together down the nose.",
      ],
    },
    missiles: {
      name: "Hot Rails",
      levels: [
        "Missiles reload faster and hit harder.",
        "Shorter reloads and a wider blast.",
        "All four rails recharge in rapid succession.",
      ],
    },
    shield: {
      name: "Shield Bloom",
      levels: [
        "Shields begin recovering sooner.",
        "Shield recovery also runs twice as fast.",
        "An intact shield absorbs more damage per charge.",
      ],
    },
    tail: {
      name: "Tail Spark",
      levels: [
        "A tail turret fires at pursuers within 320 m.",
        "Reach 430 m and fire the rear turret more often.",
        "Rapid rear fire reaches 540 m and hits harder.",
      ],
    },
    guard: {
      name: "Orbit Guard",
      levels: [
        "Disrupt one incoming shot every 3 seconds.",
        "Detect incoming fire farther out. Recharge in 2 seconds.",
        "Cancel up to two incoming shots every 1.5 seconds.",
      ],
    },
    siphon: {
      name: "Kinetic Siphon",
      levels: [
        "Each target destroyed restores 4 shield points.",
        "Each target destroyed restores 8 shield points.",
        "Each target destroyed restores 12 shield points.",
      ],
    },
    salvo: {
      name: "Split Salvo",
      levels: [
        "Each missile release fires two extra bolts in a fan.",
        "Four side bolts fan out with each missile.",
        "With a missile lock, all four side bolts curve toward the target.",
      ],
    },
    comet: {
      name: "Comet Drive",
      levels: ["Afterburner briefly supplies extra shield energy.", "Boost faster and regain more shield energy."],
    },
    arc: {
      name: "Arc Echo",
      levels: ["Cannon hits can arc to a second nearby enemy.", "Echoes jump farther and strike harder."],
    },
  };
  const discoveries = { comet: "Comet Drive", arc: "Arc Echo" };
  const storageKey = "patrol.hangar.v1";

  const encounters = {
    sweep: {
      name: "Copper Squadron",
      detail: "Break up the patrol",
      quota: 3,
      groups: [["jet", "jet", "jet", "bomber", "jet", "jet", "jet", "dart", "jet"]],
      bonus: "Finish with your hull untouched",
    },
    beacons: {
      name: "Silent Shore",
      detail: "Destroy the shore stations",
      groups: [
        ["radar", "relay"],
        ["relay", "prism"],
      ],
      bonus: "Silence all stations in 90 seconds",
    },
    rush: {
      name: "Crosswind",
      detail: "Survive the interceptor ambush",
      duration: 72,
      groups: [
        ["dart", "jet", "interceptor", "bomber", "jet", "interceptor"],
        ["jet", "dart", "interceptor", "dart", "interceptor"],
      ],
      bonus: "Finish with your hull untouched",
    },
    nest: {
      name: "Amber Array",
      detail: "Break the drone uplink",
      groups: [["prism", "radar"], ["radar", "relay"], ["prism"]],
      bonus: "Silence all stations in 90 seconds",
    },
    moons: {
      name: "Crescent Rising",
      detail: "Repel the crescent ambush",
      groups: [
        ["crescent", "crescent", "interceptor", "crescent", "crescent", "crescent"],
        ["crescent", "interceptor", "crescent", "crescent", "interceptor", "crescent", "crescent"],
        ["interceptor", "crescent", "crescent", "crescent", "crescent", "interceptor"],
      ],
      bonus: "Finish with your hull untouched",
    },
    fleet: {
      name: "The Sunken Crown",
      detail: "Bring down the sky carrier",
      groups: [["carrier"]],
      bonus: "Finish with your hull untouched",
    },
  };
  const models = {
    jet: { hp: 48, radius: 17, speed: 86 },
    interceptor: { hp: 58, radius: 16, speed: 125 },
    crescent: { hp: 31, radius: 14, speed: 99 },
    bomber: { hp: 92, radius: 25, speed: 68 },
    dart: { hp: 32, radius: 13, speed: 164 },
    prism: { hp: 76, radius: 19, speed: 0 },
    radar: { hp: 63, radius: 21, speed: 0 },
    relay: { hp: 52, radius: 18, speed: 0 },
    carrier: { hp: 1080, radius: 76, speed: 39 },
  };

  function create(world, notify = () => {}) {
    let saved = [];
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      if (Array.isArray(value)) saved = value.filter((id) => Object.hasOwn(discoveries, id));
    } catch (_) {
      /* Private sessions still keep discoveries for this visit. */
    }

    const freshPlayer = () => ({
      x: 0,
      y: Math.max(140, world.height(0, 0) + 80),
      z: 0,
      yaw: 0,
      pitch: 0,
      bank: 0,
      speed: 112,
      shield: 100,
      hull: 100,
      boost: false,
      brake: false,
      missiles: 4,
      roll: 0,
      vy: 0,
      gForce: 1,
      hitFlash: 0,
    });
    const g = {
      world,
      player: freshPlayer(),
      enemies: [],
      allies: [],
      pickup: null,
      rapidFireRemaining: 0,
      shots: [],
      particles: [],
      wisps: [],
      time: 0,
      elapsed: 0,
      view: 0,
      state: "title",
      upgrades: {},
      get loadout() {
        return Object.entries(gear)
          .filter(([id]) => this.upgrades[id] > 0)
          .map(([id, item]) => ({ id, name: item.name, level: this.upgrades[id] }));
      },
      unlocks: saved,
      lockTarget: null,
      lockProgress: 0,
      target: null,
      choices: [],
      wave: 0,
      waveCount: 6,
      missionTitle: "",
      objective: "",
      bonus: "",
      lastReward: "",
      kills: 0,
      endless: false,
      start,
      step,
      choose,
      continueRun,
      finish,
    };
    let sequence = [],
      mission,
      missionTime,
      group,
      required,
      bonusIntact,
      gap,
      nextRaid;
    let nextPickupAt = Infinity;
    let shotTimer = 0,
      recharge = 0,
      rollClock = 0,
      rollSign = 1,
      lastDamage = -20;
    let offered = {}, tailReady = 0, guardReady = 0;
    let enteredBoost = -20,
      serial = 0,
      steering = false,
      targetTimer = 0;

    function sound(name) {
      notify("sound", name);
    }
    function unlock(id) {
      if (g.unlocks.includes(id)) return;
      g.unlocks.push(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify(g.unlocks));
      } catch (_) {
        /* In-memory unlock survives restarts. */
      }
      const line = "Hangar unlock · " + discoveries[id];
      g.lastReward = g.lastReward ? g.lastReward + "  /  " + line : line;
      notify("message", line);
    }
    function start(minutes = 10) {
      const count = clamp(Math.round((Number(minutes) || 10) / 2), 5, 20);
      sequence = ["sweep", "beacons", "rush", "nest", "moons"];
      const extras = ["rush", "nest", "moons"];
      for (let i = 5; i < count; ++i) sequence.push(extras[(i - 5) % extras.length]);
      sequence.push("fleet");
      Object.assign(g, {
        player: freshPlayer(),
        time: 0,
        elapsed: 0,
        wave: 0,
        waveCount: sequence.length,
        lastReward: "",
        kills: 0,
        choices: [],
        state: "playing",
        endless: false,
        upgrades: Object.fromEntries(Object.keys(gear).map((id) => [id, 0])),
      });
      g.wisps.length = g.shots.length = g.particles.length = 0;
      nextPickupAt = 10;
      g.rapidFireRemaining = 0;
      g.pickup = null;
      offered = {};
      tailReady = guardReady = 0;
      shotTimer = recharge = rollClock = 0;
      lastDamage = enteredBoost = -20;
      steering = false;
      nextWave();
    }
    function nextWave() {
      g.wave++;
      const key = sequence[g.wave - 1] || ["rush", "nest", "moons", "fleet"][(g.wave - g.waveCount - 1) % 4];
      mission = encounters[key];
      missionTime = group = gap = 0;
      nextRaid = 14;
      bonusIntact = true;
      g.state = "playing";
      g.missionTitle = mission.name;
      g.bonus = mission.bonus;
      g.allies.length = g.enemies.length = g.shots.length = 0;
      g.lockTarget = g.target = null;
      g.lockProgress = targetTimer = 0;
      spawnGroup();
    }

    function landSite(x, z) {
      if (world.height(x, z) > 9) return { x, z };
      // A spiral samples dry land in any direction, including across tile seams.
      for (let i = 1; i <= 700; ++i) {
        const a = i * 2.39996,
          r = 87 * Math.sqrt(i);
        const sx = x + Math.cos(a) * r,
          sz = z + Math.sin(a) * r;
        if (world.height(sx, sz) > 9) return { x: sx, z: sz };
      }
      return { x, z };
    }
    function spawn(kind, x, y, z, mandatory = true) {
      const p = g.player,
        model = models[kind];
      const direction = Math.atan2(p.x - x, p.z - z);
      const scale = g.endless ? 1 + Math.min(0.8, (g.wave - g.waveCount) * 0.06) : 1;
      const e = {
        id: ++serial,
        kind,
        x,
        y,
        z,
        hp: model.hp * scale,
        maxHp: model.hp * scale,
        radius: model.radius,
        speed: model.speed,
        yaw: kind === "jet" || kind === "carrier" ? p.yaw + 0.35 : direction,
        pitch: 0,
        bank: 0,
        mandatory,
        ground: model.speed === 0,
        phase: Math.random() * TAU,
        fireIn: 2 + Math.random() * 4,
        bays: 2,
        hitFlash: 0,
        age: 0,
        patrolX: x,
        patrolZ: z,
        attack: kind === "interceptor" || kind === "crescent" || kind === "dart",
      };
      g.enemies.push(e);
      return e;
    }
    // Each three-ship flight has a lead and two wingmen. Offset entire flights
    // from one another so the approach reads as separate groups on the skyline.
    function spawnFlights(kinds, bearing, range, mandatory) {
      const p = g.player,
        flights = Math.ceil(kinds.length / 3);
      for (const [i, kind] of kinds.entries()) {
        const flight = Math.floor(i / 3),
          slot = i % 3;
        const spread = flight === 0 ? 0 : (flight % 2 ? 1 : -1) * Math.ceil(flight / 2);
        const heading = bearing + spread * (mission === encounters.sweep ? 0.37 : 0.68);
        const wing = slot === 0 ? 0 : slot === 1 ? -1 : 1;
        const reach = range + flight * 100 + Math.abs(wing) * 46;
        const side = wing * 42;
        const x = p.x + Math.sin(heading) * reach + Math.cos(heading) * side;
        const z = p.z + Math.cos(heading) * reach - Math.sin(heading) * side;
        const y = Math.max(world.height(x, z) + 65, p.y + (flight % 2 ? 45 : 10) + slot * 8);
        const e = spawn(kind, x, y, z, mandatory);
        if (kind === "jet") {
          // Crossing patrols hold a local orbit, with one flight turning in to chase.
          e.yaw = heading + (flight % 2 ? -1.15 : 1.15);
          e.attack = !!mission.duration || (mission === encounters.sweep && flight === flights - 1);
        }
      }
    }

    function spawnGroup() {
      const p = g.player,
        kinds = mission.groups[group];
      const ground = models[kinds[0]].speed === 0;
      const bearing = p.yaw + (group % 2 ? 0.45 : -0.1);
      required = mission.quota || kinds.length;
      if (ground) {
        const range = 2250 + group * 220;
        for (const [i, kind] of kinds.entries()) {
          const side = (i - (kinds.length - 1) / 2) * 360;
          const site = landSite(
            p.x + Math.sin(bearing) * range + Math.cos(bearing) * side,
            p.z + Math.cos(bearing) * range - Math.sin(bearing) * side,
          );
          spawn(kind, site.x, world.height(site.x, site.z) + (kind === "prism" ? 16 : 6), site.z);
        }
        // Fighters intercept the approach. Only the stations count toward the objective.
        const defenders =
          mission === encounters.nest
            ? ["crescent", "dart", "crescent", "jet", "bomber", "jet"]
            : ["interceptor", "dart", "jet", "jet", "bomber"];
        const alive = g.enemies.filter((e) => !e.mandatory && e.hp > 0).length;
        spawnFlights(defenders.slice(0, Math.max(0, defenders.length - alive)), bearing, 520, false);
        const station = g.enemies.find((e) => groundUnit(e) && e.hp > 0);
        for (const escort of g.enemies) {
          if (escort.kind === "jet" && !escort.attack && station) {
            escort.patrolX = station.x;
            escort.patrolZ = station.z;
          }
        }
      } else if (mission === encounters.fleet) {
        spawnFlights(kinds, bearing, 1400, true);
        spawnFlights(["dart", "bomber", "jet", "crescent", "crescent"], bearing + 0.23, 690, false);
      } else {
        const range = mission === encounters.sweep ? 300 : 660;
        spawnFlights(kinds, bearing, range, true);
      }
      g.target = g.enemies.find((e) => e.mandatory && e.hp > 0) || null;
      updateObjective();
    }
    function updateObjective() {
      if (mission.duration) {
        g.objective = mission.detail + "  ·  " + Math.max(0, Math.ceil(mission.duration - missionTime)) + " s";
        return;
      }
      if (mission.quota) {
        g.objective = mission.quota - required + "/" + mission.quota + " jets destroyed · first upgrade";
        return;
      }
      const total = mission.groups.reduce((n, a) => n + a.length, 0);
      const ahead = mission.groups.slice(group + 1).reduce((n, a) => n + a.length, 0);
      g.objective = mission.detail + (total > 1 ? "  ·  " + (total - ahead - required) + "/" + total : "");
    }
    function draftChoices() {
      const pool = Object.keys(gear).filter(
        (id) => (!discoveries[id] || g.unlocks.includes(id)) && g.upgrades[id] < gear[id].levels.length,
      );
      // Rotate less-seen equipment into the draft while reserving room to level an owned item.
      const candidates = shuffled(pool).sort((a, b) => (offered[a] || 0) - (offered[b] || 0));
      const ids = candidates.slice(0, 3);
      const owned = pool.filter((id) => g.upgrades[id]);
      if (owned.length && !ids.some((id) => g.upgrades[id]))
        ids[0] = owned[Math.floor(Math.random() * owned.length)];
      if (!ids.length)
        return [
          {
            id: "service",
            name: "Pit Service",
            level: 1,
            description: "Recharge the shield and reload all four missile rails.",
          },
        ];
      for (const id of ids) offered[id] = (offered[id] || 0) + 1;
      return ids.map((id) => ({
        id,
        name: gear[id].name,
        level: g.upgrades[id] + 1,
        description: gear[id].levels[g.upgrades[id]],
      }));
    }
    function endWave() {
      const p = g.player;
      const timed = mission === encounters.nest || mission === encounters.beacons;
      const earned = timed ? missionTime <= 90 : bonusIntact;
      g.lastReward = earned
        ? p.hull === 100
          ? "Bonus complete · hull at 100%"
          : "Bonus complete · hull repaired"
        : "";
      if (earned) p.hull = Math.min(100, p.hull + 30);
      if (mission === encounters.beacons && earned) unlock("comet");
      if (mission === encounters.fleet) unlock("arc");
      g.state = g.wave === g.waveCount ? "won" : "draft";
      g.choices = g.state === "draft" ? draftChoices() : [];
      if (g.pickup) nextPickupAt = g.elapsed + 10;
      g.pickup = null;
      g.allies.length = g.enemies.length = g.shots.length = 0;
      g.lockTarget = g.target = null;
      g.lockProgress = 0;
      sound(g.state === "won" ? "win" : "upgrade");
    }
    function choose(id) {
      if (g.state !== "draft" || !g.choices.some((c) => c.id === id)) return false;
      if (id === "service") {
        g.player.shield = 100;
        g.player.missiles = 4;
        recharge = 0;
      } else g.upgrades[id]++;
      g.choices = [];
      nextWave();
      return true;
    }
    function continueRun() {
      if (g.state !== "won") return;
      g.endless = true;
      g.state = "draft";
      g.choices = draftChoices();
    }
    function finish() {
      if (g.state === "won" || (g.endless && g.state === "draft")) g.state = "finished";
    }

    function forward(e) {
      const c = Math.cos(e.pitch || 0);
      return [Math.sin(e.yaw) * c, Math.sin(e.pitch || 0), Math.cos(e.yaw) * c];
    }
    function flight(dt, input) {
      const p = g.player,
        oldY = p.y,
        title = g.state === "title";
      steering ||= !title && input.moved;
      let x = steering ? clamp(input.x || 0, -1, 1) : 0;
      let y = steering ? clamp(input.y || 0, -1, 1) : 0;
      let turn = x * 1.5,
        climb = y * 0.91;
      if (steering && g.view === 2) {
        const magnitude = Math.min(1, Math.hypot(x, y) * 1.5);
        turn = magnitude < 0.08 ? 0 : clamp(angle(Math.atan2(x, y) - p.yaw) * 2.6, -1.7, 1.7) * magnitude;
        climb = clamp((Math.max(0, world.height(p.x, p.z)) + 155 - p.y) * 0.007, -0.3, 0.35);
      } else if (!steering) {
        turn = Math.sin(g.time * 0.22) * 0.065;
        climb = Math.sin(g.time * 0.17) * 0.022;
      }
      p.brake = !!input.brake && !title;
      const boost = !!input.boost && !p.brake && !title;
      if (boost && !p.boost && g.time - enteredBoost > 4) {
        enteredBoost = g.time;
        if (g.upgrades.comet) p.shield = Math.min(100, p.shield + 6 * g.upgrades.comet);
      }
      p.boost = boost;
      const cruise = p.brake ? 60 : 112;
      p.speed = ease(p.speed, boost ? 193 + (g.upgrades.comet || 0) * 14 : cruise, 1.4, dt);
      p.yaw = angle(p.yaw + turn * dt);
      const sy = Math.sin(p.yaw),
        cy = Math.cos(p.yaw);
      const floor = Math.max(0, world.height(p.x + sy * p.speed * 0.8, p.z + cy * p.speed * 0.8));
      climb = Math.max(climb, Math.min(0.85, (floor + 7 - p.y) / Math.max(30, p.speed * 0.6)));
      p.pitch = ease(p.pitch, climb, 3, dt);
      p.bank = ease(p.bank, turn * 0.6, 4.2, dt);
      if (input.roll && rollClock <= 0) {
        rollClock = 0.78;
        rollSign = Math.sign(input.roll);
      }
      rollClock = Math.max(0, rollClock - dt);
      const rollPhase = 1 - rollClock / 0.78;
      p.roll = rollClock ? rollSign * TAU * rollPhase * rollPhase * (3 - 2 * rollPhase) : 0;
      const f = forward(p);
      p.x += f[0] * p.speed * dt;
      p.z += f[2] * p.speed * dt;
      const surface = Math.max(0, world.height(p.x, p.z));
      p.y = clamp(p.y + f[1] * p.speed * dt, surface + 6, Math.max(2300, surface + 100));
      p.vy = ease(p.vy, (p.y - oldY) / dt, 4, dt);
      p.gForce = Math.sqrt(1 + ((turn * p.speed) / 60) ** 2);
      p.hitFlash = Math.max(0, p.hitFlash - dt * 2);
      if (g.time - lastDamage > 5 - (g.upgrades.shield ? 1.7 : 0)) {
        const was = p.shield;
        p.shield = Math.min(100, p.shield + dt * (g.upgrades.shield >= 2 ? 22 : 11));
        if (was < 100 && p.shield === 100) sound("shield");
      }
    }

    function particle(kind, x, y, z, life, size, vx = 0, vy = 0, vz = 0) {
      if (g.particles.length >= 520) g.particles.shift();
      g.particles.push({ kind, x, y, z, life, maxLife: life, size, vx, vy, vz });
    }
    function impact(x, y, z, size, surface = false) {
      const wet = surface && world.height(x, z) <= 0;
      for (let i = 0; i < Math.ceil(size * 1.5); ++i) {
        const heading = Math.random() * TAU,
          velocity = Math.random() * size * 2;
        const vx = Math.sin(heading) * velocity,
          vz = Math.cos(heading) * velocity;
        if (wet)
          particle(
            "spray",
            x,
            y,
            z,
            0.5 + Math.random() * 0.8,
            1 + size * 0.13,
            vx,
            18 + Math.random() * size * 4,
            vz,
          );
        else {
          const flame = i % 3 === 0;
          particle(
            flame ? "fire" : "spark",
            x,
            y,
            z,
            0.25 + Math.random() * 0.55,
            flame ? size * 0.47 : size * 0.09,
            vx,
            4 + Math.random() * size * 1.6,
            vz,
          );
        }
      }
      if (size > 5) {
        particle("ring", x, y + 1.6, z, 0.75, size * 2.6);
        if (!wet) {
          for (let i = 0; i < 7; ++i)
            particle(
              "smoke",
              x + (Math.random() - 0.5) * size,
              y,
              z,
              1.5 + i * 0.24,
              size * (0.5 + i * 0.06),
              2 + i,
              5 + i * 2,
              0,
            );
          if (surface) particle("scorch", x, y + 0.7, z, 20, size * 1.2);
        } else particle("foam", x, y + 0.45, z, 2.1, size * 1.55);
        sound(wet ? "splash" : "boom");
      }
    }
    function damage(e, amount, allied = false) {
      if (e.hp <= 0) return;
      e.hp -= amount;
      e.hitFlash = 0.23;
      if (e.hp > 0) {
        particle("spark", e.x, e.y, e.z, 0.25, 3, 5, 12);
        return;
      }
      if (!allied) g.kills++;
      if (!allied && g.upgrades.siphon && g.player.hull > 0 && g.player.shield < 100) {
        g.player.shield = Math.min(100, g.player.shield + 4 * g.upgrades.siphon);
        sound("shield");
      }
      impact(e.x, e.y, e.z, e.kind === "carrier" ? 39 : 13, groundUnit(e));
      if (e.mandatory && required > 0) {
        required--;
        updateObjective();
      }
    }
    function hurt(amount) {
      const p = g.player;
      if (p.roll && rollClock > 0.17 && rollClock < 0.63) return;
      const absorb = Math.min(p.shield, amount * (g.upgrades.shield === 3 ? 0.72 : 1));
      const leak = Math.max(0, amount - absorb / (g.upgrades.shield === 3 ? 0.72 : 1));
      p.shield = Math.max(0, p.shield - absorb);
      if (leak > 0.01) {
        p.hull = Math.max(0, p.hull - leak);
        bonusIntact = false;
      }
      p.hitFlash = 1;
      lastDamage = g.time;
      sound(leak > 0.01 ? "hurt" : "deflect");
      if (p.hull <= 0) {
        g.state = "dead";
        impact(p.x, p.y, p.z, 21);
      }
    }
    function shot(kind, src, f, speed, power, life, target = null) {
      const s = {
        kind,
        x: src.x,
        y: src.y,
        z: src.z,
        vx: f[0] * speed,
        vy: f[1] * speed,
        vz: f[2] * speed,
        power,
        life,
        target,
        puff: 0,
      };
      g.shots.push(s);
      return s;
    }
    function aim(from, to) {
      const d = Math.max(1, distance(from, to));
      return [(to.x - from.x) / d, (to.y - from.y) / d, (to.z - from.z) / d];
    }
    function targeting(dt) {
      const p = g.player,
        f = forward(p),
        link = g.upgrades.link;
      let best = null,
        score = -Infinity,
        near = null,
        nearD = Infinity;
      for (const e of g.enemies) {
        if (e.hp <= 0) continue;
        const d = distance(p, e);
        if (e.mandatory && d < nearD) {
          near = e;
          nearD = d;
        }
        if (d > 1350 + link * 250 || d < 2) continue;
        const dot = ((e.x - p.x) * f[0] + (e.y - p.y) * f[1] + (e.z - p.z) * f[2]) / d;
        const radius = Math.min(0.25, e.radius / d);
        if (dot < Math.cos(0.32 + radius + link * 0.052 + (e === g.lockTarget ? 0.085 : 0))) continue;
        const weight = dot + (e === g.lockTarget ? 0.035 : 0) - d * 0.000025;
        if (weight > score) {
          best = e;
          score = weight;
        }
      }
      targetTimer -= dt;
      if (!g.target || g.target.hp <= 0 || targetTimer <= 0) {
        g.target = near;
        targetTimer = 0.45;
      }
      if (best !== g.lockTarget) {
        g.lockTarget = best;
        g.lockProgress = 0;
      }
      if (best && g.lockProgress < 1) {
        g.lockProgress = Math.min(1, g.lockProgress + dt * (1.45 + 0.55 * link));
        if (g.lockProgress === 1) sound("lock");
      }
    }
    function fireWeapons(dt, input) {
      const p = g.player,
        f = forward(p),
        cannon = g.upgrades.cannon,
        rail = g.upgrades.missiles;
      shotTimer = shotTimer > 0 ? shotTimer - dt : 0;
      if (input.fire && shotTimer <= 0) {
        const sides = cannon === 3 ? [-4, 4] : [0];
        for (const offset of sides) {
          const nose = {
            x: p.x + f[0] * 12 + Math.cos(p.yaw) * offset,
            y: p.y + f[1] * 12 - 0.65,
            z: p.z + f[2] * 12 - Math.sin(p.yaw) * offset,
          };
          shot("cannon", nose, f, p.speed + 615, cannon ? 16 : 11, 1.64);
        }
        const volleysPerSecond = cannon >= 2 ? 7.5 : 5.625;
        shotTimer += 1 / (volleysPerSecond * (g.rapidFireRemaining > 0 ? 2 : 1));
        sound("cannon");
      }
      if (input.missile && p.missiles > 0) {
        const locked = g.lockProgress >= 1 && g.lockTarget && g.lockTarget.hp > 0 ? g.lockTarget : null;
        const side = p.missiles % 2 ? -5 : 5;
        const wing = { x: p.x + Math.cos(p.yaw) * side, y: p.y - 1.7, z: p.z - Math.sin(p.yaw) * side };
        const s = shot("missile", wing, f, p.speed + 238, 78 + rail * 17, 6.5, locked);
        if (!locked && Math.abs(p.pitch) < 0.18) {
          const reach = clamp(380 + p.y * 0.65, 460, 1100);
          s.destination = { x: p.x + f[0] * reach, z: p.z + f[2] * reach };
          s.destination.y = Math.max(0, world.height(s.destination.x, s.destination.z)) - 1;
        }
        if (g.upgrades.salvo) {
          const level = g.upgrades.salvo;
          const angles = level === 1 ? [-0.13, 0.13] : [-0.28, -0.12, 0.12, 0.28];
          for (const offset of angles) {
            const direction = forward({ yaw: p.yaw + offset, pitch: p.pitch });
            shot("wisp", wing, direction, p.speed + 435, 17, 2.4, level === 3 ? locked : null);
          }
        }
        p.missiles--;
        sound("missile");
      }
      if (p.missiles < 4) {
        recharge += dt;
        if (recharge >= 4.7 - rail * 0.82) {
          p.missiles++;
          recharge = 0;
        }
      } else recharge = 0;
    }
    function tailTurret() {
      const level = g.upgrades.tail;
      if (!level || g.time < tailReady) return;
      const p = g.player, f = forward(p);
      let target = null, reach = 210 + 110 * level;
      for (const e of g.enemies) {
        const d = distance(p, e);
        const ahead = (e.x - p.x) * f[0] + (e.y - p.y) * f[1] + (e.z - p.z) * f[2];
        if (e.hp > 0 && d < reach && ahead < -0.32 * d) {
          target = e;
          reach = d;
        }
      }
      if (target) {
        const rear = { x: p.x - f[0] * 9, y: p.y - f[1] * 9 + 2, z: p.z - f[2] * 9 };
        shot("wisp", rear, aim(rear, target), 420, level === 3 ? 22 : 15, 2, target);
        sound("wisp");
      }
      tailReady = g.time + (target ? 1.65 - level * 0.29 : 0.12);
    }
    function orbitGuard() {
      const level = g.upgrades.guard;
      if (!level || g.time < guardReady) return;
      const p = g.player, f = forward(p), range = level === 1 ? 56 : 88;
      // Prefer the closest closing projectile; outgoing shots leave the pulse available.
      const closing = g.shots.filter(s => {
        if (s.kind !== "enemy" || distance(p, s) > range) return false;
        return (s.x - p.x) * (s.vx - f[0] * p.speed)
          + (s.y - p.y) * (s.vy - f[1] * p.speed)
          + (s.z - p.z) * (s.vz - f[2] * p.speed) < 0;
      }).sort((a, b) => distance(p, a) - distance(p, b)).slice(0, level === 3 ? 2 : 1);
      if (!closing.length) return;
      for (const s of closing) {
        g.shots.splice(g.shots.indexOf(s), 1);
        particle("ring", s.x, s.y, s.z, 0.25, 12);
        particle("spark", s.x, s.y, s.z, 0.2, 3, 12, 3);
        particle("spark", s.x, s.y, s.z, 0.2, 3, -12, 3);
      }
      guardReady = g.time + [0, 3, 2, 1.5][level];
      sound("wisp");
    }
    function launchSupport(target) {
      const p = g.player;
      // Set one crossing course for the whole squadron at collection time.
      const yaw = Math.atan2(target.x - p.x, target.z - p.z) + 0.42;
      const dx = Math.sin(yaw), dz = Math.cos(yaw);
      const runIn = 710, speed = 236;
      const lead = target.speed * runIn / speed;
      const passX = target.x + Math.sin(target.yaw) * lead;
      const passZ = target.z + Math.cos(target.yaw) * lead;
      for (const slot of [-1, 0, 1]) {
        const back = runIn + Math.abs(slot) * 42;
        const x = passX - dx * back + dz * slot * 34;
        const z = passZ - dz * back - dx * slot * 34;
        g.allies.push({
          x, z, y: Math.max(target.y + 65, world.height(x, z) + 55),
          yaw, pitch: 0, bank: 0, slot, speed, age: 0,
          fireAt: 0.3 + Math.abs(slot) * 0.16, passTime: back / speed,
          target,
        });
      }
      notify("message", "Squadron inbound · attack run");
      sound("radio");
    }
    function updatePickup() {
      const p = g.player;
      if (!g.pickup && g.elapsed >= nextPickupAt && g.enemies.some(e => e.hp > 0)) {
        const f = forward(p), side = Math.random() < 0.5 ? -64 : 64;
        const x = p.x + f[0] * 560 + Math.cos(p.yaw) * side;
        const z = p.z + f[2] * 560 - Math.sin(p.yaw) * side;
        const y = Math.max(world.height(x, z) + 45, clamp(p.y + f[1] * 360, 45, 2300));
        const kind = rollPickup(p.shield);
        g.pickup = { kind, x, y, z, expires: g.elapsed + 52 };
        notify("message", pickupHints[kind]);
      }
      const beacon = g.pickup;
      if (!beacon) return;
      if (g.elapsed >= beacon.expires) {
        g.pickup = null;
        nextPickupAt = g.elapsed + 16;
        return;
      }
      // The north-up camera steers in the horizontal plane and manages altitude for the pilot.
      const range = g.view === 2 ? Math.hypot(p.x - beacon.x, p.z - beacon.z) : distance(p, beacon);
      if (range > 36) return;
      if (beacon.kind === "squadron") {
        const locked = g.lockProgress >= 1 && g.lockTarget?.hp > 0;
        const target = locked ? g.lockTarget : g.enemies.reduce((near, e) =>
          e.hp > 0 && (!near || distance(p, e) < distance(p, near)) ? e : near, null);
        if (!target) return;
        launchSupport(target);
      } else if (beacon.kind === "shield") {
        p.shield = 100;
        sound("shield");
        notify("message", "Shield at 100%");
      } else if (beacon.kind === "rapid") {
        g.rapidFireRemaining = rapidFireDuration;
        sound("rapid");
        notify("message", "Rapid fire · double cannon rate");
      }
      g.pickup = null;
      nextPickupAt = g.elapsed + 22 + Math.random() * 6;
    }
    function updateAllies(dt) {
      for (const a of g.allies) {
        a.age += dt;
        const dx = Math.sin(a.yaw), dz = Math.cos(a.yaw);
        const leaving = a.age >= a.passTime;
        a.x += dx * a.speed * dt;
        a.z += dz * a.speed * dt;
        const oldY = a.y;
        a.y = Math.max(world.height(a.x, a.z) + 36,
          a.y + (leaving ? 38 : -9) * dt);
        a.pitch = ease(a.pitch, Math.atan2((a.y - oldY) / dt, a.speed), 4, dt);
        a.bank = ease(a.bank, leaving ? 0.22 + a.slot * 0.12 : 0, 2, dt);
        if (leaving || a.age < a.fireAt) continue;
        a.fireAt += 0.38;
        const target = a.target;
        if (target.hp <= 0 || !g.enemies.includes(target)) continue;
        const range = distance(a, target);
        if (range > 1050 || (target.x - a.x) * dx + (target.z - a.z) * dz < 0) continue;
        const lead = target.speed * range / 650;
        const intercept = { x: target.x + Math.sin(target.yaw) * lead, y: target.y,
          z: target.z + Math.cos(target.yaw) * lead };
        shot("ally", a, aim(a, intercept), 650, 10, 1.8);
      }
      if (g.allies.length && g.allies[0].age > 8) g.allies.length = 0;
    }
    function updateWisps(dt) {
      const p = g.player,
        level = g.upgrades.wisps || 0;
      const n = [0, 1, 2, 4][level];
      while (g.wisps.length < n)
        g.wisps.push({ x: p.x, y: p.y, z: p.z, cooldown: 0.3 + g.wisps.length * 0.27, phase: 0 });
      g.wisps.forEach((w, i) => {
        const t = (w.phase = g.time * 1.24 + (TAU * i) / n);
        const side = Math.cos(t) * 14,
          tail = -3 - 4 * Math.sin(t);
        w.x = p.x + Math.cos(p.yaw) * side + Math.sin(p.yaw) * tail;
        w.z = p.z - Math.sin(p.yaw) * side + Math.cos(p.yaw) * tail;
        w.y = p.y + 2.7 + Math.sin(t) * 4;
        w.cooldown -= dt;
        if (w.cooldown > 0) return;
        const focus = level === 3 && g.upgrades.link && g.lockProgress >= 1 && g.lockTarget;
        let nearest = focus,
          reach = focus ? 1900 : 515;
        if (!focus)
          for (const e of g.enemies) {
            const d = distance(w, e);
            if (e.hp > 0 && d < reach) {
              nearest = e;
              reach = d;
            }
          }
        if (nearest && nearest.hp > 0 && distance(w, nearest) < (focus ? 1900 : 515)) {
          shot("wisp", w, aim(w, nearest), 450, 10, 4.4, nearest);
          w.cooldown = 1.45;
          sound("wisp");
        }
      });
    }
    function enemies(dt) {
      const p = g.player;
      for (const e of g.enemies) {
        if (e.hp <= 0) continue;
        e.age += dt;
        e.hitFlash = Math.max(0, e.hitFlash - dt);
        const d = distance(p, e);
        if (!groundUnit(e)) {
          let wanted, altitude;
          if (e.kind === "carrier") {
            wanted = e.yaw + 0.23 * Math.sin(e.age * 0.06);
            altitude = 245 + 35 * Math.sin(e.age * 0.05);
            e.bays -= dt;
            if (e.bays <= 0 && g.enemies.filter((o) => o.kind === "crescent" && o.hp > 0).length < 4) {
              for (const side of [-1, 1])
                spawn(
                  "crescent",
                  e.x + side * 35 * Math.cos(e.yaw),
                  e.y - 8,
                  e.z - side * 35 * Math.sin(e.yaw),
                  false,
                );
              e.bays = 15;
              notify("message", "Carrier bays open · crescents inbound");
            }
          } else if (e.kind === "dart") {
            // Commitment to each pass gives the player a predictable crossing shot.
            e.breakAway = Math.max(0, (e.breakAway || 0) - dt);
            if (d < 115) e.breakAway = 1.6;
            wanted = e.breakAway ? e.yaw : Math.atan2(p.x - e.x, p.z - e.z);
            altitude = e.breakAway ? p.y + 115 : p.y + 8;
          } else if (e.attack) {
            // Attackers weave toward a point beside the player, then fly through.
            const t = e.phase + e.age * 0.32;
            const ahead = d < 220 ? 285 : 50;
            const side = Math.sin(t) * 100;
            wanted = Math.atan2(
              p.x + Math.sin(p.yaw) * ahead + Math.cos(p.yaw) * side - e.x,
              p.z + Math.cos(p.yaw) * ahead - Math.sin(p.yaw) * side - e.z,
            );
            altitude = p.y + 15 + Math.sin(t) * 33;
          } else {
            // A loose orbit keeps patrols in the marked area.
            const orbit = e.phase + e.age * 0.13;
            wanted = Math.atan2(e.patrolX + Math.sin(orbit) * 300 - e.x, e.patrolZ + Math.cos(orbit) * 300 - e.z);
            altitude = 160 + 28 * Math.sin(orbit);
          }
          const rate = e.kind === "dart" ? 1.95 : e.kind === "carrier" ? 0.17 : e.attack ? 1.02 : 0.73;
          const turn = clamp(angle(wanted - e.yaw), -rate, rate);
          e.yaw = angle(e.yaw + turn * dt);
          e.bank = ease(e.bank, turn * 0.64, 2, dt);
          const dx = Math.sin(e.yaw) * e.speed,
            dz = Math.cos(e.yaw) * e.speed;
          altitude = Math.max(altitude, 60, world.height(e.x + dx, e.z + dz) + (e.kind === "carrier" ? 100 : 55));
          const dy = clamp((altitude - e.y) * 0.65, -45, 55);
          e.x += dx * dt;
          e.z += dz * dt;
          e.y = Math.max(e.y + dy * dt, world.height(e.x, e.z) + 20);
          e.pitch = Math.atan2(dy, e.speed);
        }
        const prism = e.kind === "prism", bomber = e.kind === "bomber";
        const inRange = d < (prism ? 850 : e.ground ? 700 : 840);
        // A tower just entering range must give the entire charge warning.
        if (prism && !inRange) e.fireIn = Math.max(e.fireIn, 1.35);
        else e.fireIn -= dt;
        e.charge = prism && inRange ? clamp(1 - e.fireIn / 1.35, 0, 1) : 0;
        if (e.fireIn <= 0 && inRange && e.age > 2.7) {
          const f = forward(p),
            lead = Math.min(1.1, d / 240);
          const miss = e.kind === "carrier" ? 8 : 16;
          const target = {
            x: p.x + f[0] * p.speed * lead + (Math.random() - 0.5) * miss,
            y: p.y + f[1] * p.speed * lead + (Math.random() - 0.5) * miss,
            z: p.z + f[2] * p.speed * lead,
          };
          const source = { x: e.x, y: e.y + (prism ? 12 : e.ground ? 5 : 0), z: e.z };
          if (prism || bomber) {
            const direction = aim(source, target);
            const spacing = prism ? .10 : .17;
            for (const theta of [-spacing, 0, spacing]) {
              const cs = Math.cos(theta), sn = Math.sin(theta);
              const f = [direction[0] * cs + direction[2] * sn, direction[1], direction[2] * cs - direction[0] * sn];
              shot("enemy", source, f, prism ? 228 : 136, prism ? 11 : 12, 5).style = prism ? "pulse" : "ember";
            }
            e.fireIn = (prism ? 5.8 : 7.8) + Math.random() * 1.3;
          } else {
            shot("enemy", source, aim(source, target), 218, e.kind === "carrier" ? 18 : 13, 4);
            e.fireIn = (e.kind === "carrier" ? 1.35 : 3.7) + Math.random() * 2.7;
          }
        }
      }
    }
    function intersect(s, dx, dy, dz, target, radius) {
      const tx = target.x - s.x,
        ty = target.y - s.y,
        tz = target.z - s.z;
      const len2 = dx * dx + dy * dy + dz * dz;
      const t = clamp((tx * dx + ty * dy + tz * dz) / (len2 || 1), 0, 1);
      const ax = tx - dx * t,
        ay = ty - dy * t,
        az = tz - dz * t;
      return ax * ax + ay * ay + az * az <= radius * radius ? t : Infinity;
    }
    function impacts(s, dt) {
      const dx = s.vx * dt,
        dy = s.vy * dt,
        dz = s.vz * dt;
      const x = s.x + dx,
        y = s.y + dy,
        z = s.z + dz;
      const floor = Math.max(0, world.height(x, z));
      const groundT = y <= floor ? clamp((s.y - floor) / Math.max(1e-8, s.y - y), 0, 1) : Infinity;
      let first = groundT,
        hit = null;
      if (s.kind === "enemy") {
        const t = intersect(s, dx, dy, dz, g.player, 11);
        if (t < first) {
          hit = g.player;
          first = t;
        }
      } else {
        for (const e of g.enemies) {
          if (e.hp <= 0) continue;
          const t = intersect(s, dx, dy, dz, e, e.radius);
          if (t < first) {
            hit = e;
            first = t;
          }
        }
      }
      if (first === Infinity) {
        s.x = x;
        s.y = y;
        s.z = z;
        return false;
      }
      s.x += dx * first;
      s.y += dy * first;
      s.z += dz * first;
      if (hit === g.player) hurt(s.power);
      else if (hit) {
        damage(hit, s.power, s.kind === "ally");
        if (s.kind === "cannon") {
          sound("hit");
          const level = g.upgrades.arc;
          if (level && Math.random() < 0.45) {
            const near = g.enemies.find((e) => e !== hit && e.hp > 0 && distance(hit, e) < 150 + level * 65);
            if (near) shot("wisp", s, aim(s, near), 560, 6 + level * 5, 1.3, near);
          }
        }
      }
      if (s.kind === "missile") {
        impact(s.x, hit ? s.y : floor + 0.3, s.z, 15, !hit);
        const range = 50 + 10 * g.upgrades.missiles;
        for (const e of g.enemies) {
          const reach = distance(s, e) - e.radius;
          if (e !== hit && e.hp > 0 && reach < range) damage(e, s.power * 0.6 * (1 - Math.max(0, reach) / range));
        }
      } else if (!hit && s.kind !== "enemy") impact(s.x, floor + 0.3, s.z, 2.5, true);
      return true;
    }
    function projectiles(dt) {
      for (let i = g.shots.length - 1; i >= 0; --i) {
        const s = g.shots[i];
        s.life -= dt;
        if (s.life <= 0) {
          g.shots.splice(i, 1);
          continue;
        }
        if (s.kind === "missile" || s.kind === "wisp") {
          const target = s.target && s.target.hp > 0 ? s.target : s.destination;
          if (target) {
            const f = aim(s, target),
              speed = Math.hypot(s.vx, s.vy, s.vz);
            const rate = s.kind === "wisp" ? 10 : 5.5;
            const vx = ease(s.vx / speed, f[0], rate, dt),
              vy = ease(s.vy / speed, f[1], rate, dt),
              vz = ease(s.vz / speed, f[2], rate, dt);
            const norm = Math.max(0.001, Math.hypot(vx, vy, vz));
            s.vx = (vx * speed) / norm;
            s.vy = (vy * speed) / norm;
            s.vz = (vz * speed) / norm;
          }
          if (s.kind === "missile") {
            s.puff -= dt;
            if (s.puff <= 0) {
              particle("smoke", s.x, s.y, s.z, 0.79, 2.9, 0.65, 2);
              particle("fire", s.x, s.y, s.z, 0.15, 2.6);
              s.puff += 0.048;
            }
          }
        }
        if (impacts(s, dt)) g.shots.splice(i, 1);
      }
    }
    function effects(dt) {
      let write = 0;
      for (const q of g.particles) {
        q.life -= dt;
        if (q.life <= 0) continue;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
        if (q.kind === "spray" || q.kind === "spark") q.vy -= (q.kind === "spray" ? 78 : 27) * dt;
        g.particles[write++] = q;
      }
      g.particles.length = write;
    }
    function tick(dt, input) {
      g.time += dt;
      if (g.state === "title") {
        flight(dt, {});
        return;
      }
      if (g.state !== "playing") {
        effects(dt);
        return;
      }
      g.elapsed += dt;
      missionTime += dt;
      flight(dt, input);
      enemies(dt);
      targeting(dt);
      g.rapidFireRemaining = Math.max(0, g.rapidFireRemaining - dt);
      updatePickup();
      fireWeapons(dt, input);
      updateWisps(dt);
      updateAllies(dt);
      tailTurret();
      orbitGuard();
      projectiles(dt);
      effects(dt);
      g.enemies = g.enemies.filter((e) => e.hp > 0);
      if (g.state !== "playing") return;
      if (mission.duration) {
        updateObjective();
        if (missionTime >= mission.duration) {
          endWave();
          return;
        }
        if (missionTime >= nextRaid && g.enemies.length < 5) {
          group = (group + 1) % mission.groups.length;
          spawnGroup();
          nextRaid = missionTime + 9;
        } else if (g.enemies.length <= 2 && nextRaid - missionTime > 2.5) nextRaid = missionTime + 2.5;
        return;
      }
      // A long straight flight can leave every visible aircraft behind. Send
      // another flight across the player's path while the objective stays live.
      if (required && missionTime >= nextRaid && (mission.quota || groundUnit(g.target || {}))) {
        nextRaid = missionTime + 14;
        const inRange = (e) => distance(g.player, e) < 1500;
        if (!g.enemies.some((e) => !groundUnit(e) && inRange(e))) {
          g.enemies = g.enemies.filter((e) => e.mandatory && !mission.quota);
          spawnFlights(["jet", "interceptor", "jet"], g.player.yaw - 0.25, 600, !!mission.quota);
          g.target = g.enemies.find((e) => e.mandatory) || null;
        }
      }
      if (!required) {
        gap += dt;
        if (gap >= (mission.quota ? 0.35 : 1.3)) {
          gap = 0;
          if (group + 1 < mission.groups.length) {
            group++;
            spawnGroup();
            notify("message", "New contacts · tracker updated");
          } else endWave();
        }
      }
    }
    function step(dt, input = {}) {
      // Fixed upper bound preserves collision and steering at coarse frame rates.
      let left = Math.min(0.25, Math.max(0, dt));
      while (left > 1e-7) {
        const slice = Math.min(1 / 45, left);
        tick(slice, input);
        if (input.missile || input.roll) input = { ...input, missile: false, roll: 0 };
        left -= slice;
      }
    }
    return g;
  }

  window.PatrolGame = { create };
})();
