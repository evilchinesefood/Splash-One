/* All audio is generated on the first user gesture. No sound files or network requests. */
window.PatrolAudio = (() => {
  const muteKey = "patrol.audio.muted";
  let enabled = true;
  try {
    enabled = localStorage.getItem(muteKey) !== "1";
  } catch { /* Private windows still support sound for the current visit. */ }

  let ctx, master, noise, engineGain, intake, turbine;
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

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineGain.connect(master);
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
    rush.start();
    turbine.start();
  }

  function updateEngine() {
    const mode = enabled ? flightMode : 0;
    if (!ctx || mode === appliedMode) return;
    appliedMode = mode;
    const now = ctx.currentTime;
    const boost = mode === 2;
    engineGain.gain.setTargetAtTime(mode ? (boost ? 0.37 : 0.16) : 0, now, 0.09);
    intake.frequency.setTargetAtTime(boost ? 2850 : 1050, now, 0.16);
    turbine.frequency.setTargetAtTime(boost ? 360 : 185, now, 0.18);
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
  function voice(type, from, to, length, level, delay = 0) {
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
    envelope.gain.exponentialRampToValueAtTime(level, t + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + length);
    envelope.connect(master);
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
    cannon() { voice("noise", 3400, 550, 0.13, 0.94); voice("triangle", 235, 78, 0.12, 0.48); },
    missile() { voice("noise", 3800, 520, 0.64, 0.86); voice("sawtooth", 560, 110, 0.37, 0.17); },
    boom() { voice("noise", 4200, 170, 0.95, 1.35); voice("sine", 170, 49, 0.59, 0.85); },
    hit() { voice("square", 330, 155, 0.095, 0.2); },
    hurt() { voice("sawtooth", 295, 80, 0.34, 0.42); },
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
  function flight(active, boost) {
    flightMode = active ? (boost ? 2 : 1) : 0;
    updateEngine();
  }
  return { get enabled() { return enabled; }, start, toggle, play, flight };
})();
