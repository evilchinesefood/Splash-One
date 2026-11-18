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
    g.start(minutes);
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
  function sync() {
    const state = g.state,
      home = state === "title",
      phase = paused ? "paused" : state;
    $("home").hidden = !home;
    $("flight").hidden = home;
    $("pause").hidden = !active();
    $("touch").hidden = !active() || !touchMode;
    PatrolAudio.flight(active(), g.player.boost);
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
      $("shield").value = p.shield;
      $("hull").value = p.hull;
    }
    const key = phase + ":" + g.wave;
    if (lastPanel === key) return;
    lastPanel = key;
    const modal = $("modal");
    modal.classList.toggle("upgrade-draft", phase === "draft");
    $("pauseDetails").hidden = $("pauseRegion").hidden = phase !== "paused";
    modal.hidden = home || phase === "playing";
    if (modal.hidden) return;
    clearInput();
    const actions = $("actions");
    actions.replaceChildren();
    let title, detail, kicker;
    if (phase === "draft") {
      const rank = pilotLevel();
      kicker = "Wave " + g.wave + " complete";
      if (g.choices.some((item) => item.id !== "service")) kicker += " · Level " + (rank + 1);
      title = "Upgrade your jet";
      detail = g.lastReward || "Choose one upgrade for the next wave.";
      PatrolUpgrades.show(actions, g.choices, (id) => {
        if (!g.choose(id)) return;
        PatrolAudio.play("equip");
        sync();
      });
    } else if (phase === "paused") {
      kicker = "Wave " + g.wave + " · " + g.missionTitle;
      title = "Patrol paused";
      detail = touchMode && innerWidth > innerHeight && innerHeight <= 470 && g.bonus ? "Bonus · " + g.bonus : "";
      const equipment = g.loadout;
      $("pilotLevel").textContent = "Pilot level " + pilotLevel();
      const loadout = $("loadout");
      loadout.replaceChildren();
      if (!equipment.length) {
        const empty = document.createElement("li");
        empty.textContent = "Standard cannon and missiles. Choose your first upgrade after three kills.";
        loadout.append(empty);
      }
      for (const item of equipment) {
        const row = document.createElement("li");
        row.append(PatrolUpgrades.icon(item.id), item.name + " · Lv " + item.level);
        loadout.append(row);
      }
      actions.append(
        button("Resume patrol", pause, null, true),
        button("End patrol and change region", flightDeck),
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
      kicker = phase === "dead" ? "Aircraft lost" : "Patrol complete";
      title = phase === "dead" ? "End of patrol" : "Welcome home";
      detail =
        "Wave " +
        g.wave +
        " reached · " +
        g.kills +
        " targets destroyed. Milestone unlocks carry into your next patrol.";
      actions.append(button("Fly again", start, null, true), button("Flight deck", flightDeck));
    }
    $("modalKicker").textContent = kicker;
    $("modalTitle").textContent = title;
    $("modalText").textContent = detail;
    actions.firstElementChild?.focus({ preventScroll: true });
  }
  function steer(e) {
    if (!active() || e.pointerType === "touch") return;
    input.x = clamp((2 * e.clientX) / innerWidth - 1, -1, 1);
    input.y = clamp(1 - (2 * e.clientY) / innerHeight, -1, 1);
    input.moved = true;
  }
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
    if (e.code === "Escape" && !e.repeat) {
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
      if (active() || g.state === "title") {
        carry += dt;
        while (carry >= fixed) {
          g.step(fixed, input);
          input.missile = false;
          input.roll = 0;
          carry -= fixed;
          if (!active() && g.state !== "title") {
            carry = 0;
            break;
          }
        }
      }
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) $("toast").textContent = "";
      }
      PatrolAudio.flight(active(), g.player.boost);
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
  const regions = {
    lake: {
      name: "Autumn Lake District",
      intro: "Fly among island forests and mountain lakes.",
      day: "Golden hour",
    },
    mesa: { name: "Painted Mesa", intro: "Follow the river between red sandstone mesas.", day: "Daylight" },
  };
  function updateSky() {
    const id = world?.mapId || $("regionPick").value;
    const night = $("lightPick").value === "night";
    world?.setNight(night);
    $("lightPick").options[0].textContent = regions[id].day;
    $("regionName").textContent = regions[id].name.toUpperCase() + (night ? " · NIGHT" : "");
    $("regionIntro").textContent = regions[id].intro;
    document.title = "Patrol — " + regions[id].name + (night ? " by Night" : "");
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
      toast(err.message || "Unable to load the terrain.");
    } finally {
      loadingMap = false;
      $("progress").hidden = true;
      $("regionPick").disabled = $("launch").disabled = false;
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
