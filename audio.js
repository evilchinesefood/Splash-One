/* All audio is generated on the first user gesture. No sound files or network requests. */
window.PatrolAudio = (() => {
  const muteKey = "patrol.audio.muted";
  const musicKey = "patrol.music.muted";
  const levels = { music: 100, effects: 100 };
  const channels = {};
  let enabled = true, musicEnabled = true;
  try {
    enabled = localStorage.getItem(muteKey) !== "1";
    musicEnabled = localStorage.getItem(musicKey) !== "1";
    for (const name of Object.keys(levels)) {
      const value = localStorage.getItem("patrol.volume." + name);
      if (value !== null && value.trim() && Number.isFinite(Number(value))) {
        levels[name] = Math.max(0, Math.min(100, Math.round(Number(value))));
      }
    }
  } catch { /* Private windows still support sound for the current visit. */ }

  let ctx, master, noise, engineGain, intake, turbine, rumble;
  let flightMode = 0, appliedMode = -1;

  function makeEngine() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("Web Audio unavailable");
    ctx = new Context();
    master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -13;
    limiter.ratio.value = 5;
    master.connect(limiter).connect(ctx.destination);
    master.gain.value = 0.8;
    for (const name of Object.keys(levels)) {
      channels[name] = ctx.createGain();
      channels[name].gain.value = levels[name] / 100;
      channels[name].connect(master);
    }

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(channels.effects);
    const rush = ctx.createBufferSource();
    rush.buffer = noise;
    rush.loop = true;
    intake = ctx.createBiquadFilter();
    intake.type = "lowpass";
    intake.Q.value = 0.58;
    rush.connect(intake).connect(engineGain);
    turbine = ctx.createOscillator();
    turbine.type = "triangle";
    const whine = ctx.createGain();
    whine.gain.value = 0.23;
    turbine.connect(whine).connect(engineGain);
    rumble = ctx.createOscillator();
    rumble.type = "sine";
    const body = ctx.createGain();
    body.gain.value = 0.62;
    rumble.connect(body).connect(engineGain);
    rumble.start();
    rush.start();
    turbine.start();
  }

  function updateEngine() {
    const mode = enabled ? flightMode : 0;
    if (!ctx || mode === appliedMode) return;
    const ignition = mode === 2 && appliedMode === 1;
    appliedMode = mode;
    const now = ctx.currentTime;
    const boost = mode === 2;
    const braking = mode === 3;
    engineGain.gain.setTargetAtTime(mode ? (boost ? 0.32 : braking ? 0.09 : 0.15) : 0, now, 0.09);
    rumble.frequency.setTargetAtTime(boost ? 98 : braking ? 52 : 72, now, 0.24);
    intake.frequency.setTargetAtTime(boost ? 2600 : braking ? 620 : 1100, now, 0.16);
    turbine.frequency.setTargetAtTime(boost ? 320 : braking ? 126 : 194, now, 0.18);
    if (ignition) voice("noise", 460, 2300, 0.36, 0.45, 0, channels.effects, 0.055);
  }

  async function start() {
    if (!enabled) return false;
    try {
      if (!ctx) makeEngine();
      if (ctx.state !== "running") await ctx.resume();
      updateEngine();
      return enabled && ctx.state === "running";
    } catch (error) {
      console.warn("Patrol audio could not start", error);
      return false;
    }
  }

  async function toggle() {
    enabled = !enabled;
    try {
      localStorage.setItem(muteKey, enabled ? "0" : "1");
    } catch { /* Keep using the in-memory preference. */ }
    if (ctx) master.gain.value = enabled ? 0.8 : 0;
    updateEngine();
    if (!enabled) stopMusic();
    if (!enabled) {
      if (ctx) await ctx.suspend().catch(() => {});
      return enabled;
    }
    if (await start()) {
      play("lock");
    } else if (enabled) {
      enabled = false;
    }
    return enabled;
  }

  // Short noise bursts provide the attack; pitched sweeps carry through small speakers.
  function voice(type, from, to, length, level, delay = 0, output = channels.effects, attack = 0.005) {
    const t = ctx.currentTime + delay;
    const envelope = ctx.createGain();
    let source, filter, pitch;
    if (type === "noise") {
      source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = 0.7;
      source.connect(filter).connect(envelope);
      pitch = filter.frequency;
    } else {
      source = ctx.createOscillator();
      source.type = type;
      source.connect(envelope);
      pitch = source.frequency;
    }
    pitch.setValueAtTime(from, t);
    pitch.exponentialRampToValueAtTime(to, t + length);
    envelope.gain.setValueAtTime(0.0001, t);
    envelope.gain.exponentialRampToValueAtTime(level, t + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + length);
    envelope.connect(output);
    source.onended = () => {
      source.disconnect();
      filter?.disconnect();
      envelope.disconnect();
    };
    if (filter) source.start(t, Math.random() * noise.duration);
    else source.start(t);
    source.stop(t + length);
  }

  const effects = {
    cannon() {
      const pitch = 0.94 + Math.random() * 0.12;
      voice("noise", 3600 * pitch, 710, 0.068, 0.76);
      voice("triangle", 204 * pitch, 67, 0.105, 0.44);
      voice("noise", 1700, 560, 0.045, 0.22, 0.045);
    },
    missile() {
      voice("triangle", 310, 89, 0.085, 0.42);
      voice("noise", 680, 3950, 0.23, 0.78, 0.025, channels.effects, 0.065);
      voice("noise", 2850, 360, 0.56, 0.65, 0.18);
    },
    boom() {
      voice("noise", 4100, 380, 0.28, 0.96);
      voice("sine", 158, 43, 0.69, 0.75);
      voice("noise", 950, 165, 0.83, 0.65, 0.075, channels.effects, 0.065);
    },
    splash() {
      voice("sine", 195, 64, 0.23, 0.57);
      voice("noise", 1150, 3900, 0.22, 0.68, 0, channels.effects, 0.035);
      voice("noise", 3200, 540, 0.54, 0.52, 0.13, channels.effects, 0.065);
    },
    hit() { voice("triangle", 1210, 455, 0.077, 0.24); },
    deflect() { voice("sine", 730, 325, 0.19, 0.35); voice("triangle", 1050, 470, 0.12, 0.15); },
    hurt() { voice("sawtooth", 205, 75, 0.23, 0.23); voice("noise", 2100, 390, 0.22, 0.65); },
    radio() {
      voice("noise", 1950, 820, 0.065, 0.24);
      voice("triangle", 880, 880, 0.095, 0.25, 0.035);
      voice("triangle", 659, 659, 0.14, 0.23, 0.145);
      voice("noise", 1400, 610, 0.055, 0.17, 0.26);
    },
    lock() { voice("sine", 820, 820, 0.11, 0.35); voice("sine", 1120, 1120, 0.15, 0.34, 0.095); },
    shield() { voice("sine", 360, 980, 0.41, 0.39); },
    wisp() { voice("triangle", 800, 345, 0.16, 0.37); },
    upgrade() {
      [440, 554, 659, 880].forEach((hz, i) => voice("triangle", hz, hz, i === 3 ? 0.52 : 0.18, 0.38, i * 0.085));
      voice("sine", 1320, 1320, 0.46, 0.19, 0.26);
    },
    equip() { voice("triangle", 660, 990, 0.16, 0.34); },
    win() { [440, 554, 659, 880].forEach((hz, i) => voice("triangle", hz, hz, 0.46, 0.43, i * 0.15)); }
  };
  function play(kind) {
    if (enabled && ctx?.state === "running") effects[kind]?.();
  }

  // Eight bars in D minor. Each column is an eighth note; rests leave room for flight cues.
  const harmony = [
    [50, 53, 57, 64], [46, 53, 57, 62], [53, 57, 60, 64], [48, 55, 62, 64],
    [50, 57, 60, 65], [46, 53, 57, 62], [43, 50, 55, 58], [45, 52, 55, 61],
  ];
  const melody = [
    [0, 0, 69, 0, 72, 0, 76, 0], [74, 0, 0, 0, 69, 0, 65, 0],
    [0, 0, 69, 72, 0, 0, 67, 0], [64, 0, 0, 0, 0, 67, 0, 0],
    [69, 0, 0, 72, 0, 77, 76, 0], [74, 0, 0, 0, 72, 0, 69, 0],
    [67, 0, 70, 0, 74, 0, 0, 0], [73, 0, 0, 0, 69, 0, 0, 0],
  ];
  let musicBus, step = 0, nextBeat = 0;
  const eighth = 60 / 106 / 2;
  const hz = note => 440 * 2 ** ((note - 69) / 12);

  function scoreStep(delay, carrier) {
    const bar = Math.floor(step / 8) % harmony.length, beat = step % 8, chord = harmony[bar];
    const response = step >= harmony.length * 8;
    function tone(type, note, duration, level, offset = 0, attack = 0.01) {
      const pitch = hz(note);
      voice(type, pitch, pitch, duration, level, delay + offset, musicBus, attack);
    }
    if (!beat) {
      for (const note of chord.slice(1)) tone("sine", note + 12, eighth * 7.7, 0.072, 0, 0.18);
    }
    if (beat === 0 || beat === 3 || beat === 4 || (carrier && beat === 6)) {
      tone("triangle", chord[0] - (beat === 3 ? 5 : 12), eighth * 1.35, 0.22);
    }
    // On the second pass, a lower answering phrase trades notes with a high, soft arpeggio.
    if (response && beat % 2) {
      tone("sine", chord[(beat - 1) / 2] + 24, eighth * 1.4, 0.082);
    }
    const note = melody[bar][beat];
    if (note) {
      const lead = response ? note - 12 : note;
      tone("triangle", lead, eighth * 1.65, 0.155);
      tone("sine", lead, eighth, 0.045, eighth * 0.75);
    }
    if (beat === 0 || beat === 4 || (carrier && beat === 7))
      voice("sine", 128, 48, 0.155, 0.28, delay, musicBus);
    if (beat === 2 || beat === 6)
      voice("noise", 2250, 720, 0.115, 0.21, delay, musicBus);
    if (beat % 2 || carrier)
      voice("noise", 7800, 4300, 0.038, beat % 2 ? 0.095 : 0.05, delay, musicBus);
  }

  function stopMusic() {
    if (!musicBus) return;
    const tail = musicBus;
    musicBus = null;
    tail.gain.setTargetAtTime(0, ctx.currentTime, 0.014);
    setTimeout(() => tail.disconnect(), 90);
  }

  function flight(active, game) {
    const player = game.player;
    if (game.state === "title") step = 0;
    flightMode = active ? (player.boost ? 2 : player.brake ? 3 : 1) : 0;
    updateEngine();
    if (!active || !enabled || !musicEnabled || ctx?.state !== "running") {
      stopMusic();
      return;
    }
    const now = ctx.currentTime;
    if (!musicBus) {
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.54;
      musicBus.connect(channels.music);
      nextBeat = now + 0.025;
    }
    // Schedule against the audio clock. A slow frame must never replay a backlog of notes.
    if (nextBeat < now) nextBeat = now;
    while (nextBeat < now + 0.15) {
      scoreStep(nextBeat - now, game.wave === game.waveCount);
      step = (step + 1) % (harmony.length * 16);
      nextBeat += eighth;
    }
  }

  function setVolume(name, value) {
    if (!Object.hasOwn(levels, name) || !Number.isFinite(value)) return;
    levels[name] = Math.max(0, Math.min(100, Math.round(value)));
    if (ctx) channels[name].gain.setTargetAtTime(levels[name] / 100, ctx.currentTime, 0.012);
    try { localStorage.setItem("patrol.volume." + name, String(levels[name])); } catch { /* Session only. */ }
  }

  function previewVolume(name) {
    if (!enabled || !levels[name] || ctx?.state !== "running") return;
    if (name === "effects") play("equip");
    if (name === "music" && musicEnabled) {
      voice("triangle", 440, 440, 0.22, 0.084, 0, channels.music);
      voice("sine", 554, 554, 0.3, 0.075, 0.11, channels.music);
    }
  }

  function toggleMusic() {
    musicEnabled = !musicEnabled;
    try { localStorage.setItem(musicKey, musicEnabled ? "0" : "1"); } catch { /* Session only. */ }
    if (!musicEnabled) stopMusic();
  }
  return { get enabled() { return enabled; }, get musicEnabled() { return musicEnabled; },
    volume: name => levels[name], setVolume, previewVolume, start, toggle, toggleMusic, play, flight };
})();
