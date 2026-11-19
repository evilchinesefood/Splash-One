/* The patrol simulation uses meters, seconds, and radians. The renderer reads
   this state, so flying, shooting, and mission rules also run without WebGL. */
(() => {
  "use strict";

  const TAU = 2 * Math.PI;
  const gunRoundLife = 1.64;
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
  const freshDamageTotals = () => ({ cannon: 0, missile: 0, wisps: 0, tail: 0, salvo: 0, arc: 0 });

  const gear = {
    wisps: {
      name: "Wing Wisps", max: 3,
      description: "Wingmates fire at nearby targets.",
      count: [0, 1, 2, 4],
      stats(rank) { return { Wingmates: this.count[rank] }; },
    },
    link: {
      name: "Target Link", max: 2,
      description: "Acquire missile locks in a wider cone.",
      range: rank => 1350 + rank * 250,
      lockRate: rank => 1.45 + rank * .55,
      stats(rank) { return { "Lock range (m)": this.range(rank), "Lock time (s)": 1 / this.lockRate(rank) }; },
    },
    cannon: {
      name: "Primary Tuning", max: 3,
      description: "Tune your nose gun.",
      power: (rank, frame) => frame.damage + (rank ? 5 : 0),
      rate: (rank, frame) => frame.rate * (rank >= 2 ? 4 / 3 : 1),
      barrels: rank => rank === 3 ? 2 : 1,
      stats(rank, {player: {frame}}) {
        return { "Round damage": this.power(rank, frame), "Base volleys/s": this.rate(rank, frame), Barrels: this.barrels(rank) };
      },
    },
    missiles: {
      name: "Hot Rails", max: 3,
      description: "Upgrade all four missile rails.",
      power: rank => 78 + rank * 17,
      reload: (rank, loader) => 4.7 - rank * .82 - loader * .25,
      radius: rank => 50 + rank * 10,
      stats(rank, g) {
        return { "Reload (s)": this.reload(rank, g.mods.missiles), "Direct damage": this.power(rank), "Blast radius (m)": this.radius(rank) };
      },
    },
    shield: {
      name: "Shield Bloom", max: 3,
      description: "Recover between hits and absorb incoming fire.",
      delay: rank => rank ? 3.3 : 5,
      recovery: (rank, generator) => (rank >= 2 ? 22 : 11) + 2 * generator,
      resistance: rank => rank === 3 ? 28 : 0,
      stats(rank, g) {
        return { "Recharge delay (s)": this.delay(rank), "Shield/s": this.recovery(rank, g.mods.shield), "Shield resist (%)": this.resistance(rank) };
      },
    },
    tail: {
      name: "Tail Spark", max: 3,
      description: "A rear turret fires at pursuers.",
      range: rank => rank ? 210 + 110 * rank : 0,
      delay: rank => 1.65 - rank * .29,
      power: rank => rank === 3 ? 22 : 15,
      stats(rank) { return { "Range (m)": this.range(rank), "Shot delay (s)": rank ? this.delay(rank) : "Off", "Shot damage": rank ? this.power(rank) : 0 }; },
    },
    guard: {
      name: "Orbit Guard", max: 3,
      description: "Intercept incoming rounds before they hit.",
      delay: [0, 3, 2, 1.5],
      count: [0, 1, 1, 2],
      range: [0, 56, 88, 88],
      stats(rank) { return { Intercepts: this.count[rank], "Recharge (s)": rank ? this.delay[rank] : "Off", "Range (m)": this.range[rank] }; },
    },
    siphon: {
      name: "Kinetic Siphon", max: 3,
      description: "Your kills restore shield.",
      recovery: rank => 4 * rank,
      stats(rank) { return { "Shield per kill": this.recovery(rank) }; },
    },
    salvo: {
      name: "Split Salvo", max: 3,
      description: "Launch extra bolts with each missile.",
      angles: [[], [-.13, .13], [-.28, -.12, .12, .28], [-.28, -.12, .12, .28]],
      stats(rank) { return { "Side bolts": this.angles[rank].length, "Homing on lock": rank === 3 ? "On" : "Off" }; },
    },
    comet: {
      name: "Comet Drive", max: 2,
      description: "Engaging boost also restores shield once every 4 s.",
      recovery: rank => 6 * rank,
      topSpeed: (rank, frame) => frame.boost + rank * 14,
      stats(rank, g) { return { "Boost (m/s)": this.topSpeed(rank, g.player.frame), "Shield on boost": this.recovery(rank) }; },
    },
    arc: {
      name: "Arc Echo", max: 2,
      description: "Gun hits have a 45% chance to arc to another target.",
      range: rank => rank ? 150 + rank * 65 : 0,
      power: rank => rank ? 6 + rank * 5 : 0,
      stats(rank) { return { "Jump range (m)": this.range(rank), "Arc damage": this.power(rank) }; },
    },
  };

  function focusHint(id, g) {
    if (id !== "link" && id !== "wisps") return "";
    const partner = id === "link" ? "wisps" : "link";
    const partnerRank = g.upgrades[partner];
    const partnerName = gear[partner].name;
    const nextWisps = g.upgrades.wisps + (id === "wisps" ? 1 : 0);
    const hasLink = g.upgrades.link > 0 || id === "link";
    if (nextWisps >= 3 && hasLink) return partnerName + " aboard. Four wisps focus your lock.";
    if (g.banished.has(partner) && (partner === "wisps" || !partnerRank)) return partnerName + " banished. Focus unavailable.";
    if (id === "wisps") return (partnerRank ? "Target Link aboard." : "Add Target Link.") + " Rank 3 wisps focus your lock.";
    if (!partnerRank) return "Add rank 3 Wing Wisps to focus your lock.";
    return "Wing Wisps rank " + partnerRank + " aboard. Rank 3 focuses your lock.";
  }

  function compareStats(current, next) {
    return Object.keys(next).filter(label => current[label] !== next[label])
      .map(label => ({ label, before: current[label], after: next[label] }));
  }
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
      detail: "Clear the shore patrol and stations",
      groups: [
        ["cutter", "gunboat"],
        ["relay", "prism"],
      ],
      bonus: "Clear the shore in 90 seconds",
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
  // Hull half-extents (beam, height, length) are used for physical contact; radius is the weapon hit radius.
  const models = {
    cutter: { hp: 44, radius: 17, speed: 22, boat: true, hull: [5, 4, 17] },
    gunboat: { hp: 88, radius: 24, speed: 12, boat: true, hull: [7.5, 6, 25] },
    jet: { hp: 48, radius: 17, speed: 86, hull: [8.5, 2.8, 11] },
    interceptor: { hp: 58, radius: 16, speed: 125, hull: [8.5, 2.8, 11] },
    crescent: { hp: 31, radius: 14, speed: 99, hull: [9, 2, 4] },
    bomber: { hp: 92, radius: 25, speed: 68, hull: [23, 3, 13] },
    dart: { hp: 32, radius: 13, speed: 164, hull: [6, 2.5, 13] },
    prism: { hp: 76, radius: 19, speed: 0, hull: [8, 17, 8] },
    radar: { hp: 63, radius: 21, speed: 0, hull: [8, 10, 8] },
    relay: { hp: 52, radius: 18, speed: 0, hull: [5, 13, 5] },
    carrier: { hp: 1080, radius: 76, speed: 39, hull: [51, 9, 52] },
  };

  const airframes = {
    kestrel: {
      name: "Kestrel", weapon: "Pulse cannon", trigger: "Cannon", description: "A steady stream of nose-fired rounds.",
      cruise: 112, boost: 193, handling: 1, armor: 1, damage: 11, rate: 5.625, shotSpeed: 615,
      nose: 11, tail: -9, tip: 8.5, tipZ: -4,
    },
    needle: {
      name: "Needle", weapon: "Ion lance", trigger: "Lance", description: "Precision bolts pierce two targets in a line.",
      cruise: 140, boost: 232, handling: 1.24, armor: 0.85, damage: 27, rate: 2.5, shotSpeed: 1020,
      nose: 14, tail: -10, tip: 6.8, tipZ: -6.4,
    },
    manta: {
      name: "Manta", weapon: "Scatter cannon", trigger: "Scatter", description: "Three rounds fan out on each trigger pull.",
      cruise: 92, boost: 161, handling: 0.79, armor: 1.3, damage: 8, rate: 3.25, shotSpeed: 530,
      nose: 8, tail: -9.5, tip: 13.5, tipZ: -4.8,
    },
  };
  for (const [id, frame] of Object.entries(airframes)) {
    frame.id = id;
    frame.contactPoints = [[0, -1, 0], [0, 0, frame.nose], [0, 0, frame.tail],
      [-frame.tip, 0, frame.tipZ], [frame.tip, 0, frame.tipZ]];
  }

  function tunedFrame(id, ranks = {}) {
    const base = Object.hasOwn(airframes, id) ? airframes[id] : airframes.kestrel;
    const speed = 1 + .05 * (ranks.speed || 0);
    return { ...base, cruise: base.cruise * speed, boost: base.boost * speed,
      handling: base.handling * (1 + .06 * (ranks.turn || 0)),
      maxHull: 100 + 12 * (ranks.hull || 0), maxShield: 100 + 12 * (ranks.capacity || 0),
      damage: base.damage + 2 * (ranks.cannon || 0), rate: base.rate * (1 + .06 * (ranks.rate || 0)),
    };
  }

  function create(world, notify = () => {}) {
    let saved = [];
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      if (Array.isArray(value)) saved = value.filter((id) => Object.hasOwn(discoveries, id));
    } catch (_) {
      /* Private sessions still keep discoveries for this visit. */
    }

    const freshPlayer = (frame = tunedFrame("kestrel")) => ({
      frame,
      x: 0,
      y: Math.max(140, world.height(0, 0) + 80),
      z: 0,
      yaw: 0,
      pitch: 0,
      bank: 0,
      speed: frame.cruise,
      shield: frame.maxShield,
      hull: frame.maxHull,
      boost: false,
      brake: false,
      missiles: 4,
      roll: 0,
      vy: 0,
      gForce: 1,
      hitFlash: 0,
      hitFrom: null,
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
      lossReason: "",
      terrainWarning: false,
      upgrades: {},
      get loadout() {
        return Object.entries(gear)
          .filter(([id]) => this.upgrades[id] > 0)
          .map(([id, item]) => ({ id, name: item.name, level: this.upgrades[id] }));
      },
      unlocks: saved,
      lockTarget: null,
      lockProgress: 0,
      showGunLead: true,
      get gunLead() {
        const e = this.lockTarget;
        return this.showGunLead && e && e.hp > 0 && !e.ground ? gunIntercept(this.player, e) : null;
      },
      target: null,
      choices: [],
      midwaveDraft: false,
      wave: 0,
      waveCount: 6,
      difficulty: 1,
      missionTitle: "",
      objective: "",
      bonus: "",
      lastReward: "",
      completedWaves: 0,
      creditLedger: { paid: 0 },
      damageByWeapon: freshDamageTotals(),
      mods: { cannon: 0, shield: 0, missiles: 0 },
      kills: 0,
      endless: false,
      start,
      step,
      choose,
      reroll,
      banish,
      respawn,
      get canReroll() {
        return this.state === "draft" && this.charges.reroll > 0 &&
          eligibleGear().some(id => !this.choices.some(choice => choice.id === id));
      },
      continueRun,
      finish,
    };
    let sequence = [],
      mission,
      groups,
      missionTime,
      group,
      required,
      waveTargetCount,
      waveTargetsDestroyed,
      midwaveAvailable,
      bonusIntact,
      gap,
      nextRaid;
    let nextPickupAt = Infinity, volley = 0;
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
    function start(minutes = 10, installed = {}, frameId = "kestrel", fleet = {}, difficulty = 1) {
      const count = clamp(Math.round((Number(minutes) || 10) / 2), 5, 20);
      sequence = ["sweep", "beacons", "rush", "nest", "moons"];
      const extras = ["rush", "nest", "moons"];
      for (let i = 5; i < count; ++i) sequence.push(extras[(i - 5) % extras.length]);
      sequence.push("fleet");
      Object.assign(g, {
        player: freshPlayer(tunedFrame(frameId, installed)),
        fleet: { reroll: 0, banish: 0, respawn: 0, ...fleet },
        banished: new Set(),
        time: 0,
        elapsed: 0,
        wave: 0,
        waveCount: sequence.length,
        difficulty: difficulty === 2 || difficulty === 3 ? difficulty : 1,
        lastReward: "",
        lossReason: "",
        terrainWarning: false,
        kills: 0,
        choices: [],
        state: "playing",
        completedWaves: 0,
        creditLedger: { paid: 0 },
        damageByWeapon: freshDamageTotals(),
        mods: { cannon: 0, shield: 0, missiles: 0, ...installed },
        endless: false,
        upgrades: Object.fromEntries(Object.keys(gear).map((id) => [id, 0])),
      });
      g.wisps.length = g.shots.length = g.particles.length = 0;
      g.charges = { ...g.fleet };
      volley = 0;
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
    function withWingmen(kinds) {
      const extra = (g.difficulty - 1) * 2;
      if (!extra) return kinds;
      return kinds.concat(Array.from({length: extra}, (_, i) => kinds[i % kinds.length]));
    }
    function nextWave() {
      g.wave++;
      const key = sequence[g.wave - 1] || ["rush", "nest", "moons", "fleet"][(g.wave - g.waveCount - 1) % 4];
      mission = encounters[key];
      groups = mission.groups.map(kinds => {
        const first = kinds[0];
        return first === "carrier" || models[first].boat || !models[first].speed ? kinds : withWingmen(kinds);
      });
      waveTargetCount = mission.quota ? mission.quota + g.difficulty - 1 : groups.reduce((sum, kinds) => sum + kinds.length, 0);
      waveTargetsDestroyed = 0;
      midwaveAvailable = true;
      g.midwaveDraft = false;
      missionTime = group = gap = 0;
      nextRaid = 14;
      bonusIntact = true;
      g.state = "playing";
      g.missionTitle = mission.name;
      g.bonus = mission.bonus;
      g.allies.length = g.enemies.length = g.shots.length = 0;
      g.lockTarget = g.target = null;
      g.lockProgress = targetTimer = 0;
      const center = world.islandCenter, p = g.player;
      if (center && (mission === encounters.beacons || mission === encounters.nest)) {
        const dx = p.x - center.x, dz = p.z - center.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 5100) {
          p.x = center.x + 2600 * dx / distance;
          p.z = center.z + 2600 * dz / distance;
          p.y = Math.max(200, world.height(p.x, p.z) + 150);
          p.yaw = Math.atan2(-dx, -dz);
          p.pitch = p.bank = p.roll = p.vy = rollClock = 0;
          p.speed = p.frame.cruise;
          steering = false;
          notify("message", "New approach · inbound to Jade Isle");
        }
      }
      spawnGroup();
    }

    function landSite(x, z) {
      if (world.islandCenter) {
        const center = world.islandCenter;
        let best, bestScore = Infinity;
        for (let dz = -1600; dz <= 1600; dz += 160) {
          for (let dx = -2080; dx <= 2080; dx += 160) {
            const sx = center.x + dx, sz = center.z + dz, h = world.height(sx, sz);
            if (h < 15 || g.enemies.some(e => e.ground && Math.hypot(e.x - sx, e.z - sz) < 220)) continue;
            const relief = Math.max(Math.abs(world.height(sx + 18, sz) - world.height(sx - 18, sz)),
              Math.abs(world.height(sx, sz + 18) - world.height(sx, sz - 18)));
            if (relief > 17) continue;
            const score = Math.hypot(sx - x, sz - z);
            if (score < bestScore) {
              best = { x: sx, z: sz };
              bestScore = score;
            }
          }
        }
        return best || center;
      }
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
        boat: !!model.boat,
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
    function spawnBoat(kind, x, z, mandatory) {
      // Choose a stretch of navigable water for the whole patrol circuit, including its turning space.
      for (let i = 0; i < 1600; i++) {
        const radius = 114 * Math.sqrt(i), angle = i * 2.39996;
        const cx = x + Math.cos(angle) * radius, cz = z + Math.sin(angle) * radius;
        if (world.height(cx, cz) >= -3) continue;
        let clear = true;
        for (const dx of [-52, 0, 52]) {
          for (const dz of [-105, 0, 105]) {
            if (world.height(cx + dx, cz + dz) >= -3) clear = false;
          }
        }
        if (!clear || g.enemies.some(e => e.boat && Math.hypot(e.patrolX-cx, e.patrolZ-cz) < 175)) continue;
        const boat = spawn(kind, cx + 24, 2, cz, mandatory);
        boat.patrolX = cx;
        boat.patrolZ = cz;
        boat.course = 0;
        boat.yaw = 0;
        return true;
      }
      return false;
    }
    function sail(e, dt) {
      // Tangent heading follows the oval. Adjust angular speed to keep wake speed consistent through turns.
      const t = e.course + dt * e.speed / Math.hypot(24 * Math.sin(e.course), 76 * Math.cos(e.course));
      const x = e.patrolX + 24 * Math.cos(t), z = e.patrolZ + 76 * Math.sin(t);
      if (world.height(x, z) >= -2) return;
      e.course = t % TAU;
      e.x = x; e.z = z;
      e.y = 2 + 0.38 * Math.sin(e.age * 2 + e.phase);
      e.yaw = Math.atan2(-24 * Math.sin(t), 76 * Math.cos(t));
      e.bank = 0.025 * Math.sin(e.age * 1.3 + e.phase);
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
        kinds = groups[group];
      const ground = models[kinds[0]].speed === 0;
      const bearing = p.yaw + (group % 2 ? 0.45 : -0.1);
      required = mission.quota ? waveTargetCount : kinds.length;
      if (models[kinds[0]].boat) {
        for (const [i, kind] of kinds.entries()) {
          const side = (i - (kinds.length - 1) / 2) * 320;
          const x = p.x + Math.sin(bearing) * 730 + Math.cos(bearing) * side;
          const z = p.z + Math.cos(bearing) * 730 - Math.sin(bearing) * side;
          if (!spawnBoat(kind, x, z, true)) {
            // A map without navigable water can still complete the shore encounter.
            const site = landSite(x, z);
            spawn("relay", site.x, world.height(site.x, site.z) + 6, site.z);
          }
        }
        spawnFlights(withWingmen(["interceptor", "dart", "jet"]), bearing + 0.3, 640, false);
      } else if (ground) {
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
        const defenders = withWingmen(mission === encounters.nest
            ? ["crescent", "dart", "crescent", "jet", "bomber", "jet"]
            : ["interceptor", "dart", "jet", "jet", "bomber"]);
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
        spawnFlights(withWingmen(["dart", "bomber", "jet", "crescent", "crescent"]), bearing + 0.23, 690, false);
      } else {
        const range = mission === encounters.sweep ? 300 : 660;
        spawnFlights(kinds, bearing, range, true);
      }
      if (mission === encounters.sweep && group === 0)
        spawnBoat("cutter", p.x + Math.sin(bearing + .45) * 520, p.z + Math.cos(bearing + .45) * 520, false);
      g.target = g.enemies.find((e) => e.mandatory && e.hp > 0) || null;
      updateObjective();
    }
    function updateObjective() {
      if (mission.duration) {
        g.objective = mission.detail + "  ·  " + Math.max(0, Math.ceil(mission.duration - missionTime)) + " s";
        return;
      }
      if (mission.quota) {
        g.objective = waveTargetsDestroyed + "/" + waveTargetCount + " jets destroyed" +
          (midwaveAvailable ? " · upgrade at " + Math.ceil(waveTargetCount / 2) : "");
        return;
      }
      g.objective = mission.detail + (waveTargetCount > 1 ? "  ·  " + waveTargetsDestroyed + "/" + waveTargetCount : "");
    }
    function eligibleGear() {
      return Object.keys(gear).filter(
        (id) => !g.banished.has(id) && (!discoveries[id] || g.unlocks.includes(id)) && g.upgrades[id] < gear[id].max,
      );
    }
    function draftChoices(previous = []) {
      const pool = eligibleGear();
      // Rotate less-seen equipment into the draft while reserving room to level an owned item.
      const candidates = shuffled(pool).sort((a, b) =>
        Number(previous.includes(a)) - Number(previous.includes(b)) || (offered[a] || 0) - (offered[b] || 0));
      const ids = candidates.slice(0, 3);
      const owned = pool.filter((id) => g.upgrades[id]);
      if (!previous.length && owned.length && !ids.some((id) => g.upgrades[id]))
        ids[0] = owned[Math.floor(Math.random() * owned.length)];
      if (!ids.length)
        return [
          {
            id: "service",
            name: "Pit Service",
            level: 1,
            description: "Recharge the shield and reload every rail.",
            changes: [
              { label: "Shield", before: g.player.shield, after: g.player.frame.maxShield },
              { label: "Missiles", before: g.player.missiles, after: 4 },
            ],
          },
        ];
      return ids.map(offer);
    }
    function offer(id) {
      offered[id] = (offered[id] || 0) + 1;
      const item = gear[id], rank = g.upgrades[id];
      return {
        id,
        name: item.name,
        level: rank + 1,
        description: item.description,
        changes: compareStats(item.stats(rank, g), item.stats(rank + 1, g)),
        get focus() { return focusHint(id, g); },
      };
    }
    function reroll() {
      if (!g.canReroll) return false;
      g.choices = draftChoices(g.choices.map(choice => choice.id));
      g.charges.reroll--;
      return true;
    }
    function banish(id) {
      if (g.state !== "draft" || !g.charges.banish || id === "service" ||
          !g.choices.some(choice => choice.id === id)) return false;
      g.banished.add(id);
      g.charges.banish--;
      const alternatives = shuffled(eligibleGear()).filter(key => !g.choices.some(choice => choice.id === key));
      g.choices = g.choices.flatMap(choice => choice.id !== id ? [choice] :
        alternatives.length ? [offer(alternatives[0])] : []);
      if (!g.choices.length) g.choices = draftChoices();
      return true;
    }
    function atMidpoint() {
      if (mission.duration) return missionTime >= mission.duration / 2;
      if (mission === encounters.fleet && required > 0) {
        const carrier = g.enemies.find(e => e.kind === "carrier");
        return carrier && carrier.hp <= carrier.maxHp / 2;
      }
      return waveTargetsDestroyed >= Math.ceil(waveTargetCount / 2);
    }
    function endWave() {
      g.completedWaves++;
      const p = g.player;
      const timed = mission === encounters.nest || mission === encounters.beacons;
      const earned = timed ? missionTime <= 90 : bonusIntact;
      g.lastReward = earned
        ? p.hull === p.frame.maxHull
          ? "Bonus complete · hull at 100%"
          : "Bonus complete · hull repaired"
        : "";
      if (earned) p.hull = Math.min(p.frame.maxHull, p.hull + 30);
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
        g.player.shield = g.player.frame.maxShield;
        g.player.missiles = 4;
        recharge = 0;
      } else g.upgrades[id]++;
      g.choices = [];
      if (g.midwaveDraft) {
        g.midwaveDraft = false;
        g.state = "playing";
      } else nextWave();
      return true;
    }
    function continueRun() {
      if (g.state !== "won") return;
      g.endless = true;
      g.state = "draft";
      g.choices = draftChoices();
    }
    function finish() {
      if (g.state === "downed") g.state = "dead";
      else if (g.state === "playing") g.state = "retired";
      else if (g.state === "won" || (g.endless && g.state === "draft")) g.state = "finished";
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
        climb = y * (input.invertPitch ? -0.91 : 0.91);
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
        if (g.upgrades.comet) p.shield = Math.min(p.frame.maxShield, p.shield + gear.comet.recovery(g.upgrades.comet));
      }
      p.boost = boost;
      const cruise = p.brake ? p.frame.cruise * (60 / 112) : p.frame.cruise;
      p.speed = ease(p.speed, boost ? gear.comet.topSpeed(g.upgrades.comet || 0, p.frame) : cruise, 1.4, dt);
      turn *= p.frame.handling;
      p.yaw = angle(p.yaw + turn * dt);
      const sy = Math.sin(p.yaw),
        cy = Math.cos(p.yaw);
      const floor = Math.max(0, world.height(p.x + sy * p.speed * 0.8, p.z + cy * p.speed * 0.8));
      // The title flyby and north-up camera control their own altitude.
      if (title || !steering || g.view === 2)
        climb = Math.max(climb, Math.min(0.85, (floor + 12 - p.y) / Math.max(30, p.speed * 0.6)));
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
      p.y = Math.min(p.y + f[1] * p.speed * dt, Math.max(2300, surface + 100));
      if (title) p.y = Math.max(surface + 8, p.y);
      g.terrainWarning = !title && (p.y < surface + 12 || p.y + f[1] * p.speed * 0.8 < floor + 12);
      p.vy = ease(p.vy, (p.y - oldY) / dt, 4, dt);
      p.gForce = Math.sqrt(1 + ((turn * p.speed) / 60) ** 2);
      p.hitFlash = Math.max(0, p.hitFlash - dt * 2);
      if (g.time - lastDamage > gear.shield.delay(g.upgrades.shield)) {
        const was = p.shield;
        p.shield = Math.min(p.frame.maxShield, p.shield + dt * gear.shield.recovery(g.upgrades.shield, g.mods.shield));
        if (was < p.frame.maxShield && p.shield === p.frame.maxShield) sound("shield");
      }
    }

    // Probe the belly, nose, tail and wingtips so a low banking pass can clip the surface.
    function checkCrash() {
      const p = g.player, f = forward(p);
      const bank = p.bank + p.roll, sb = Math.sin(bank), cb = Math.cos(bank);
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw), sp = f[1], cp = Math.cos(p.pitch);
      const nearby = [];
      function checkNearby(unit) {
        const extents = (models[unit.kind] || models.jet).hull;
        if (distance(p, unit) <= Math.max(...extents) + 26)
          nearby.push({ unit, extents, sin: Math.sin(unit.yaw), cos: Math.cos(unit.yaw) });
      }
      for (const e of g.enemies) if (e.hp > 0) checkNearby(e);
      for (const wingman of g.allies) checkNearby(wingman);
      for (const [side, up, fore] of p.frame.contactPoints) {
        const lateral = side * cb + up * sb, vertical = up * cb - side * sb;
        const along = fore * cp - vertical * sp;
        const x = p.x + along * sy + lateral * cy, z = p.z + along * cy - lateral * sy;
        const y = p.y + fore * sp + vertical * cp;
        const terrain = world.height(x, z), surface = Math.max(0, terrain);
        let reason = "";
        if (y <= surface) reason = terrain <= 0 ? "Water impact" : "Terrain impact";
        else {
          for (const {unit, extents, sin, cos} of nearby) {
            const dx = x - unit.x, dz = z - unit.z;
            const centerY = unit.ground ? world.height(unit.x, unit.z) + extents[1]
              : unit.boat ? extents[1] : unit.y;
            const nx = (dx * cos - dz * sin) / (extents[0] + 1);
            const nz = (dx * sin + dz * cos) / (extents[2] + 1);
            const ny = (y - centerY) / (extents[1] + 1);
            if (nx * nx + ny * ny + nz * nz <= 1) {
              reason = unit.ground || unit.boat ? "Surface collision" : "Midair collision";
              break;
            }
          }
        }
        if (reason) {
          p.shield = p.hull = 0;
          p.hitFrom = null;
          p.hitFlash = 1;
          loseAircraft(reason);
          impact(x, Math.max(y, surface), z, 21, y <= surface);
          return;
        }
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
    function damage(e, amount, weapon) {
      if (e.hp <= 0) return;
      const removed = Math.min(e.hp, amount);
      g.damageByWeapon[weapon] += removed;
      e.hp -= removed;
      const allied = weapon === "ally";
      e.hitFlash = 0.23;
      if (e.hp > 0) {
        particle("spark", e.x, e.y, e.z, 0.25, 3, 5, 12);
        return;
      }
      if (!allied) g.kills++;
      if (!allied && g.upgrades.siphon && g.player.hull > 0 && g.player.shield < g.player.frame.maxShield) {
        g.player.shield = Math.min(g.player.frame.maxShield, g.player.shield + gear.siphon.recovery(g.upgrades.siphon));
        sound("shield");
      }
      impact(e.x, e.y, e.z, e.kind === "carrier" ? 39 : 13, groundUnit(e) || e.boat);
      if (e.mandatory && required > 0) {
        required--;
        waveTargetsDestroyed++;
        updateObjective();
      }
    }
    function hurt(amount, shot) {
      const p = g.player;
      if (g.state !== "playing") return;
      if (p.roll && rollClock > 0.17 && rollClock < 0.63) return;
      const shieldCost = 1 - gear.shield.resistance(g.upgrades.shield) / 100;
      const absorb = Math.min(p.shield, amount * shieldCost);
      const leak = Math.max(0, amount - absorb / shieldCost);
      p.shield = Math.max(0, p.shield - absorb);
      if (leak > 0.01) {
        p.hull = Math.max(0, p.hull - leak / p.frame.armor);
        bonusIntact = false;
      }
      p.hitFlash = 1;
      p.hitFrom = [-shot.vx, -shot.vy, -shot.vz];
      lastDamage = g.time;
      sound(absorb > 0 && p.shield === 0 ? "shieldBreak" : leak > 0.01 ? "hurt" : "deflect");
      if (p.hull <= 0) {
        loseAircraft("Aircraft lost");
        impact(p.x, p.y, p.z, 21);
      }
    }
    function loseAircraft(reason) {
      g.lossReason = reason;
      bonusIntact = false;
      g.state = g.charges.respawn > 0 ? "downed" : "dead";
    }
    function respawn() {
      if (g.state !== "downed" || g.charges.respawn <= 0) return false;
      const lost = g.player;
      const p = freshPlayer(lost.frame);
      // Enter behind the impact, clear of the terrain and nearby aircraft.
      p.yaw = lost.yaw;
      const sx = Math.sin(p.yaw), sz = Math.cos(p.yaw);
      p.x = lost.x - sx * 280;
      p.z = lost.z - sz * 280;
      for (let d = 0; d <= 360; d += 40)
        p.y = Math.max(p.y, world.height(p.x + sx * d, p.z + sz * d) + 160);
      for (const unit of [...g.enemies, ...g.allies]) {
        if (Math.hypot(unit.x - p.x, unit.z - p.z) < 400) p.y = Math.max(p.y, unit.y + 100);
      }
      g.charges.respawn--;
      g.player = p;
      g.shots = g.shots.filter(s => s.kind !== "enemy");
      g.target = g.lockTarget = null;
      g.lockProgress = targetTimer = shotTimer = recharge = rollClock = 0;
      g.terrainWarning = steering = false;
      g.lossReason = "";
      lastDamage = g.time;
      g.state = "playing";
      sound("shield");
      return true;
    }

    function shot(kind, src, f, speed, power, life, target = null, weapon = kind) {
      const s = {
        kind, weapon,
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
        if (d > gear.link.range(link) || d < 2) continue;
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
        g.lockProgress = Math.min(1, g.lockProgress + dt * gear.link.lockRate(link));
        if (g.lockProgress === 1) sound("lock");
      }
    }
    function gunMuzzle(p, f, side = 0) {
      const length = p.frame.nose + 1;
      return {
        x: p.x + f[0] * length + Math.cos(p.yaw) * side,
        y: p.y + f[1] * length - .65,
        z: p.z + f[2] * length - Math.sin(p.yaw) * side,
      };
    }
    function gunIntercept(p, target) {
      const { vx, vy, vz } = target;
      const velocity2 = vx * vx + vy * vy + vz * vz;
      if (!(velocity2 > 1)) return null;
      const muzzle = gunMuzzle(p, forward(p));
      const x = target.x - muzzle.x, y = target.y - muzzle.y, z = target.z - muzzle.z;
      const distance2 = x * x + y * y + z * z;
      const closing = x * vx + y * vy + z * vz;
      const speed = p.speed + p.frame.shotSpeed;
      // Solve |offset + velocity * t| = round speed * t for the first arrival.
      const t = distance2 / (Math.sqrt(closing * closing + (speed * speed - velocity2) * distance2) - closing);
      if (!(t > 0 && t < gunRoundLife)) return null;
      return { x: target.x + vx * t, y: target.y + vy * t, z: target.z + vz * t };
    }
    function fireWeapons(dt, input) {
      const p = g.player,
        f = forward(p),
        cannon = g.upgrades.cannon,
        rail = g.upgrades.missiles;
      shotTimer = shotTimer > 0 ? shotTimer - dt : 0;
      if (input.fire && shotTimer <= 0) {
        const sides = gear.cannon.barrels(cannon) === 2 ? [-4, 4] : [0];
        const specialty = g.mods.specialty || 0;
        volley++;
        if (p.frame.id === "kestrel" && specialty && volley % (7 - specialty) === 0) sides.push(-6, 6);
        for (const offset of sides) {
          const nose = gunMuzzle(p, f, offset);
          const frame = p.frame;
          const power = gear.cannon.power(cannon, frame);
          const arc = .085 * (1 - .15 * specialty);
          for (const spread of frame.id === "manta" ? [-arc, 0, arc] : [0]) {
            const direction = spread ? forward({ yaw: p.yaw + spread, pitch: p.pitch }) : f;
            const round = shot("cannon", nose, direction, p.speed + frame.shotSpeed, power, gunRoundLife);
            round.style = frame.id;
            if (frame.id === "needle") round.pierced = new Set();
          }
        }
        const volleysPerSecond = gear.cannon.rate(cannon, p.frame);
        shotTimer += 1 / (volleysPerSecond * (g.rapidFireRemaining > 0 ? 2 : 1));
        sound(p.frame.id === "kestrel" ? "cannon" : p.frame.id);
      }
      if (input.missile && p.missiles > 0) {
        const locked = g.lockProgress >= 1 && g.lockTarget && g.lockTarget.hp > 0 ? g.lockTarget : null;
        const side = p.missiles % 2 ? -5 : 5;
        const wing = { x: p.x + Math.cos(p.yaw) * side, y: p.y - 1.7, z: p.z - Math.sin(p.yaw) * side };
        const s = shot("missile", wing, f, p.speed + 238, gear.missiles.power(rail), 6.5, locked);
        if (!locked && Math.abs(p.pitch) < 0.18) {
          const reach = clamp(380 + p.y * 0.65, 460, 1100);
          s.destination = { x: p.x + f[0] * reach, z: p.z + f[2] * reach };
          s.destination.y = Math.max(0, world.height(s.destination.x, s.destination.z)) - 1;
        }
        if (g.upgrades.salvo) {
          const level = g.upgrades.salvo;
          const angles = gear.salvo.angles[level];
          for (const offset of angles) {
            const direction = forward({ yaw: p.yaw + offset, pitch: p.pitch });
            shot("wisp", wing, direction, p.speed + 435, 17, 2.4, level === 3 ? locked : null, "salvo");
          }
        }
        p.missiles--;
        sound("missile");
      }
      if (p.missiles < 4) {
        recharge += dt;
        if (recharge >= gear.missiles.reload(rail, g.mods.missiles)) {
          p.missiles++;
          recharge = 0;
        }
      } else recharge = 0;
    }
    function tailTurret() {
      const level = g.upgrades.tail;
      if (!level || g.time < tailReady) return;
      const p = g.player, f = forward(p);
      let target = null, reach = gear.tail.range(level);
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
        shot("wisp", rear, aim(rear, target), 420, gear.tail.power(level), 2, target, "tail");
        sound("wisp");
      }
      tailReady = g.time + (target ? gear.tail.delay(level) : 0.12);
    }
    function orbitGuard() {
      const level = g.upgrades.guard;
      if (!level || g.time < guardReady) return;
      const p = g.player, f = forward(p), range = gear.guard.range[level];
      // Prefer the closest closing projectile; outgoing shots leave the pulse available.
      const closing = g.shots.filter(s => {
        if (s.kind !== "enemy" || distance(p, s) > range) return false;
        return (s.x - p.x) * (s.vx - f[0] * p.speed)
          + (s.y - p.y) * (s.vy - f[1] * p.speed)
          + (s.z - p.z) * (s.vz - f[2] * p.speed) < 0;
      }).sort((a, b) => distance(p, a) - distance(p, b)).slice(0, gear.guard.count[level]);
      if (!closing.length) return;
      for (const s of closing) {
        g.shots.splice(g.shots.indexOf(s), 1);
        particle("ring", s.x, s.y, s.z, 0.25, 12);
        particle("spark", s.x, s.y, s.z, 0.2, 3, 12, 3);
        particle("spark", s.x, s.y, s.z, 0.2, 3, -12, 3);
      }
      guardReady = g.time + gear.guard.delay[level];
      sound("wisp");
    }
    function launchSupport(target) {
      g.damageByWeapon.ally ??= 0;
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
        const kind = rollPickup(100 * p.shield / p.frame.maxShield);
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
        p.shield = p.frame.maxShield;
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
      const n = gear.wisps.count[level];
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
          shot("wisp", w, aim(w, nearest), 450, 10, 4.4, nearest, "wisps");
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
        const oldX = e.x, oldY = e.y, oldZ = e.z;
        if (e.boat) sail(e, dt);
        else if (!groundUnit(e)) {
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
        e.vx = (e.x - oldX) / dt;
        e.vy = (e.y - oldY) / dt;
        e.vz = (e.z - oldZ) / dt;
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
          if (prism || bomber || e.kind === "gunboat") {
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
          if (e.hp <= 0 || s.pierced?.has(e)) continue;
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
      if (hit === g.player) hurt(s.power, s);
      else if (hit) {
        damage(hit, s.power, s.weapon || s.kind);
        if (s.kind === "cannon") {
          sound("hit");
          const level = g.upgrades.arc;
          if (level && Math.random() < 0.45) {
            const near = g.enemies.find((e) => e !== hit && e.hp > 0 && distance(hit, e) < gear.arc.range(level));
            if (near) shot("wisp", s, aim(s, near), 560, gear.arc.power(level), 1.3, near, "arc");
          }
        }
      }
      if (hit && s.pierced && s.pierced.size < 1 + (g.mods.specialty || 0)) {
        s.pierced.add(hit);
        return first < 1 ? impacts(s, dt * (1 - first)) : false;
      }
      if (s.kind === "missile") {
        impact(s.x, hit ? s.y : floor + 0.3, s.z, 15, !hit);
        const range = gear.missiles.radius(g.upgrades.missiles);
        for (const e of g.enemies) {
          const reach = distance(s, e) - e.radius;
          if (e !== hit && e.hp > 0 && reach < range) damage(e, s.power * 0.6 * (1 - Math.max(0, reach) / range), "missile");
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
      checkCrash();
      if (g.state !== "playing") return;
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
      if (midwaveAvailable && atMidpoint()) {
        midwaveAvailable = false;
        g.midwaveDraft = true;
        g.state = "draft";
        g.choices = draftChoices();
        updateObjective();
        sound("upgrade");
        return;
      }
      if (mission.duration) {
        updateObjective();
        if (missionTime >= mission.duration) {
          endWave();
          return;
        }
        if (missionTime >= nextRaid && g.enemies.length < 5 + (g.difficulty - 1) * 2) {
          group = (group + 1) % groups.length;
          spawnGroup();
          nextRaid = missionTime + 9;
        } else if (g.enemies.length <= g.difficulty + 1 && nextRaid - missionTime > 2.5) nextRaid = missionTime + 2.5;
        return;
      }
      // A long straight flight can leave every visible aircraft behind. Send
      // another flight across the player's path while the objective stays live.
      if (required && missionTime >= nextRaid && (mission.quota || groundUnit(g.target || {}))) {
        nextRaid = missionTime + 14;
        const inRange = (e) => distance(g.player, e) < 1500;
        if (!g.enemies.some((e) => !groundUnit(e) && !e.boat && inRange(e))) {
          g.enemies = g.enemies.filter((e) => e.mandatory && !mission.quota);
          spawnFlights(withWingmen(["jet", "interceptor", "jet"]), g.player.yaw - 0.25, 600, !!mission.quota);
          g.target = g.enemies.find((e) => e.mandatory) || null;
        }
      }
      if (!required) {
        gap += dt;
        if (gap >= (mission.quota ? 0.35 : 1.3)) {
          gap = 0;
          if (group + 1 < groups.length) {
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

  window.SplashOneGame = { create, airframes, tunedFrame };
})();
