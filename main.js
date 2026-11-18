"use strict";
const patrol = (() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $("world"),
    overlay = $("art"),
    ink = overlay.getContext("2d");
  const input = {
    x: 0,
    y: 0,
    moved: false,
    fire: false,
    boost: false,
    brake: false,
    missile: false,
    roll: 0,
  };
  const viewNames = ["Chase cam", "Cockpit", "North-up"];
  const durations = document.querySelectorAll("[data-duration]");
  const glyphs = {
    P: ["111110", "110011", "110011", "111110", "110000", "110000", "110000"],
    A: ["011110", "110011", "110011", "111111", "110011", "110011", "110011"],
    T: ["111111", "001100", "001100", "001100", "001100", "001100", "001100"],
    R: ["111110", "110011", "110011", "111110", "111100", "110110", "110011"],
    O: ["011110", "110011", "110011", "110011", "110011", "110011", "011110"],
    L: ["110000", "110000", "110000", "110000", "110000", "110000", "111111"],
  };
  function drawMark() {
    const mark = $("wordmark"),
      c = mark.getContext("2d");
    mark.width = 175;
    mark.height = 33;
    [..."PATROL"].forEach((letter, i) =>
      glyphs[letter].forEach((line, y) =>
        [...line].forEach((bit, x) => {
          if (bit === "0") return;
          const px = i * 28 + x * 4 + Math.floor((6 - y) * 0.6),
            py = y * 4;
          c.fillStyle = "#8e4f50";
          c.fillRect(px, py + 4, 4, 4);
          c.fillStyle = y < 4 ? "#fff0c9" : "#ffd592";
          c.fillRect(px, py, 4, 4);
        }),
      ),
    );
    const badge = document.querySelector(".crest").getContext("2d");
    const mountains = [
      "000000000000000",
      "000000010000000",
      "000000111000000",
      "010001101100010",
      "011111101111110",
      "001111101111100",
      "000011101110000",
      "000001111100000",
      "000000010000000",
    ];
    badge.fillStyle = "#ffb378";
    mountains.forEach((row, y) =>
      [...row].forEach((b, x) => {
        if (b === "1") badge.fillRect(x * 2, 3 + y * 2, 2, 2);
      }),
    );
  }
  drawMark();
  let loadingMap = false;
  let g,
    world,
    minutes = 10,
    paused = false,
    lastPanel = "",
    last = 0,
    scale = 340,
    slow = 0,
    time = 0,
    toastTimer = 0;
  let view = 0,
    transition = null,
    lastCam = null;
  const fixed = 1 / 60;
  let carry = 0;
  const coarse = matchMedia("(pointer:coarse)");
  const contacts = new Map();
  const desktopHeld = { fire: false, brake: false, boost: false };
  const stick = $("stick");
  let stickId = null, touchMode = coarse.matches;
  document.body.classList.toggle("touch-active", touchMode);

  const stage = $("stage"), captureMouse = $("captureMouse");
  const canLockMouse = typeof stage.requestPointerLock === "function";
  let lockPending = false, hadMouseLock = false, lockHintShown = false;
  $("captureSetting").hidden = !canLockMouse;
  try { captureMouse.checked = localStorage.getItem("patrol.captureMouse") !== "off"; } catch {}
  captureMouse.onchange = () => {
    try { localStorage.setItem("patrol.captureMouse", captureMouse.checked ? "on" : "off"); } catch {}
  };

  function captureFailed() {
    lockPending = false;
    if (active() && !lockHintShown) {
      lockHintShown = true;
      toast("Mouse is free · click the flight view to capture");
    }
  }
  function captureFlightMouse() {
    if (!active() || touchMode || !captureMouse.checked || !canLockMouse ||
        document.pointerLockElement || lockPending) return;
    lockPending = true;
    try {
      // Older browsers report completion through events without returning a promise.
      stage.requestPointerLock()?.catch(captureFailed);
    } catch { captureFailed(); }
  }
  function releaseFlightMouse() {
    if (document.pointerLockElement === stage) document.exitPointerLock();
  }
  document.addEventListener("pointerlockerror", captureFailed);
  document.addEventListener("pointerlockchange", () => {
    lockPending = false;
    const locked = document.pointerLockElement === stage;
    const released = hadMouseLock && !locked;
    hadMouseLock = locked;
    $("pause").textContent = locked ? "Ⅱ Pause · P" : "Ⅱ Pause";
    if (locked) {
      lockHintShown = false;
      if (!active() || touchMode) releaseFlightMouse();
    } else if (released && active() && !touchMode) {
      pause();
    }
  });

  function refreshHeldActions() {
    for (const key of ["fire", "brake", "boost"]) input[key] = desktopHeld[key];
    for (const { key } of contacts.values()) {
      if (Object.hasOwn(desktopHeld, key)) input[key] = true;
    }
  }
  function releaseContact(id) {
    const contact = contacts.get(id);
    if (!contact) return;
    contacts.delete(id);
    if (id === stickId) {
      stickId = null;
      input.x = input.y = 0;
      stick.firstElementChild.style.transform = "";
    }
    if (contact.element.hasPointerCapture(id)) contact.element.releasePointerCapture(id);
    refreshTouchFeedback();
  }
  function releaseTouches() {
    for (const id of contacts.keys()) releaseContact(id);
  }
  function setTouchMode(on) {
    if (on === touchMode) return;
    releaseTouches();
    input.x = input.y = 0;
    touchMode = on;
    if (on) releaseFlightMouse();
    document.body.classList.toggle("touch-active", on);
    $("touch").hidden = !active() || !on;
  }

  function clearInput() {
    releaseTouches();
    desktopHeld.fire = desktopHeld.brake = desktopHeld.boost = false;
    Object.assign(input, {
      x: 0,
      y: 0,
      fire: false,
      boost: false,
      brake: false,
      missile: false,
      roll: 0,
    });

  }
  function toast(msg) {
    $("toast").textContent = msg;
    toastTimer = 2.8;
  }
  function syncSoundButton() {
    const enabled = PatrolAudio.enabled;
    $("audio").innerHTML = '<span id="audioIcon">♪</span> Sound ' + (enabled ? "on" : "off");
    $("audio").setAttribute("aria-pressed", String(enabled));
    $("music").textContent = "Music " + (PatrolAudio.musicEnabled ? "on" : "off");
    $("music").setAttribute("aria-pressed", String(PatrolAudio.musicEnabled));
  }
  $("music").onclick = () => {
    PatrolAudio.toggleMusic();
    syncSoundButton();
  };
  for (const name of ["music", "effects"]) {
    const slider = $(name + "Volume");
    const value = $(name + "Percent");
    slider.value = PatrolAudio.volume(name);
    function showLevel() {
      value.textContent = slider.value + "%";
      slider.setAttribute("aria-valuetext", value.textContent);
    }
    slider.oninput = () => {
      PatrolAudio.setVolume(name, slider.valueAsNumber);
      showLevel();
    };
    slider.onchange = () => PatrolAudio.previewVolume(name);
    showLevel();
  }
  async function unlockSound() {
    if (PatrolAudio.enabled && !(await PatrolAudio.start()))
      toast("Audio unavailable. Use the sound button to retry.");
    syncSoundButton();
  }
  $("audio").onclick = async () => {
    const enabling = !PatrolAudio.enabled;
    const enabled = await PatrolAudio.toggle();
    syncSoundButton();
    if (enabling && !enabled) toast("Audio unavailable. Use the sound button to retry.");
  };
  syncSoundButton();

  const fullscreen = $("fullscreen");
  fullscreen.hidden = !document.fullscreenEnabled;
  fullscreen.onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $("stage").requestFullscreen();
    } catch {
      toast("Fullscreen is unavailable in this browser window.");
    }
  };
  document.addEventListener("fullscreenchange", () => {
    const on = !!document.fullscreenElement;
    fullscreen.title = on ? "Exit fullscreen" : "Enter fullscreen";
    fullscreen.textContent = on ? "⛶ Exit fullscreen" : "⛶ Fullscreen";
    fullscreen.setAttribute("aria-label", fullscreen.title);
    fullscreen.setAttribute("aria-pressed", String(on));
    resize();
  });
  function notify(type, detail) {
    if (type === "message") toast(detail);
    if (type === "sound") PatrolAudio.play(detail);
  }
  const actionPad = document.querySelector("#touch .pad");
  let cockpitSpace = null;
  function resize() {
    const rect = canvas.getBoundingClientRect(),
      aspect = rect.width / Math.max(1, rect.height);
    cockpitSpace = null;
    if (touchMode && rect.width > rect.height && rect.height <= 500 && !$("touch").hidden) {
      const left = stick.getBoundingClientRect().right + 5;
      const right = actionPad.getBoundingClientRect().left - 5;
      if (right > left) cockpitSpace = [(left - rect.left) / rect.width, (right - rect.left) / rect.width];
    }
    const h = Math.round(Math.min(scale, 970 / Math.max(1, aspect))),
      w = Math.max(1, Math.round(h * aspect));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = overlay.width = w;
      canvas.height = overlay.height = h;
      ink.imageSmoothingEnabled = false;
    }
  }
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
    mix = (a, b, k) => a + (b - a) * k;
  const unit = (a) => {
    const n = Math.hypot(...a) || 1;
    return a.map((v) => v / n);
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function basis(x, y, z, f, r, tilt, tan) {
    const forward = unit(f),
      right0 = unit(r),
      up0 = unit(cross(forward, right0)),
      cs = Math.cos(tilt),
      sn = Math.sin(tilt);
    const right = right0.map((v, i) => v * cs - up0[i] * sn);
    return { x, y, z, forward, right, up: unit(cross(forward, right)), tan };
  }
  function camera() {
    const p = g.player,
      title = g.state === "title",
      portraitDeck = title && canvas.width < canvas.height,
      yaw = p.yaw + (portraitDeck ? 0.45 : title ? 0.12 : 0),
      pit = p.pitch,
      horiz = [Math.sin(yaw), 0, Math.cos(yaw)],
      rt = [Math.cos(yaw), 0, -Math.sin(yaw)];
    let c;
    if (view === 2 && !title) c = basis(p.x, p.y + 230, p.z, [0, -1, 0], [1, 0, 0], 0, 0.67);
    else if (view === 1 && !title) {
      const f = [horiz[0] * Math.cos(pit), Math.sin(pit), horiz[2] * Math.cos(pit)];
      c = basis(p.x + f[0] * 5, p.y + 2.2 + f[1] * 5, p.z + f[2] * 5, f, rt, p.bank + p.roll, 0.61);
    } else {
      const d = portraitDeck ? 49 : title ? 35 : 49,
        rise = portraitDeck ? 17 : 12;
      const f = [horiz[0] * Math.cos(pit), Math.sin(pit), horiz[2] * Math.cos(pit)];
      const off = title && !portraitDeck ? clamp((canvas.width / canvas.height) * 11, 9, 27) : 0;
      const down = title ? -0.08 : 0.014;
      c = basis(
        p.x - f[0] * d - rt[0] * off,
        p.y - f[1] * d + rise,
        p.z - f[2] * d - rt[2] * off,
        [horiz[0] * Math.cos(pit + down), Math.sin(pit + down), horiz[2] * Math.cos(pit + down)],
        rt,
        title ? -0.035 : p.bank * 0.18,
        0.58,
      );
    }
    if (touchMode && !title && canvas.width < canvas.height) {
      // Keep contacts on either side of the nose visible in a tall flight window.
      c.tan *= clamp(0.82 * canvas.height / canvas.width, 1, 1.65);
    }
    let cb = view === 1 ? 1 : 0;
    if (transition) {
      let t = clamp((time - transition.t) / 0.95, 0, 1);
      t = t * t * (3 - 2 * t);
      const a = transition.from;
      c.x = mix(a.x, c.x, t);
      c.y = mix(a.y, c.y, t);
      c.z = mix(a.z, c.z, t);
      c.tan = mix(a.tan, c.tan, t);
      c.forward = unit(a.forward.map((v, i) => mix(v, c.forward[i], t)));
      const r = a.right.map((v, i) => mix(v, c.right[i], t));
      c.up = unit(cross(c.forward, r));
      c.right = unit(cross(c.up, c.forward));
      cb = mix(transition.cb, cb, t);
      if (t === 1) transition = null;
    }
    c.y = Math.max(c.y, Math.max(0, world.height(c.x, c.z)) + 2);
    g.cockpitBlend = cb;
    c.cockpitSpace = touchMode ? cockpitSpace : null;
    lastCam = c;
    return c;
  }
  function changeView() {
    if (!active()) return;
    transition = { t: time, from: lastCam, cb: g.cockpitBlend || 0 };
    view = (view + 1) % 3;
    g.view = view;
    if (stickId === null) {
      input.x = input.y = 0;
      input.moved = false;
    }
    sync();
  }
  function projectFor(c) {
    const focal = overlay.height / (2 * c.tan);
    return (x, y, z) => {
      const dx = x - c.x,
        dy = y - c.y,
        dz = z - c.z;
      const dot = (a) => dx * a[0] + dy * a[1] + dz * a[2];
      const d = dot(c.forward);
      if (d < 0.65) return null;
      const k = focal / d;
      return {
        x: overlay.width / 2 + dot(c.right) * k,
        y: overlay.height / 2 - dot(c.up) * k,
        d,
        k,
      };
    };
  }
  function active() {
    return g?.state === "playing" && !paused;
  }
  function button(text, fn, desc, primary = false) {
    const el = document.createElement("button");
    el.className = "action" + (primary ? " primary" : "");
    const strong = document.createElement("strong");
    strong.textContent = text;
    el.append(strong);
    if (desc) {
      const small = document.createElement("small");
      small.textContent = desc;
      el.append(small);
    }
    el.onclick = fn;
    return el;
  }
  const hangar = $("hangar");
  let settlement = Promise.resolve();

  let workshopScope = "kestrel";
  const workshops = {
    kestrel: { title: "Multirole fighter", accent: "#a5cddb" },
    needle: { title: "Interceptor", accent: "#8bd9d3" },
    manta: { title: "Heavy attack wing", accent: "#ffb382" },
    fleet: { title: "All aircraft", accent: "#d1b8f0" },
  };
  function refreshWallet(profile = PatrolHangar.read()) {
    $("deckCredits").textContent = profile.credits + " cr";
    $("wallet").textContent = profile.credits.toLocaleString("en-US");
  }
  function hangarHint() {
    return PatrolHangar.sessionOnly ? "Progress is saved for this visit." : "Upgrades take effect on your next patrol.";
  }
  function renderParts() {
    const scope = workshopScope;
    const fleet = scope === "fleet";
    const frame = PatrolGame.airframes[scope];
    const catalog = fleet ? PatrolHangar.fleetParts : PatrolHangar.partsFor(scope);
    const profile = PatrolHangar.read();
    const ranks = fleet ? profile.fleet : profile.ships[scope];
    refreshWallet(profile);
    hangar.style.setProperty("--bay-accent", workshops[scope].accent);
    for (const tab of $("workbenches").children) {
      tab.setAttribute("aria-pressed", tab.dataset.scope === scope);
    }
    $("workshopClass").textContent = workshops[scope].title;
    $("workshopName").textContent = fleet ? "Fleet upgrades" : frame.name;
    $("workshopWeapon").textContent = fleet ? "Charges refresh each patrol." : frame.weapon;
    const stats = $("workshopStats");
    const tuned = fleet ? null : PatrolGame.tunedFrame(scope, ranks);
    const readings = fleet ? [["Re-rolls", ranks.reroll], ["Banishes", ranks.banish], ["Extra lives", ranks.respawn]]
      : [["Cruise", Math.round(tuned.cruise * 1.94384) + " kt"], ["Turn", Math.round(tuned.handling * 1.5 * 180 / Math.PI) + "°/s"],
         ["Hull", tuned.maxHull], ["Shield", tuned.maxShield], ["Round damage", tuned.damage], ["Volleys / sec", Number(tuned.rate.toFixed(2))]];
    stats.replaceChildren();
    for (const [name, value] of readings) {
      const label = document.createElement("dt"), reading = document.createElement("dd");
      label.textContent = name;
      reading.textContent = value;
      stats.append(label, reading);
    }
    const installed = Object.values(ranks).reduce((sum, rank) => sum + rank, 0);
    const capacity = catalog.reduce((sum, part) => sum + part.prices.length, 0);
    $("workshopProgress").textContent = installed + " / " + capacity + " ranks installed";
    const art = $("workshopPortrait");
    art.replaceChildren(...(fleet ? ["kestrel", "needle", "manta"] : [scope]).map(PatrolArt.aircraftPortrait));
    art.classList.toggle("fleet-formation", fleet);
    const cards = [];
    for (const part of catalog) {
      const rank = ranks[part.id];
      const cost = part.prices[rank];
      const row = document.createElement("article");
      row.className = "part" + (part.id === "specialty" ? " signature-part" : "");
      const icon = PatrolUpgrades.icon(part.icon, 56);
      const head = document.createElement("header");
      const group = document.createElement("small");
      group.textContent = part.group;
      const title = document.createElement("h4");
      title.textContent = part.name;
      head.append(group, title);
      const description = document.createElement("p");
      description.textContent = part.detail;
      const level = document.createElement("span");
      level.className = "part-rank";
      level.title = "Rank " + rank + " of " + part.prices.length;
      level.setAttribute("role", "img");
      level.setAttribute("aria-label", level.title);
      for (let i = 0; i < part.prices.length; i++) {
        const pip = document.createElement("i");
        if (i < rank) pip.className = "fitted";
        level.append(pip);
      }
      const buy = document.createElement("button");
      buy.type = "button";
      buy.dataset.part = part.id;
      buy.textContent = cost === undefined ? "Max rank" : cost + " cr";
      buy.disabled = cost === undefined || cost > profile.credits;
      buy.setAttribute("aria-label", cost === undefined ? part.name + " at max rank" : "Upgrade " + part.name + " for " + cost + " credits");
      buy.onclick = async () => {
        buy.disabled = true;
        const purchased = await PatrolHangar.purchase(scope, part.id);
        renderParts();
        if (scope !== workshopScope || !hangar.open) return;
        if (!purchased) $("hangarStatus").textContent = "Balance or rank changed.";
        if (purchased) {
          const current = PatrolHangar.read();
          const rankNow = (fleet ? current.fleet : current.ships[scope])[part.id];
          $("hangarStatus").textContent = part.name + " installed · Rank " + rankNow + (PatrolHangar.sessionOnly ? " · This visit" : "");
          PatrolAudio.play("equip");
        }
        const next = $("parts").querySelector('[data-part="' + part.id + '"]:enabled') ||
          $("workbenches").querySelector('[aria-pressed="true"]');
        next.focus({ preventScroll: true });
      };
      const controls = document.createElement("div");
      controls.className = "part-controls";
      controls.append(level, buy);
      row.append(icon, head, description, controls);
      cards.push(row);
    }
    $("parts").replaceChildren(...cards);
  }
  $("workbenches").addEventListener("click", event => {
    const tab = event.target.closest("[data-scope]");
    if (!tab || workshopScope === tab.dataset.scope) return;
    workshopScope = tab.dataset.scope;
    renderParts();
    $("workshopBody").scrollTop = $("parts").scrollTop = 0;
    $("hangarStatus").textContent = hangarHint();
  });
  async function openHangar() {
    await settlement;
    workshopScope = g && g.state !== "title" ? g.player.frame.id : $("airframePick").value;
    $("hangarStatus").textContent = hangarHint();
    renderParts();
    if (!hangar.open) hangar.showModal();
    $("workshopBody").scrollTop = $("parts").scrollTop = 0;
    $("workbenches").querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  }
  $("openHangar").onclick = openHangar;
  window.addEventListener("storage", () => {
    refreshWallet();
    if (hangar.open) renderParts();
  });
  function showEarnings() {
    const bill = PatrolHangar.statement(g);
    const lines = ["Flight time +" + bill.flight, "Targets +" + bill.combat, "Missions +" + bill.missions];
    if (bill.bonus) lines.push("Carrier victory +" + bill.bonus);
    $("earnedTotal").textContent = "Patrol earnings · " + bill.total + " credits";
    $("earnedBreakdown").textContent = lines.join("  ·  ");
    settlement = PatrolHangar.deposit(g, bill).then(refreshWallet);
  }
  const airframePick = $("airframePick");
  try {
    const saved = localStorage.getItem("patrol.airframe");
    if (Object.hasOwn(PatrolGame.airframes, saved)) airframePick.value = saved;
  } catch { /* Keep the selection in memory when storage is unavailable. */ }
  function previewAirframe() {
    const frame = PatrolGame.airframes[airframePick.value];
    $("controlPrimary").textContent = frame.weapon.toLowerCase();
    $("touchPrimaryHint").textContent = frame.trigger;
    document.querySelector('[data-control="fire"]').textContent = frame.trigger;
    if (g?.state === "title") g.player.frame = PatrolGame.tunedFrame(frame.id, PatrolHangar.read().ships[frame.id]);
  }
  airframePick.onchange = () => {
    previewAirframe();
    try { localStorage.setItem("patrol.airframe", airframePick.value); } catch { /* Session only. */ }
  };
  previewAirframe();
  function start() {
    if (loadingMap) return;
    if (!world) {
      loadMap();
      return;
    }
    clearInput();
    view = 0;
    transition = null;
    paused = false;
    unlockSound();
    const profile = PatrolHangar.read();
    g.start(minutes, profile.ships[airframePick.value], airframePick.value, profile.fleet);
    g.view = 0;
    carry = 0;
    lastPanel = "";
    sync();
  }
  durations.forEach(
    (b) =>
      (b.onclick = () => {
        minutes = Number(b.dataset.duration);
        durations.forEach((x) => x.setAttribute("aria-pressed", x === b));
      }),
  );
  $("launch").onclick = start;
  function pause() {
    if (g?.state !== "playing") return;
    paused = !paused;
    if (!paused) unlockSound();
    clearInput();
    carry = 0;
    sync();
  }
  $("pause").onclick = pause;
  $("viewName").onclick = changeView;
  function flightDeck() {
    clearInput();
    g = PatrolGame.create(world, notify);
    previewAirframe();
    g.view = view = 0;
    paused = false;
    transition = lastCam = null;
    carry = 0;
    lastPanel = "";
    sync();
  }
  function pilotLevel() {
    return 1 + g.loadout.reduce((sum, item) => sum + item.level, 0);
  }
  function equipmentCard(icon, name, info) {
    const row = document.createElement("li");
    const text = document.createElement("div");
    const label = document.createElement("small");
    const title = document.createElement("strong");
    label.textContent = info;
    title.textContent = name;
    text.append(label, title);
    row.append(PatrolUpgrades.icon(icon, 56), text);
    return row;
  }
  function showEquipment() {
    const frame = g.player.frame;
    const primaryIcon = { needle: "arc", manta: "salvo" }[frame?.id] || "cannon";
    $("pilotLevel").textContent = "Pilot level " + pilotLevel();
    $("weapons").replaceChildren(
      equipmentCard(primaryIcon, frame?.weapon || "Pulse cannon", "Primary"),
      equipmentCard("missiles", "Lock-on missiles", "Secondary"),
    );
    const upgrades = g.loadout;
    $("patrolEquipment").hidden = !upgrades.length;
    $("loadout").replaceChildren(...upgrades.map(item =>
      equipmentCard(item.id, item.name, "Rank " + item.level)));
    const parts = PatrolHangar.partsFor(frame.id).filter(part => g.mods[part.id] > 0);
    const perks = PatrolHangar.fleetParts.filter(part => g.fleet[part.id] > 0);
    $("hangarEquipment").hidden = !parts.length && !perks.length;
    $("installedParts").replaceChildren(
      ...parts.map(part => equipmentCard(part.icon || part.id, part.name, "Rank " + g.mods[part.id])),
      ...perks.map(perk => equipmentCard(perk.icon || perk.id, perk.name, "Fleet · " + g.charges[perk.id] + " left")),
    );
    $("pauseDetails").scrollTop = 0;
  }
  function renderDraft(detail, banishing = false, celebrate = true) {
    const tools = $("draftTools"), actions = $("actions");
    const reroll = $("reroll"), banish = $("banish");
    const hasGear = g.choices.some(choice => choice.id !== "service");
    tools.hidden = !(g.fleet.reroll || g.fleet.banish);
    reroll.hidden = !g.fleet.reroll;
    reroll.disabled = !g.canReroll;
    reroll.textContent = "Re-roll · " + g.charges.reroll;
    reroll.title = g.canReroll ? "Draw a different set of upgrades" :
      g.charges.reroll ? "All remaining upgrades are already shown" : "No re-rolls left this patrol";
    banish.hidden = !g.fleet.banish;
    banish.disabled = !hasGear || !g.charges.banish;
    banish.setAttribute("aria-pressed", banishing);
    banish.textContent = banishing ? "Cancel banish" : "Banish · " + g.charges.banish;
    banish.title = "Remove a choice from future offers this patrol";
    const redraw = (mode) => {
      renderDraft(detail, mode, false);
      actions.firstElementChild?.focus({ preventScroll: true });
    };
    reroll.onclick = () => { if (g.reroll()) redraw(false); };
    banish.onclick = () => redraw(!banishing);
    $("modalText").textContent = banishing ? "Pick an upgrade to banish for this patrol. Then choose your upgrade." : detail;
    PatrolUpgrades.show(actions, g.choices, id => {
      if (banishing) {
        if (g.banish(id)) redraw(false);
      } else if (g.choose(id)) {
        PatrolAudio.play("equip");
        sync();
      }
    }, { banishing, celebrate });
  }

  function sync() {
    const state = g.state,
      home = state === "title",
      phase = paused ? "paused" : state;
    $("home").hidden = !home;
    $("flight").hidden = home;
    $("pause").hidden = !active();
    $("touch").hidden = !active() || !touchMode;
    PatrolAudio.flight(active(), g);
    document.body.classList.toggle("steering", active());
    document.body.classList.toggle("flying", !home);
    document.body.classList.toggle("cockpit", !home && view === 1);
    const p = g.player;
    if (!home) {
      $("viewName").textContent = viewNames[view];
      $("missileCount").textContent = "Missiles " + p.missiles + "/4";
      $("wave").textContent =
        (g.wave > g.waveCount ? "Endless" : "Wave") +
        " " +
        g.wave +
        (g.wave <= g.waveCount ? " / " + g.waveCount : "");
      $("missionTitle").textContent = g.missionTitle || "";
      $("objective").textContent = g.objective || "";
      $("bonus").textContent = g.bonus ? "Bonus · " + g.bonus : "";
      $("shield").max = p.frame.maxShield;
      $("hull").max = p.frame.maxHull;
      $("shield").value = p.shield;
      $("hull").value = p.hull;
    }
    const key = phase + ":" + g.wave;
    if (lastPanel === key) return;
    lastPanel = key;
    if (phase === "playing") captureFlightMouse();
    else releaseFlightMouse();
    const modal = $("modal");
    modal.classList.toggle("upgrade-draft", phase === "draft");
    modal.classList.toggle("pause-menu", phase === "paused");
    $("pauseDetails").hidden = $("pauseRegion").hidden = phase !== "paused";
    const debrief = ["won", "dead", "retired", "finished"].includes(phase);
    $("earnings").hidden = !debrief;
    if (debrief) showEarnings();
    if (home) refreshWallet();
    modal.hidden = home || phase === "playing";
    $("flight").inert = !modal.hidden;
    if (modal.hidden) return;
    clearInput();
    const actions = $("actions");
    actions.replaceChildren();
    let title, detail, kicker;
    $("draftTools").hidden = true;
    if (phase === "draft") {
      const rank = pilotLevel();
      kicker = "Wave " + g.wave + (g.midwaveDraft ? " · " + g.missionTitle : " complete");
      if (g.choices.some((item) => item.id !== "service")) kicker += " · Level " + (rank + 1);
      title = "Upgrade your jet";
      detail = g.midwaveDraft ? "Choose an upgrade to resume this mission." :
        g.lastReward || "Choose one upgrade for the next wave.";
      renderDraft(detail);
    } else if (phase === "downed") {
      kicker = g.lossReason + " · Wave " + g.wave;
      title = "Reserve aircraft ready";
      detail = g.charges.respawn + (g.charges.respawn === 1 ? " reserve remains. " : " reserves remain. ") +
        "Rejoin this mission with full hull, shield and missiles. Your upgrades stay aboard.";
      actions.append(button("Respawn", () => {
        if (!g.respawn()) return;
        clearInput();
        carry = 0;
        transition = null;
        sync();
      }, null, true), button("End patrol", () => { g.finish(); sync(); }));
    } else if (phase === "paused") {
      kicker = "Wave " + g.wave + " · " + g.missionTitle;
      title = "Paused";
      detail = touchMode && innerWidth > innerHeight && innerHeight <= 470 && g.bonus ? "Bonus · " + g.bonus : "";
      showEquipment();
      actions.append(
        button("Resume", pause, null, true),
        button("End", () => {
          paused = false;
          g.finish();
          sync();
        }),
      );
    } else if (phase === "won") {
      kicker = "Carrier destroyed";
      title = "Patrol complete";
      detail = "Your victory is secured. Return home or take this build into harder waves.";
      actions.append(
        button(
          "Fly another wave",
          () => {
            g.continueRun();
            sync();
          },
          null,
          true,
        ),
        button("Return home", () => {
          g.finish();
          sync();
        }),
      );
    } else {
      kicker = phase === "dead" ? g.lossReason || "Aircraft lost" : phase === "retired" ? "Patrol ended" : "Patrol complete";
      title = phase === "dead" ? "End of patrol" : "Welcome home";
      detail =
        "Wave " +
        g.wave +
        " reached · " +
        g.kills +
        " targets destroyed. Milestone unlocks carry into your next patrol.";
      actions.append(button("Hangar", openHangar, null, true), button("Fly again", start), button("Flight deck", flightDeck));
    }
    $("modalKicker").textContent = kicker;
    $("modalTitle").textContent = title;
    $("modalText").textContent = detail;
    actions.firstElementChild?.focus({ preventScroll: true });
  }
  function steer(e) {
    if (!active() || e.pointerType === "touch" || document.pointerLockElement === stage) return;
    // A browser that denies capture can still reach full deflection before the window edge.
    const gain = captureMouse.checked ? 1.5 : 1;
    input.x = clamp((2 * e.clientX / innerWidth - 1) * gain, -1, 1);
    input.y = clamp((1 - 2 * e.clientY / innerHeight) * gain, -1, 1);
    input.moved = true;
  }
  window.addEventListener("mousemove", e => {
    if (!active() || document.pointerLockElement !== stage || !(e.movementX || e.movementY)) return;
    input.x = clamp(input.x + 2 * e.movementX / stage.clientWidth, -1, 1);
    input.y = clamp(input.y - 2 * e.movementY / stage.clientHeight, -1, 1);
    input.moved = true;
  });
  // Real mouse pointer events precede compatibility mouse events on hybrid devices.
  window.addEventListener("pointerdown", e => {
    setTouchMode(e.pointerType === "touch");
  }, true);
  window.addEventListener("pointermove", e => {
    if (e.pointerType === "touch") return;
    setTouchMode(false);
    steer(e);
  });
  coarse.addEventListener("change", () => setTouchMode(coarse.matches));
  $("stage").addEventListener("mousedown", (e) => {
    if (!active() || touchMode || e.target.closest("button,#touch") || e.sourceCapabilities?.firesTouchEvents) return;
    e.preventDefault();
    steer(e);
    captureFlightMouse();
    if (e.button === 0) desktopHeld.fire = input.fire = true;
    if (e.button === 2) input.missile = true;
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0 && !e.sourceCapabilities?.firesTouchEvents) {
      desktopHeld.fire = false;
      refreshHeldActions();
    }
  });
  $("stage").addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if (hangar.open) return;
    if ((e.code === "Escape" || e.code === "KeyP") && !e.repeat) {
      pause();
      return;
    }
    if (!active()) return;
    if (["Space", "ShiftLeft", "ShiftRight", "KeyF", "KeyQ", "KeyE", "KeyS"].includes(e.code)) e.preventDefault();
    if (e.code.startsWith("Shift")) desktopHeld.boost = input.boost = true;
    if (e.code === "KeyS") desktopHeld.brake = input.brake = true;
    if (e.repeat) return;
    if (e.code === "Space") changeView();
    if (e.code === "KeyF") input.missile = true;
    if (e.code === "KeyQ" || e.code === "KeyE") input.roll = e.code === "KeyQ" ? -1 : 1;
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyS") desktopHeld.brake = false;
    if (e.code.startsWith("Shift")) desktopHeld.boost = e.shiftKey;
    refreshHeldActions();
  });
  window.addEventListener("blur", () => {
    if (active()) pause();
    clearInput();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && active()) pause();
  });
  const touchButtons = [...document.querySelectorAll("[data-control]")];
  function refreshTouchFeedback() {
    const pressed = new Set();
    for (const contact of contacts.values()) {
      pressed.add(contact.element);
      if (contact.overMissile) pressed.add(missileButton);
    }
    for (const element of [stick, ...touchButtons]) element.classList.toggle("pressed", pressed.has(element));
    refreshHeldActions();
  }
  const missileButton = touchButtons.find(b => b.dataset.control === "missile");
  function moveStick(e, contact) {
    const dx = e.clientX - contact.startX, dy = contact.startY - e.clientY;
    const distance = Math.hypot(dx, dy);
    const travel = Math.min(1, distance / contact.radius);
    // Thumb tremor stays neutral; small deliberate movements give fine cannon aim.
    const response = (Math.max(0, travel - 0.1) / 0.9) ** 1.5;
    const nx = distance ? dx / distance : 0, ny = distance ? dy / distance : 0;
    input.x = nx * response;
    input.y = ny * response;
    const knob = contact.radius * 0.72 * travel;
    stick.firstElementChild.style.transform = "translate(" + nx * knob + "px," + -ny * knob + "px)";
  }
  function beginContact(e) {
    const element = e.currentTarget;
    if (!active() || e.pointerType !== "touch" || (element === stick && stickId !== null)) return;
    e.preventDefault();
    const key = element.dataset.control || "steer";
    const contact = { element, key };
    contacts.set(e.pointerId, contact);
    element.setPointerCapture(e.pointerId);
    if (element === stick) {
      stickId = e.pointerId;
      contact.startX = e.clientX;
      contact.startY = e.clientY;
      contact.radius = Math.max(1, stick.getBoundingClientRect().width * 0.4);
      input.x = input.y = 0;
      input.moved = true;
    } else if (key === "missile") input.missile = true;
    else if (key === "roll") input.roll = input.x < -0.1 ? -1 : 1;
    refreshTouchFeedback();
  }
  function moveContact(e) {
    const contact = contacts.get(e.pointerId);
    if (!contact) return;
    if (contact.key === "steer") moveStick(e, contact);
    if (contact.key === "fire") {
      // Capture keeps the cannon held. Hit-test the finger's physical location for a missile pass.
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-control]") === missileButton;
      if (over !== !!contact.overMissile) {
        contact.overMissile = over;
        if (over) input.missile = true;
        refreshTouchFeedback();
      }
    }
  }
  for (const element of [stick, ...touchButtons]) {
    element.addEventListener("pointerdown", beginContact);
    element.addEventListener("pointermove", moveContact);
    for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) {
      element.addEventListener(event, e => {
        if (contacts.get(e.pointerId)?.element === element) releaseContact(e.pointerId);
      });
    }
  }
  window.addEventListener("resize", releaseTouches);
  let lastUi = 0;
  function frame(stamp) {
    const raw = last ? (stamp - last) / 1000 : fixed;
    last = stamp;
    if (!document.hidden) {
      if (raw > 0.038 && raw < 1) slow++;
      else slow = Math.max(0, slow - 1);
      if (slow > 48 && scale > 210) {
        scale = Math.max(210, Math.round(scale * 0.88));
        slow = 0;
        resize();
      }
      const dt = Math.min(0.1, raw);
      time += dt;
      if (active() || g.state === "title" || g.state === "dead") {
        carry += dt;
        while (carry >= fixed) {
          g.step(fixed, input);
          input.missile = false;
          input.roll = 0;
          carry -= fixed;
          if (!active() && g.state !== "title" && g.state !== "dead") {
            carry = 0;
            break;
          }
        }
      }
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) $("toast").textContent = "";
      }
      PatrolAudio.flight(active(), g);
      const cam = camera();
      world.render(cam, g.time);
      ink.clearRect(0, 0, overlay.width, overlay.height);
      PatrolArt.draw(ink, g, cam, projectFor(cam));
      if (stamp - lastUi > 90 || lastPanel !== (paused ? "paused" : g.state) + ":" + g.wave) {
        sync();
        lastUi = stamp;
      }
    }
    requestAnimationFrame(frame);
  }
  const deck = PatrolDeck.create();
  hangar.addEventListener("close", previewAirframe);
  function updateSky() {
    const id = world?.mapId || $("regionPick").value;
    const region = PatrolDeck.regions[id];
    const mode = $("lightPick").value;
    world?.setSky(mode);
    const suffix = mode === "night" ? " · NIGHT" : mode === "storm" ? " · STORM" : "";
    $("regionName").textContent = region.name.toUpperCase() + suffix;
    $("regionIntro").textContent = region.description;
    document.title = "Patrol — " + region.name + suffix;
  }
  async function loadMap() {
    if (loadingMap || (g && g.state !== "title")) return;
    const id = $("regionPick").value;
    loadingMap = true;
    $("regionPick").disabled = $("launch").disabled = true;
    $("progress").hidden = false;
    $("progress").style.width = "0";
    $("launchText").textContent = "Charting terrain";
    const firstLoad = !world;
    try {
      resize();
      const next = await PatrolWorld.create(
        canvas,
        (fraction) => {
          const pct = Math.round(fraction * 100);
          $("progress").style.width = pct + "%";
          $("launchText").textContent = "Charting terrain " + pct + "%";
        },
        id,
      );
      world?.dispose();
      world = next;
      updateSky();
      flightDeck();
      if (firstLoad) requestAnimationFrame(frame);
    } catch (err) {
      console.error(err);
      if (world) $("regionPick").value = world.mapId;
      deck.refresh();
      toast(err.message || "Unable to load the terrain.");
    } finally {
      loadingMap = false;
      $("progress").hidden = true;
      $("regionPick").disabled = $("launch").disabled = false;
      $("openHangar").disabled = !world;
      $("launchText").textContent = world ? "Start patrol" : "Retry terrain";
    }
  }
  $("regionPick").addEventListener("change", loadMap);
  $("lightPick").addEventListener("change", updateSky);
  window.addEventListener("resize", resize);
  const layoutObserver = new ResizeObserver(resize);
  for (const el of [canvas, stick, actionPad]) layoutObserver.observe(el);
  loadMap();
  return {
    get game() {
      return g;
    },
    get camera() {
      return lastCam;
    },
  };
})();
