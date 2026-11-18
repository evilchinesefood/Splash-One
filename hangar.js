/* The career balance and installed parts share one save so spending and installation stay together. */
window.PatrolHangar = (() => {
  const key = "patrol.career.v1";
  const prices = [40, 95, 175];
  const parts = [
    { id: "cannon", name: "Cannon feed", detail: "+2 damage per cannon round per rank." },
    { id: "shield", name: "Shield generator", detail: "+2 shield points per second while recharging per rank." },
    { id: "missiles", name: "Rail loader", detail: "Missiles reload 0.25 seconds faster per rank." },
  ];
  const emptyCareer = () => ({ credits: 0, ranks: { cannon: 0, shield: 0, missiles: 0 } });
  let career = emptyCareer();
  let sessionOnly = false;

  function read() {
    if (!sessionOnly) {
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (saved === null) career = emptyCareer();
        else if (Number.isSafeInteger(saved.credits) && saved.credits >= 0) {
          const ranks = {};
          for (const { id } of parts) {
            const rank = saved.ranks?.[id];
            ranks[id] = Number.isInteger(rank) ? Math.max(0, Math.min(prices.length, rank)) : 0;
          }
          career = { credits: saved.credits, ranks };
        }
      } catch { /* A missing or unreadable save leaves the current career available. */ }
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
  function purchase(id) {
    return transact(profile => {
      const rank = profile.ranks[id];
      const price = prices[rank];
      if (!parts.some(part => part.id === id) || price === undefined || price > profile.credits) return false;
      save({ credits: profile.credits - price, ranks: { ...profile.ranks, [id]: rank + 1 } });
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
  return { read, purchase, deposit, statement, parts, prices, get sessionOnly() { return sessionOnly; } };
})();
