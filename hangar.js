/* The career balance and installed parts share one save so spending and installation stay together. */
window.PatrolHangar = (() => {
  const legacyKey = "patrol.career.v1";
  const key = "patrol.career.v2";
  const prices = [40, 95, 175];
  const equipment = [
    { id: "cannon", name: "Weapon tuning", icon: "cannon", group: "Weapons", detail: "+2 damage per primary round per rank." },
    { id: "rate", name: "Trigger cycle", icon: "salvo", group: "Weapons", detail: "+6% primary fire rate per rank." },
    { id: "missiles", name: "Rail loader", icon: "missiles", group: "Weapons", detail: "Reload missiles 0.25 seconds faster per rank." },
    { id: "speed", name: "Engine tuning", icon: "comet", group: "Flight", detail: "+5% cruise and boost speed per rank." },
    { id: "turn", name: "Control surfaces", icon: "wisps", group: "Flight", detail: "+6% turn rate per rank." },
    { id: "hull", name: "Hull reinforcement", icon: "service", group: "Protection", detail: "+12 maximum hull per rank." },
    { id: "capacity", name: "Shield bank", icon: "guard", group: "Protection", detail: "+12 maximum shield per rank." },
    { id: "shield", name: "Shield generator", icon: "shield", group: "Protection", detail: "+2 shield points per second while recharging per rank." },
  ];
  const weaponKits = {
    kestrel: { name: "Linked barrels", icon: "cannon", detail: "Add two parallel rounds every sixth volley. Higher ranks trigger every fifth and fourth volley." },
    needle: { name: "Piercing core", icon: "arc", detail: "Each ion bolt can pass through one additional target per rank." },
    manta: { name: "Scatter choke", icon: "salvo", detail: "Tighten your three-round spread by 15% per rank to land more hits at range." },
  };
  const shipParts = Object.fromEntries(Object.entries(weaponKits).map(([id, kit]) => [id, [
    { ...kit, id: "specialty", group: "Signature weapon", prices: [65, 130, 240] },
    ...equipment.map(part => ({ ...part, prices })),
  ]]));
  const fleetParts = [
    { id: "reroll", name: "Re-roll", icon: "link", group: "Draft", prices: [220, 420, 720],
      detail: "Draw a fresh set of upgrade choices. Gain one use per patrol for each rank." },
    { id: "banish", name: "Banish", icon: "tail", group: "Draft", prices: [280, 490, 820],
      detail: "Remove an upgrade from this patrol’s draft pool. Gain one use per patrol for each rank." },
    { id: "respawn", name: "Respawn", icon: "siphon", group: "Recovery", prices: [600, 1100],
      detail: "Return to the fight after losing your aircraft. Gain one extra life per patrol for each rank." },
  ];
  function partsFor(scope) {
    return Object.hasOwn(shipParts, scope) ? shipParts[scope] : [];
  }
  function ranksFor(catalog, source) {
    return Object.fromEntries(catalog.map(({ id, prices }) => {
      const value = source?.[id];
      return [id, Number.isInteger(value) ? Math.min(prices.length, Math.max(0, value)) : 0];
    }));
  }
  function restore(saved, legacy = false) {
    const ships = Object.fromEntries(Object.entries(shipParts).map(([id, catalog]) => {
      // The three original parts were fleet-wide. Every airframe inherits those paid ranks.
      const shared = legacy ? { cannon: saved?.ranks?.cannon, shield: saved?.ranks?.shield, missiles: saved?.ranks?.missiles } : null;
      return [id, ranksFor(catalog, shared || saved?.ships?.[id])];
    }));
    return { version: 2, credits: Number.isSafeInteger(saved?.credits) && saved.credits >= 0 ? saved.credits : 0,
      ships, fleet: ranksFor(fleetParts, saved?.fleet) };
  }
  let career = restore(null);
  let sessionOnly = false;

  function read() {
    if (!sessionOnly) {
      try {
        const current = localStorage.getItem(key);
        career = current === null ? restore(JSON.parse(localStorage.getItem(legacyKey)), true) : restore(JSON.parse(current));
      } catch { /* Keep the in-memory career if storage is unavailable. */ }
    }
    return career;
  }
  function save(profile) {
    career = profile;
    try {
      localStorage.setItem(key, JSON.stringify(profile));
    } catch {
      sessionOnly = true;
    }
  }
  function transact(change) {
    // Serialize purchases and payouts when two tabs share a browser profile.
    if (navigator.locks) return navigator.locks.request(key, () => change(read()));
    return Promise.resolve(change(read()));
  }
  function purchase(scope, id) {
    return transact(profile => {
      const fleet = scope === "fleet";
      const part = (fleet ? fleetParts : partsFor(scope)).find(item => item.id === id);
      if (!part) return false;
      const ranks = fleet ? profile.fleet : profile.ships[scope];
      const rank = ranks[id];
      const cost = part.prices[rank];
      if (cost === undefined || cost > profile.credits) return false;
      const upgraded = { ...ranks, [id]: rank + 1 };
      const installation = fleet ? { fleet: upgraded } : { ships: { ...profile.ships, [scope]: upgraded } };
      save({ ...profile, ...installation, credits: profile.credits - cost });
      return true;
    });
  }
  function statement(game) {
    const flight = Math.max(1, Math.floor(game.elapsed / 10));
    const combat = game.kills * 3;
    const missions = game.completedWaves * 12;
    const bonus = game.completedWaves >= game.waveCount ? 300 : 0;
    return { flight, combat, missions, bonus, total: flight + combat + missions + bonus };
  }
  function deposit(game, bill) {
    const ledger = game.creditLedger;
    return transact(profile => {
      const due = Math.max(0, bill.total - ledger.paid);
      if (due) {
        save({ ...profile, credits: profile.credits + due });
        ledger.paid += due;
      }
    });
  }
  return { read, purchase, deposit, statement, partsFor, fleetParts, get sessionOnly() { return sessionOnly; } };
})();
