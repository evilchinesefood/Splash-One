"use strict";
window.PatrolBindings = (() => {
  const key = "patrol.bindings.v1";
  const actions = {
    fire: ["Primary weapon", "Mouse0"], missile: ["Missile", "Mouse2", "KeyF"],
    boost: ["Afterburner", "Shift"], brake: ["Airbrake", "KeyS"],
    rollLeft: ["Roll left", "KeyQ"], rollRight: ["Roll right", "KeyE"],
    view: ["Change camera", "Space"], pause: ["Pause / resume", "KeyP"],
  };
  const names = {
    Mouse0: "Left click", Mouse1: "Middle click", Mouse2: "Right click", Shift: "Shift",
    Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
    Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
  };
  const supported = code => typeof code === "string" && (Object.hasOwn(names, code) ||
    /^(Key[A-Z]|Digit[0-9]|Space|Arrow(Up|Down|Left|Right)|Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal))$/.test(code));
  const normalize = code => code === "ShiftLeft" || code === "ShiftRight" ? "Shift" : code;
  const label = code => names[code] || code.replace(/^(Key|Digit)/, "").replace(/^Arrow/, "Arrow ").replace(/^Numpad/, "Num ");
  const defaults = () => Object.fromEntries(Object.entries(actions).map(([id, [, first, second]]) => [id, [first, second || null]]));

  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(key)), used = new Set();
      for (const id of Object.keys(actions)) {
        const pair = saved?.[id];
        if (!Array.isArray(pair) || pair.length !== 2 || !pair.some(Boolean)) return defaults();
        for (const code of pair) {
          if (code === null) continue;
          if (!supported(code) || used.has(code)) return defaults();
          used.add(code);
        }
      }
      return saved;
    } catch { return defaults(); }
  }

  function create(editor) {
    let map = read(), listening = null;
    const title = document.createElement("h3"), note = document.createElement("p"), status = document.createElement("p");
    title.textContent = "Keyboard and mouse";
    note.textContent = "Steer with the mouse. Choose a binding, then press a key or click it with a mouse button. Esc cancels an edit and always pauses in flight.";
    status.className = "binding-status";
    status.setAttribute("role", "status");
    const grid = document.createElement("div");
    grid.className = "binding-grid";
    const buttons = [];
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "binding-reset";
    reset.textContent = "Restore defaults";
    editor.append(title, note, grid, reset, status);

    function owner(code) {
      return Object.keys(actions).find(id => map[id].includes(normalize(code)));
    }
    function draw() {
      for (const { id, slot, button } of buttons) {
        const code = map[id][slot];
        button.textContent = listening?.button === button ? "Listening…" : code ? label(code) : "+ Add";
        button.setAttribute("aria-pressed", String(listening?.button === button));
        button.setAttribute("aria-label", actions[id][0] + ", " + (slot ? "alternate" : "first") + " binding, " + (code ? label(code) : "unassigned"));
      }
    }
    function cancel() {
      listening = null;
      status.textContent = "";
      draw();
    }
    function save(message) {
      listening = null;
      try { localStorage.setItem(key, JSON.stringify(map)); }
      catch { message += " Saved for this visit."; }
      status.textContent = message;
      draw();
    }
    function assign(code) {
      const { id, slot } = listening;
      const conflict = owner(code);
      if (conflict && (conflict !== id || map[id][slot] !== code)) {
        status.textContent = label(code) + " already controls " + actions[conflict][0].toLowerCase() + ". Choose another input.";
        return;
      }
      map[id][slot] = code;
      save(actions[id][0] + " assigned to " + label(code) + ".");
    }
    for (const [id, [title]] of Object.entries(actions)) {
      const name = document.createElement("span");
      name.textContent = title;
      grid.append(name);
      for (let slot = 0; slot < 2; slot++) {
        const button = document.createElement("button");
        button.type = "button";
        const binding = { id, slot, button };
        buttons.push(binding);
        button.addEventListener("click", event => {
          if (listening === binding && event.detail && event.pointerType !== "touch") {
            assign("Mouse0");
            return;
          }
          listening = binding;
          status.textContent = "Listening for " + title.toLowerCase() + ". Delete clears this slot.";
          draw();
        });
        button.addEventListener("mousedown", event => {
          if (listening === binding && (event.button === 1 || event.button === 2)) {
            event.preventDefault();
            assign("Mouse" + event.button);
          }
        });
        button.addEventListener("blur", () => { if (listening === binding) cancel(); });
        grid.append(button);
      }
    }
    reset.onclick = () => { map = defaults(); save("Default controls restored."); };
    draw();
    function capture(event) {
      if (!listening) return false;
      if (event.code === "Tab") { cancel(); return true; }
      event.preventDefault();
      if (event.repeat) return true;
      const code = normalize(event.code);
      if (code === "Escape") cancel();
      else if (code === "Delete" || code === "Backspace") {
        const { id, slot } = listening;
        if (map[id][1 - slot]) { map[id][slot] = null; save("Binding cleared."); }
        else status.textContent = "Keep one binding for " + actions[id][0].toLowerCase() + ".";
      } else if (supported(code) && !event.ctrlKey && !event.altKey && !event.metaKey) assign(code);
      else status.textContent = "Choose a letter, number, arrow, punctuation, Shift, Space or mouse button.";
      return true;
    }
    return { owner, capture, cancel };
  }
  return { create };
})();
