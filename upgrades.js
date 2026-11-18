/* Hand-plotted equipment sprites. Each cell is a pixel in the illustration. */
window.PatrolUpgrades = (() => {
  const gear = {
    wisps: {
      color: "#ffc96b", shade: "#906241",
      sprite: [
        "          ww             ",
        "          wc        cc   ",
        "       bbhwwhb    bbwcb  ",
        "     bbmhhcwhmb   bhchb  ",
        "  bbbmhhccwwccmbb bssb   ",
        " bshhhccccwwcccchhb      ",
        "bmhhhmmmccwwccmmmhhb     ",
        " bssbbbbhwwwwhbbbbbb     ",
        "  bb   bshhhhsb          ",
        "       bmmccmmb          ",
        "      bmsbwwbsmb         ",
        "     bsbb c c bsb        ",
        "     bb   c c   b        ",
        "          x x            ",
      ],
    },
    link: {
      color: "#8ee6da", shade: "#426e79",
      sprite: [
        "      ccchhhccc      ",
        "    cchmmsssmmhcc    ",
        "   chmbb     bbmhc   ",
        "  chmb    c    bmhc  ",
        " chmb     h     bmhc ",
        " chb      h      bhc ",
        "chmb    bbb      bmhc",
        "chb   bbwhwb      bhc",
        "hcccchmwwwwwmhccccch",
        "chb   bbwhwb      bhc",
        "chmb     bbb     bmhc",
        " chb      h      bhc ",
        " chmb     h     bmhc ",
        "  chmb    c    bmhc  ",
        "   chmbb     bbmhc   ",
        "    cchmmsssmmhcc    ",
        "      ccchhhccc      ",
      ],
    },
    cannon: {
      color: "#ff9e76", shade: "#a35851",
      sprite: [
        "                   cw  ",
        "                bbwwcx ",
        "               bmhwwcx ",
        "             bbhhhbc   ",
        "           bbhhmmmb    ",
        "          bhhmmmbb     ",
        "        bbmhsmmb       ",
        "       bhhcchbb        ",
        "     bbhmschsb         ",
        "    bhhmmmsbb          ",
        "   bhmmsscsb           ",
        "  bhhhmmmsb            ",
        " bhhccmmbb             ",
        "bhmmcssb               ",
        "bmmmsbb                ",
        " bssbb                 ",
        "  bb                   ",
      ],
    },
    missiles: {
      color: "#ffb07d", shade: "#9b5c5a",
      sprite: [
        "            b      b ",
        "           bhb    bhb",
        "           bwhb   bwhb",
        "          bwhhb  bwhhb",
        "         bhccmb bhccmb",
        "        bmhcmmbbmhcmmb",
        "       bchhmmbbchhmmb ",
        "      bschmmbbschmmb  ",
        "      bshmmb bshmmb   ",
        "     bbmmmb bbmmmb    ",
        "    bmmmsb bmmmsb     ",
        "   bhhmcsbbhhmcsb     ",
        "   bhbcwbbbhbcwbb     ",
        "     xwc    xwc       ",
        "    xcx    xcx        ",
        "   xx     xx          ",
      ],
    },
    shield: {
      color: "#8cdcca", shade: "#45868a",
      sprite: [
        "        bbbbb        ",
        "    bbbbhhhhcbbbb    ",
        " bbbhhwwwcccccchhbbb ",
        "bhhwwcccmmmmmmmccchhb",
        "bhwccmmsbbbbbsmmcchcb",
        "bhwcmmsb     bsmmchcb",
        "bhwcmmsb  w  bsmmchcb",
        " bhwcmsb www bsmmchb ",
        " bhwcmsb  w  bsmmchb ",
        "  bhwcmsb   bsmmchb  ",
        "  bhwwcmsbbbsmmcchb  ",
        "   bhwwcmmsmmcchhb   ",
        "    bhwwcmmmcchhb    ",
        "     bhwwcccchhb     ",
        "       bhwwchb       ",
        "         bhb         ",
      ],
    },
    tail: {
      color: "#f6accc", shade: "#9f5c83",
      sprite: [
        "                x x",
        "              xwcw",
        "             bwhb",
        "            bhcmb",
        "          bbhcmb",
        "         bhhcmmb",
        "      bbbhhhmsb",
        "     bhwcccwmb",
        "    bhcmsscmmb",
        "    bhcmsscmmb",
        "     bmmccmmb",
        "    bbhhhhmmmbb",
        "   bhhmmmmmmmmsb",
        "  bbbbbbbbbbbbbbb",
      ],
    },
    guard: {
      color: "#8dccff", shade: "#49779f",
      sprite: [
        "         bwwb",
        "  bbbb  bhcchb",
        " bhhcmb  bwwb  xxxx",
        " bccmmb     xxx    x",
        "  bbb     xx       x",
        "         xx  bbw   x",
        "        xx  bwhhb x",
        "       xx  bhccmhb",
        "      xx    bmmmb",
        "     xx   xx bbb",
        "    xx xxx       bbbb",
        "   xxxx         bhhcmb",
        "   xx     bbw   bccmmb",
        "         bwhhb   bbbb",
        "          bbb",
      ],
    },
    siphon: {
      color: "#b3ed7b", shade: "#688456",
      sprite: [
        "         bbbbbb",
        "         bhhhmb",
        "        bbmmmm bb",
        "       bhhmmmmsmb",
        "      bhwccwwccmsb",
        "      bhwsbccsbmsb",
        "   x  bhwsbccsbmsb",
        "  xcx bhwsbccsbmsb",
        " cwwcccccchccsbmsb",
        "  xcx bhwccwcchmsb",
        "   x  bhwccwcchmsb",
        "      bhwccwwccmsb",
        "       bmmmmmmssb",
        "        bbmmmsbb",
        "         bbbbb",
      ],
    },
    salvo: {
      color: "#f6c47b", shade: "#a97a52",
      sprite: [
        "          c",
        "         bwb",
        "         bcb",
        "  c      bhb      c",
        "  bwb    bhb    bwb",
        "   bcb   bmb   bcb",
        "    bhb  bsb  bhb",
        "     bmb  x  bmb",
        "      bsb c bsb",
        "       xc w cx",
        "        xcwx",
        "         cw",
        "        bwwb",
        "        bhmb",
        "       bchmsb",
        "      bccmmsmb",
        "         xx",
      ],
    },
    comet: {
      color: "#ffa267", shade: "#a5625b",
      sprite: [
        "               bbbbb     ",
        "            bbbhhwwhb    ",
        "          bbhhmmmhwwhb   ",
        "         bhhcccmmmhwhb   ",
        "       bbhmmsccmmssmb    ",
        "      bhmmsbbhmmsssb     ",
        "    bbhmmsbwhhmssbb      ",
        "   bhmmsbwhcmsbb         ",
        "   bhmsbwwccbb           ",
        "    bbbwwwcxb            ",
        "    xcwwwcx              ",
        "   xcwwcx                ",
        "  xcwccc  cx             ",
        " xcxcx                   ",
        "xx      x                ",
      ],
    },
    arc: {
      color: "#d9a6ff", shade: "#806697",
      sprite: [
        "               bwwb    ",
        "              bwchb    ",
        "  bbb        bwchb     ",
        " bhwhb      bwchb      ",
        " bhcwhb    bwchb       ",
        "  bbchb   bwchb        ",
        "    bchbbbbwchb        ",
        "     bwwwwwccchhhhb    ",
        "      bbbbbbwwwwcb     ",
        "          bwwwcbb      ",
        "         bwwcbb        ",
        "        bwwchbb        ",
        "       bwcbbbchb       ",
        "      bwcb   bchwbb    ",
        "     bwcb     bwhwhb   ",
        "     bcb       bwhb    ",
        "     bb         bb     ",
      ],
    },
    service: {
      color: "#bbd3ae", shade: "#657960",
      sprite: [
        "      hhhmm      ",
        "    bhhhhmmbb    ",
        "    bhhb   bmb   ",
        "    bhb    bmb   ",
        "  bbhhbbbbbmmbb  ",
        " bhhhwwwwhhhhmmb ",
        " bhwmmmmmccmmmsb ",
        " bhmmsbbwwbbsmsb ",
        " bhmsbbbwwbbbsmb ",
        " bhmsbwwwwwwbsmb ",
        " bhmsbbbwwbbbsmb ",
        " bhmmsbbwwbbsmsb ",
        " bmhmmmssssmmmsb ",
        " bmmhhhhhhmmmmsb ",
        "  bbbbbbbbbbbbb  ",
      ],
    },
  };

  function illustration(style) {
    const canvas = document.createElement("canvas");
    canvas.width = 112;
    canvas.height = 48;
    canvas.setAttribute("aria-hidden", "true");
    const c = canvas.getContext("2d");
    const palette = {
      b: "#241f30", s: "#4a465b", m: "#8a91a4", h: "#c8d3cd",
      w: "#fff6d9", c: style.color, x: style.shade,
    };
    const width = Math.max(...style.sprite.map(row => row.trimEnd().length));
    const x = Math.floor((canvas.width - width * 2) / 2);
    const y = Math.floor((canvas.height - style.sprite.length * 2) / 2);
    // A sparse instrument grid leaves the equipment silhouette easy to read.
    c.fillStyle = style.color;
    c.globalAlpha = .22;
    for (let j = 4; j < 48; j += 8)
      for (let i = 4; i < 112; i += 8) c.fillRect(i, j, 1, 1);
    c.globalAlpha = 1;
    style.sprite.forEach((row, j) => {
      [...row].forEach((pixel, i) => {
        if (palette[pixel]) {
          c.fillStyle = palette[pixel];
          c.fillRect(x + i * 2, y + j * 2, 2, 2);
        }
      });
    });
    return canvas;
  }

  function celebrate(panel) {
    panel.querySelector(".draft-sparks")?.remove();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const burst = document.createElement("div");
    burst.className = "draft-sparks";
    burst.setAttribute("aria-hidden", "true");
    // Two salutes flare beside the headline, clear of the selectable cards.
    for (const origin of [19, 81]) {
      for (let i = 0; i < 10; i++) {
        const angle = (i - 4.5) * .30 - Math.PI / 2;
        const distance = 23 + (i % 3) * 9;
        const spark = document.createElement("i");
        spark.style.left = origin + "%";
        spark.style.setProperty("--dx", Math.round(distance * Math.cos(angle)) + "px");
        spark.style.setProperty("--dy", Math.round(distance * Math.sin(angle)) + "px");
        spark.style.background = ["#ffda91", "#ef9673", "#a1e4d6"][i % 3];
        burst.append(spark);
      }
    }
    panel.append(burst);
    setTimeout(() => burst.remove(), 1000);
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  }

  function show(actions, choices, choose) {
    actions.replaceChildren();
    actions.style.setProperty("--choice-count", choices.length);
    let committed = false;
    for (const [index, item] of choices.entries()) {
      const style = gear[item.id] || gear.service;
      const card = element("button", "upgrade-card", "");
      card.type = "button";
      card.style.setProperty("--gear-color", style.color);
      card.style.setProperty("--slot", index);
      const change = item.id === "service" ? "Resupply"
        : item.level === 1 ? "New · Level 1" : "Level " + (item.level - 1) + " → " + item.level;
      const art = element("span", "gear-art", "");
      art.append(illustration(style));
      card.append(art, element("span", "gear-level", change), element("strong", "gear-name", item.name),
        element("span", "gear-detail", item.description));
      card.onclick = () => {
        if (committed) return;
        committed = true;
        card.classList.add("installed");
        for (const other of actions.children) other.setAttribute("aria-disabled", "true");
        // Keep the confirmation visible for a beat before the flight view returns.
        const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 150;
        setTimeout(() => { if (actions.contains(card)) choose(item.id); }, delay);
      };
      card.onkeydown = event => {
        const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        if (!step || committed) return;
        event.preventDefault();
        const target = actions.children[(index + step + choices.length) % choices.length];
        target.focus();
      };
      actions.append(card);
    }
    celebrate(actions.parentElement);
  }

  function icon(id) {
    return illustration(gear[id] || gear.service);
  }

  return { show, icon };
})();
