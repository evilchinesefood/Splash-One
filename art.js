/* Pixel aircraft, projected effects, and flight instruments. World distances use the simulation's units. */
(() => {
  "use strict";
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const saturate = (v) => clamp(v, 0, 1);
  const dark = "#25243b",
    amber = "#ffd288",
    ice = "#91f4df";
  const slate = ["#394055", "#536073", "#738797", "#9babb0"];
  const steel = ["#4e5264", "#73828e", "#aab6b4", "#d0d8c8"];
  const gold = ["#63444d", "#985e4d", "#e0a05e", "#ffe4a3"];
  const red = ["#64394c", "#a84749", "#e75a46", "#ff9d66"];
  const enemyMetal = ["#42384f", "#605369", "#9a8085", "#d0ab9e"];
  const night = ["#25293e", "#39415a", "#576578", "#8291a1"];

  const glyphs = {
    0: "75757",
    1: "26227",
    2: "71747",
    3: "71717",
    4: "55711",
    5: "74717",
    6: "74757",
    7: "71111",
    8: "75757",
    9: "75717",
    A: "25755",
    B: "65656",
    C: "74447",
    D: "65556",
    E: "74647",
    F: "74644",
    G: "74557",
    H: "55755",
    I: "72227",
    J: "11157",
    K: "55655",
    L: "44447",
    M: "57755",
    N: "57555",
    O: "75557",
    P: "65744",
    Q: "75573",
    R: "65755",
    S: "74717",
    T: "72222",
    U: "55557",
    V: "55552",
    W: "55775",
    X: "55255",
    Y: "55222",
    Z: "71247",
    "-": "00700",
    "+": "02720",
    ".": "00002",
    ":": "02020",
    "/": "11244",
    " ": "00000",
  };
  function label(ctx, s, x, y, color, align = "left") {
    s = String(s).toUpperCase();
    x = Math.round(x - (align === "center" ? (s.length * 4 - 1) / 2 : align === "right" ? s.length * 4 - 1 : 0));
    y = Math.round(y);
    ctx.fillStyle = color;
    for (const c of s) {
      const rows = glyphs[c] || glyphs[" "];
      for (let j = 0; j < 5; j++) {
        const n = +rows[j];
        for (let i = 0; i < 3; i++) if (n & (4 >> i)) ctx.fillRect(x + i, y + j, 1, 1);
      }
      x += 4;
    }
  }

  // Five-by-seven cockpit type. A slashed zero, open four and wider letterforms
  // distinguish rapidly changing readings. Prepaint each ink once for the HUD.
  const cockpitGlyphs = {
    "0": [14,17,19,21,25,17,14], "1": [4,12,4,4,4,4,14], "2": [14,17,1,2,4,8,31],
    "3": [30,1,1,14,1,1,30], "4": [2,6,10,18,31,2,2], "5": [31,16,16,30,1,1,30],
    "6": [6,8,16,30,17,17,14], "7": [31,1,2,4,8,8,8], "8": [14,17,17,14,17,17,14],
    "9": [14,17,17,15,1,2,12], A: [14,17,17,31,17,17,17], B: [30,17,17,30,17,17,30],
    C: [14,17,16,16,16,17,14], D: [30,17,17,17,17,17,30], E: [31,16,16,30,16,16,31],
    F: [31,16,16,30,16,16,16], G: [14,17,16,23,17,17,14], H: [17,17,17,31,17,17,17],
    I: [14,4,4,4,4,4,14], J: [7,2,2,2,2,18,12], K: [17,18,20,24,20,18,17],
    L: [16,16,16,16,16,16,31], M: [17,27,21,21,17,17,17], N: [17,25,25,21,19,19,17],
    O: [14,17,17,17,17,17,14], P: [30,17,17,30,16,16,16], Q: [14,17,17,17,21,18,13],
    R: [30,17,17,30,20,18,17], S: [15,16,16,14,1,1,30], T: [31,4,4,4,4,4,4],
    U: [17,17,17,17,17,17,14], V: [17,17,17,17,17,10,4], W: [17,17,17,21,21,27,17],
    X: [17,17,10,4,10,17,17], Y: [17,17,10,4,4,4,4], Z: [31,1,2,4,8,16,31],
    ".": [0,0,0,0,0,0,4], ":": [0,0,4,0,0,4,0], "-": [0,0,0,14,0,0,0],
  };
  const cockpitInks = new Map();
  const typeWidth = (text, scale = 1) => (String(text).length * 6 - 1) * scale;
  function cockpitType(ctx, text, x, y, color, align = "center", scale = 1) {
    let sheet = cockpitInks.get(color);
    if (!sheet) {
      sheet = document.createElement("canvas");
      sheet.width = 6 * 96;
      sheet.height = 7;
      const ink = sheet.getContext("2d");
      ink.fillStyle = color;
      for (const [character, rows] of Object.entries(cockpitGlyphs)) {
        const left = (character.charCodeAt(0) - 32) * 6;
        rows.forEach((bits, row) => {
          for (let col = 0; col < 5; col++)
            if (bits & (16 >> col)) ink.fillRect(left + col, row, 1, 1);
        });
      }
      cockpitInks.set(color, sheet);
    }
    text = String(text);
    const width = typeWidth(text, scale);
    x = Math.round(x - (align === "right" ? width : align === "center" ? width / 2 : 0));
    y = Math.round(y);
    for (const character of text) {
      ctx.drawImage(sheet, (character.charCodeAt(0) - 32) * 6, 0, 5, 7, x, y, 5 * scale, 7 * scale);
      x += 6 * scale;
    }
  }

  function cockpitPlate(ctx, text, x, y, color, backing = "#1d3938") {
    const width = typeWidth(text);
    ctx.fillStyle = backing;
    ctx.fillRect(Math.round(x - width / 2) - 2, Math.round(y) - 1, width + 4, 9);
    cockpitType(ctx, text, x, y, color);
  }

  function line(ctx, x0, y0, x1, y1, color, width = 1) {
    if (![x0, y0, x1, y1].every(Number.isFinite)) return;
    // Clip before rasterizing so a near-plane crossing cannot create a long pixel loop.
    const w = ctx.canvas.width + 3,
      h = ctx.canvas.height + 3;
    let lo = 0,
      hi = 1,
      vx = x1 - x0,
      vy = y1 - y0;
    for (const [p, q] of [
      [-vx, x0 + 3],
      [vx, w - x0],
      [-vy, y0 + 3],
      [vy, h - y0],
    ]) {
      if (!p) {
        if (q < 0) return;
        continue;
      }
      const u = q / p;
      if (p < 0) lo = Math.max(lo, u);
      else hi = Math.min(hi, u);
      if (lo > hi) return;
    }
    x1 = Math.round(x0 + hi * vx);
    y1 = Math.round(y0 + hi * vy);
    x0 = Math.round(x0 + lo * vx);
    y0 = Math.round(y0 + lo * vy);
    const dx = Math.abs(x1 - x0),
      sx = x0 < x1 ? 1 : -1,
      dy = -Math.abs(y1 - y0),
      sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    ctx.fillStyle = color;
    while (true) {
      ctx.fillRect(x0, y0, width, width);
      if (x0 === x1 && y0 === y1) break;
      const ee = 2 * e;
      if (ee >= dy) {
        e += dy;
        x0 += sx;
      }
      if (ee <= dx) {
        e += dx;
        y0 += sy;
      }
    }
  }

  function polygon(ctx, points, color) {
    ctx.beginPath();
    ctx.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
    for (let i = 1; i < points.length; i++) ctx.lineTo(Math.round(points[i][0]), Math.round(points[i][1]));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  function disc(ctx, x, y, r, color) {
    r = Math.max(0, Math.round(r));
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy++) {
      const a = Math.floor(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(x - a, y + dy, 2 * a + 1, 1);
    }
  }
  function basis(e) {
    const y = e.yaw || 0,
      p = e.pitch || 0,
      b = (e.bank || 0) + (e.roll || 0);
    const sy = Math.sin(y),
      cy = Math.cos(y),
      sp = Math.sin(p),
      cp = Math.cos(p),
      sb = Math.sin(b),
      cb = Math.cos(b);
    return {
      r: [cy * cb + sy * sp * sb, -cp * sb, -sy * cb + cy * sp * sb],
      u: [cy * sb - sy * sp * cb, cp * cb, -sy * sb - cy * sp * cb],
      f: [sy * cp, sp, cy * cp],
    };
  }
  function transform(e, b, v) {
    const [x, y, z] = v;
    return [
      e.x + x * b.r[0] + y * b.u[0] + z * b.f[0],
      e.y + x * b.r[1] + y * b.u[1] + z * b.f[1],
      e.z + x * b.r[2] + y * b.u[2] + z * b.f[2],
    ];
  }

  // Lofted fuselages, nacelles and canopy share the same cross-section profile.
  function surface(mesh, points, c, flags = "") {
    mesh.push({ points, c, flags });
  }
  function loft(mesh, sections, palette, flags = "") {
    const rings = sections.map(([z, x, y, w, h]) => [
      [x, y + h, z],
      [x + w * 0.79, y + h * 0.68, z],
      [x + w, y, z],
      [x + w * 0.6, y - h * 0.85, z],
      [x - w * 0.6, y - h * 0.85, z],
      [x - w, y, z],
      [x - w * 0.79, y + h * 0.68, z],
    ]);
    for (let k = 1; k < rings.length; k++) {
      for (let i = 0; i < 7; i++) {
        const j = (i + 1) % 7;
        surface(
          mesh,
          [rings[k - 1][i], rings[k][i], rings[k][j], rings[k - 1][j]],
          palette[[3, 2, 1, 0, 0, 1, 2][i]],
          flags,
        );
      }
    }
    surface(mesh, rings[0], palette[0], flags);
    surface(mesh, rings[rings.length - 1], palette[1], flags);
  }
  const jetNozzle = { x: 1.48, y: -0.13, z: -9.5, width: 0.74, height: 0.66 };
  const carrierNozzle = { x: 21, y: -0.8, z: -45, width: 5, height: 4 };
  const azure = ["#294465", "#35698b", "#62b2cd", "#c3f5ef"];
  function buildJet(body = steel, trim = slate, tip = red[2]) {
    const mesh = [];
    loft(
      mesh,
      [
        [-8.2, 0, 0.02, 1.66, 0.68],
        [-4, 0, 0.18, 1.96, 0.98],
        [2, 0, 0.25, 1.54, 1],
        [6.9, 0, 0.16, 0.91, 0.64],
      ],
      body,
    );
    loft(
      mesh,
      [
        [6.9, 0, 0.16, 0.92, 0.66],
        [11.9, 0, 0.15, 0.06, 0.06],
      ],
      night,
    );
    loft(
      mesh,
      [
        [1.25, 0, 1, 1.1, 0.12],
        [2.7, 0, 1.1, 1.12, 1.03],
        [4.6, 0, 1.04, 0.8, 0.79],
        [6.45, 0, 0.72, 0.43, 0.1],
      ],
      gold,
    );
    for (const s of [-1, 1]) {
      const at = (x, y, z) => [s * x, y, z];
      // Delta wing with raised root, splinter field, wingtip flash, and a small squadron stripe.
      surface(
        mesh,
        [at(1.23, 0.22, 5.3), at(8.94, -0.27, -3.53), at(8.48, -0.34, -5.03), at(2, -0.02, -5.57)],
        body[2],
      );
      surface(mesh, [at(1.23, 0.23, 5.3), at(4.25, 0.02, 0.6), at(3, 0.18, -3.3), at(1.8, 0.25, -0.95)], trim[2]);
      surface(
        mesh,
        [
          at(4.25, 0.04, 0.6),
          at(6.86, -0.15, -1.76),
          at(5.23, -0.077, -2.32),
          at(6.72, -0.17, -4.79),
          at(3.0, 0.13, -3.3),
        ],
        trim[1],
      );
      surface(
        mesh,
        [at(8.0, -0.2, -2.48), at(8.94, -0.27, -3.53), at(8.49, -0.34, -5.03), at(7.76, -0.23, -5.07)],
        tip,
      );
      surface(
        mesh,
        [at(6.55, -0.13, -3.1), at(7.37, -0.16, -3.49), at(7.33, -0.16, -3.83), at(6.42, -0.13, -3.43)],
        body[3],
      );
      surface(
        mesh,
        [at(1.61, 0.15, -4.6), at(4.9, -0.12, -7.45), at(5.15, -0.12, -9.35), at(1.44, 0.18, -8.4)],
        trim[2],
      );
      surface(
        mesh,
        [at(2.3, 0.17, -6.28), at(4.9, -0.105, -7.45), at(5.15, -0.105, -9.35), at(3.72, 0.04, -8.94)],
        body[2],
      );
      // Twin square intake shoulders taper into faceted engine housings and separate nozzles.
      loft(
        mesh,
        [
          [-8.85, s * 1.47, -0.13, 0.84, 0.76],
          [-6.3, s * 1.46, -0.08, 1.04, 1.03],
          [-1, s * 1.37, 0.04, 1.05, 0.84],
          [3.57, s * 1.23, 0.02, 0.64, 0.53],
        ],
        trim,
      );
      loft(
        mesh,
        [
          [jetNozzle.z, s * jetNozzle.x, jetNozzle.y, jetNozzle.width, jetNozzle.height],
          [-8.68, s * 1.47, -0.13, 0.85, 0.77],
        ],
        night,
      );
      surface(mesh, [at(0.83, 0.63, 3.55), at(1.74, 0.5, 3.44), at(2.07, 0.32, 1.9), at(1.0, 0.86, 1.1)], body[2]);
      // Tall canted twin fins make the rear silhouette readable against the terrain.
      surface(
        mesh,
        [at(1.6, 0.73, -3.65), at(2.76, 3.98, -6.85), at(2.98, 4.02, -8.54), at(2.05, 0.68, -8.22)],
        trim[s > 0 ? 2 : 1],
      );
      surface(
        mesh,
        [at(2.6, 3.4, -6.26), at(2.76, 3.98, -6.85), at(2.98, 4.02, -8.54), at(2.84, 3.39, -8.48)],
        tip,
      );
      surface(
        mesh,
        [at(2.3, 2.52, -6.55), at(2.64, 2.63, -7.97), at(2.62, 2.36, -7.96), at(2.2, 2.25, -6.4)],
        body[3],
      );
      // Two visible wing stores per side disappear from their rails as missiles fire.
      for (let j = 0; j < 2; j++) {
        const x = s * (j ? 6.25 : 4.1),
          z = j ? -1.72 : -0.3,
          flag = "rail" + (s < 0 ? j : 3 - j);
        loft(
          mesh,
          [
            [z - 2, x, -0.65, 0.18, 0.19],
            [z + 1, x, -0.66, 0.24, 0.24],
            [z + 1.8, x, -0.64, 0.01, 0.01],
          ],
          steel,
          flag,
        );
        surface(
          mesh,
          [
            [x - 0.53, -0.64, z - 1.77],
            [x, -0.64, z - 0.62],
            [x + 0.54, -0.64, z - 1.77],
          ],
          night[2],
          flag,
        );
      }
    }
    return mesh;
  }
  const jetMesh = buildJet(),
    rivalMesh = buildJet(enemyMetal, red),
    friendlyMesh = buildJet(steel, azure, azure[3]);
  const ivory = ["#596473", "#909da6", "#c3cdcb", "#eeeee0"];
  const copper = ["#57404c", "#945149", "#d7784d", "#ffbd79"];
  const ionGlass = ["#234553", "#33768b", "#50b9c0", "#aff6de"];
  const wingStores = jetMesh.filter(face => face.flags.startsWith("rail"));
  const needleNozzle = { x: 0, y: 0, z: -10, width: 1.17, height: 0.95 };
  const mantaNozzle = { x: 4.3, y: 0.25, z: -8.5, width: 1.15, height: 0.73 };

  function buildNeedle() {
    const mesh = [];
    loft(mesh, [[-10,0,0,1.25,1],[-4,0,0,1.7,1.25],[5,0,0,1.12,.9],
      [10,0,0,.58,.4],[14,0,.1,.08,.12]], ivory);
    loft(mesh, [[.7,0,.8,.7,.12],[2.1,0,1,.95,.94],[5,0,.91,.65,.56],[7,0,.65,.17,.08]], ionGlass);
    for (const side of [-1, 1]) {
      const v = (x,y,z) => [side*x,y,z];
      surface(mesh, [v(.85,0,4),v(6.8,-.15,-6.4),v(6.1,-.1,-8),v(1.1,.05,-5.2)], ivory[2]);
      surface(mesh, [v(1.7,.12,1.4),v(6.45,0,-6.4),v(5.55,.08,-6.9),v(1.15,.15,-2)], ionGlass[2]);
      surface(mesh, [v(.7,.15,8.2),v(3,.38,5.4),v(2.6,.2,4.9),v(.9,.17,6)], ivory[3]);
      surface(mesh, [v(.6,.18,-4.6),v(2.55,.7,-9.1),v(1.45,.62,-9.8),v(.55,.33,-8.5)], ionGlass[2]);
    }
    surface(mesh, [[0,.9,-2.7],[0,5.7,-8.5],[0,5.5,-9.4],[0,1.05,-8.6]], ivory[1]);
    surface(mesh, [[0,4.9,-7.55],[0,5.7,-8.5],[0,5.5,-9.4],[0,4.7,-9.15]], ionGlass[2]);
    // The interceptor's narrow swept wings carry their rails closer in and farther aft.
    const stores = wingStores.map(face => ({
      ...face, points: face.points.map(([x, y, z]) => [x * .72, y, z - 2.8]),
    }));
    return mesh.concat(stores);
  }

  function buildManta() {
    const mesh = [];
    loft(mesh,[[-7,0,0,2.65,1.03],[-2,0,.2,3.1,1.65],[3.5,0,.22,2,1.2],[8,0,0,.3,.28]], copper);
    loft(mesh,[[-1.1,0,1.45,1.2,.2],[1.2,0,1.68,1.55,.9],[4.65,0,1.2,.6,.22]], night);
    for (const side of [-1, 1]) {
      const v = (x,y,z) => [side*x,y,z];
      surface(mesh,[v(1,.65,6.3),v(13.5,-.1,-4.8),v(12.6,.04,-7.25),v(7.7,.2,-5.9),
        v(4.8,.25,-9.5),v(1.4,.6,-5.8)],copper[2]);
      surface(mesh,[v(1.7,.72,5.45),v(12.7,.05,-4.85),v(9.5,.24,-4.15),v(4.2,.6,.5)],copper[3]);
      surface(mesh,[v(6.2,.4,-2.3),v(12.3,.07,-5.1),v(12.5,.12,-6.4),v(7.9,.35,-4.3)],night[1]);
      loft(mesh,[[-8.5,side*4.3,.25,1.3,.9],[-4,side*4.3,.55,1.65,1.2],
        [1.8,side*4.3,.56,1.1,.75],[2.4,side*4.3,.55,.97,.62]],slate);
      surface(mesh,[v(4,.92,-3),v(6.25,3.2,-7.8),v(5.97,2.8,-9.5),v(4,1,-8)],copper[1]);
      surface(mesh,[v(5.7,2.7,-6.85),v(6.25,3.2,-7.8),v(5.97,2.8,-9.5),v(5.67,2.5,-8.1)],ivory[2]);
    }
    return mesh.concat(wingStores);
  }
  const playerModels = {
    kestrel: {mesh:jetMesh, nozzle:jetNozzle},
    needle: {mesh:buildNeedle(), nozzle:needleNozzle,
      shadow:[[0,14],[1,8],[3,5],[1.5,4],[6.8,-6.4],[6.1,-8],[1.5,-5.5],[2.5,-9.1],[0,-10],
        [-2.5,-9.1],[-1.5,-5.5],[-6.1,-8],[-6.8,-6.4],[-1.5,4],[-3,5],[-1,8]]},
    manta: {mesh:buildManta(), nozzle:mantaNozzle,
      shadow:[[0,8],[13.5,-4.8],[12.6,-7.25],[7.7,-5.9],[4.8,-9.5],[1.5,-7],[-1.5,-7],
        [-4.8,-9.5],[-7.7,-5.9],[-12.6,-7.25],[-13.5,-4.8]]},
  };
  function buildCrescent() {
    const mesh = [];
    for (const s of [-1, 1]) {
      const v = (x, y, z) => [s * x, y, z];
      surface(
        mesh,
        [
          v(0, 0.9, 2.5),
          v(3.1, 0.97, 2.1),
          v(6.5, 0.5, 0.6),
          v(9.5, -0.1, -4.8),
          v(6.2, 0.04, -2.6),
          v(2.7, 0.03, -1.1),
          v(0, 0.15, -2.5),
        ],
        night[2],
      );
      surface(
        mesh,
        [
          v(0, 0.9, 2.5),
          v(3.1, 0.97, 2.1),
          v(6.5, 0.5, 0.6),
          v(9.5, -0.1, -4.8),
          v(5.7, 0.65, -0.1),
          v(1.6, 1.11, 1.15),
        ],
        steel[2],
      );
      surface(mesh, [v(3.1, 0.88, 1.86), v(5.5, 0.6, 1.12), v(8.8, 0.1, -3.45), v(6.12, 0.5, -0.27)], "#e58a6c");
      surface(mesh, [v(0, 0.18, -2.55), v(2.85, 0.15, -1.16), v(4.2, 0.1, -1.64), v(0.2, 0.15, -3.1)], "#e65f96");
    }
    loft(
      mesh,
      [
        [-2.55, 0, 0.5, 0.7, 0.41],
        [0.5, 0, 0.67, 1.23, 0.87],
        [3.1, 0, 0.63, 0.09, 0.2],
      ],
      night,
    );
    loft(
      mesh,
      [
        [0.44, 0, 1.3, 0.31, 0.18],
        [1.5, 0, 1.13, 0.32, 0.19],
      ],
      gold,
    );
    return mesh;
  }
  function buildCarrier() {
    const m = [];
    loft(
      m,
      [
        [-47, 0, 0, 12, 4],
        [-26, 0, 1, 21, 7],
        [15, 0, 2, 17, 7],
        [47, 0, 1, 7, 3],
        [54, 0, 0, 0.6, 0.6],
      ],
      night,
    );
    for (const s of [-1, 1]) {
      const v = (x, y, z) => [s * x, y, z];
      surface(m, [v(10, 4, 31), v(39, 2, 7), v(54, 0, -26), v(40, 0, -36), v(12, 3, -24)], slate[2]);
      surface(m, [v(11, 4, 28), v(38, 2, 7), v(46, 1, -10), v(35, 2, -7), v(26, 3, 4)], steel[2]);
      surface(m, [v(13, 3, -8), v(34, 2, -7), v(45, 1, -22), v(37, 1, -27), v(15, 4, -17)], night[0]);
      for (let j = 0; j < 3; j++)
        surface(
          m,
          [
            v(19 + j * 6, 3, -14 - j),
            v(21 + j * 6, 3, -14 - j),
            v(24 + j * 6, 3, -19 - j),
            v(22 + j * 6, 3, -19 - j),
          ],
          "#ff9765",
        );
      loft(
        m,
        [
          [carrierNozzle.z, s * carrierNozzle.x, carrierNozzle.y, carrierNozzle.width, carrierNozzle.height],
          [-26, s * 21, 2, 6, 6],
          [7, s * 19, 2.5, 4.5, 4],
          [18, s * 17, 2, 0.3, 0.3],
        ],
        slate,
      );
      surface(m, [v(16, 6, -11), v(23, 17, -30), v(23, 17, -41), v(17, 5, -36)], steel[1]);
      surface(m, [v(21.5, 15, -27), v(23, 17, -30), v(23, 17, -41), v(22, 15, -41)], red[2]);
      surface(m, [v(2, 8, 1), v(7, 8, 4), v(5, 7, 29), v(2, 7, 31)], gold[2]);
    }
    return m;
  }
  const crescentMesh = buildCrescent(),
    carrierMesh = buildCarrier();
  function tower(kind) {
    const m = [],
      radar = kind === "radar",
      a = radar ? 7 : 4,
      h = radar ? 10 : 14;

    const corners = (w, y) => [
      [-w, y, -w],
      [w, y, -w],
      [w, y, w],
      [-w, y, w],
    ];
    let prev = corners(a + 2, 0);
    for (const [w, y] of [
      [a, 2],
      [a * 0.8, h * 0.42],
      [a * 0.47, h],
    ]) {
      const next = corners(w, y);
      for (let i = 0; i < 4; i++) surface(m, [prev[i], prev[(i + 1) % 4], next[(i + 1) % 4], next[i]], slate[i]);
      surface(m, next, steel[2]);
      prev = next;
    }
    if (radar) {
      for (let i = 0; i < 8; i++) {
        const face = (i) => [
          Math.cos((i * TAU) / 8) * 8,
          h + 4 + Math.sin((i * TAU) / 8) * 5,
          Math.sin((i * TAU) / 8) * 3,
        ];
        surface(m, [[0, h + 3, -3], face(i), face(i + 1)], steel[((i + 1) % 3) + 1]);
      }
    } else {
      surface(
        m,
        [
          [-0.65, h, 0],
          [0.1, h + 12, 0],
          [0.75, h, 0],
        ],
        steel[3],
      );
      surface(
        m,
        [
          [-1.8, h + 7, 0],
          [0, h + 9, 0],
          [1.8, h + 7, 0],
        ],
        red[3],
      );
    }
    return m;
  }
  function buildBroadwing() {
    const mesh = [];
    loft(mesh, [[-10,0,0,3,1.4],[-3,0,.4,4.2,2.2],[7,0,0,3,1.5],[13,0,-.3,.4,.5]], enemyMetal);
    loft(mesh, [[4,0,1.4,2,.4],[8,0,1.4,1.7,1],[10,0,1,1,.4]], gold);
    for (const sign of [-1,1]) {
      const v = (x,y,z) => [sign*x,y,z];
      surface(mesh,[v(2,1,7),v(19,.4,0),v(24,-.5,-7),v(9,-.4,-5),v(2,0,-9)],steel[2]);
      surface(mesh,[v(2,1,7),v(19,.4,0),v(17,.6,-2),v(2,1,3)],gold[2]);
      surface(mesh,[v(2,0,-9),v(9,-.4,-5),v(24,-.5,-7),v(13,-1,-8)],enemyMetal[1]);
      loft(mesh,[[-9,sign*8,-.3,1.6,1.1],[-1,sign*8,-.3,1.8,1.6],[4,sign*8,-.3,.5,.5]],night);
      surface(mesh,[v(2.3,1,-3),v(5.3,4.6,-10),v(5.7,3.6,-13),v(3,.6,-10)],red[1]);
    }
    return mesh;
  }
  function buildDart() {
    const mesh = [];
    loft(mesh,[[-7,0,0,1.5,1],[-2,0,.4,2,1.6],[6,0,.3,.8,1],[14,0,.2,.1,.1]],slate);
    for (const sign of [-1,1]) {
      const v = (x,y,z) => [sign*x,y,z];
      surface(mesh,[v(.7,.7,7),v(6.5,-.1,-8),v(4,.5,-5),v(1.8,.4,-3)],steel[2]);
      surface(mesh,[v(.8,.8,5),v(5.5,.2,-5),v(4,.6,-4),v(1.2,1,1)],"#5ed8c8");
      surface(mesh,[v(1,1,0),v(2.9,3.7,-6),v(2.9,2.4,-8),v(1,1,-5)],night[2]);
    }
    surface(mesh,[[-.72,1.5,1],[0,2.15,2],[.72,1.5,1],[0,1.1,6]],"#9aeace");
    return mesh;
  }
  function buildPrism() {
    const mesh = [];
    const lower = [[-8,0,-8],[8,0,-8],[8,0,8],[-8,0,8]];
    const gem = [[-6,24,0],[0,24,6],[6,24,0],[0,24,-6]];
    for (let i=0;i<4;i++) {
      const j=(i+1)%4;
      const shoulder = lower[i].map((v,k) => k===1?10:v*.65);
      const shoulderNext = lower[j].map((v,k) => k===1?10:v*.65);
      surface(mesh,[lower[i],lower[j],shoulderNext,shoulder],slate[i]);
      surface(mesh,[shoulder,shoulderNext,[0,17,0]],steel[i]);
      surface(mesh,[[0,14,0],gem[i],gem[j]],["#733b82","#a556ad","#643a84","#ac68c0"][i]);
      surface(mesh,[[0,35,0],gem[j],gem[i]],["#f5a8f4","#b589e6","#d184db","#965cc0"][i],"lamp");
    }
    return mesh;
  }
  function buildBoat(heavy) {
    const m = [], w = heavy ? 7.5 : 5, length = heavy ? 25 : 17;
    const deck = [[-w,1,-length*.88],[w,1,-length*.88],[w,1,length*.34],
      [0,2,length],[-w,1,length*.34]];
    const chine = deck.map(([x,y,z]) => [x*.78,-1.5,z*.94]);
    surface(m, deck, heavy ? "#697887" : "#85919a");
    for (let i = 0; i < deck.length; i++) {
      const j = (i+1) % deck.length;
      surface(m,[deck[i],deck[j],chine[j],chine[i]],i%2 ? "#3c4c63" : "#50627a");
    }
    function cabin(x, y, z, width, height, depth, palette) {
      const floor = [[x-width,y,z-depth],[x+width,y,z-depth],[x+width,y,z+depth],[x-width,y,z+depth]];
      const roof = floor.map(([vx,vy,vz]) => [x+(vx-x)*.84,vy+height,z+(vz-z)*.88]);
      for (let i=0;i<4;i++) {
        const j=(i+1)%4;
        surface(m,[floor[i],floor[j],roof[j],roof[i]],palette[i]);
      }
      surface(m,roof,palette[3]);
    }
    const bridge = heavy ? 5.6 : 3.7;
    cabin(0,1,-length*.16,w*.72,bridge,heavy?6.2:3.7,slate);
    cabin(0,bridge+1,-length*.16,w*.60,1.45,heavy?4.7:2.8,azure);
    cabin(0,bridge+2.45,-length*.16,w*.64,.48,heavy?4.9:2.95,steel);
    // Scarlet bow band and the raised wheelhouse distinguish hulls from aircraft at a glance.
    surface(m,[[-w*.88,1.12,length*.40],[w*.88,1.12,length*.40],[w*.67,1.42,length*.55],[-w*.67,1.42,length*.55]],red[2]);
    cabin(0,1.25,length*.32,w*.37,2.2,2.1,night);
    for (const x of heavy ? [-1.2,1.2] : [0]) {
      loft(m,[[length*.35,x,3,.46,.45],[length*.65,x,4.55,.32,.32]],steel);
    }
    if (heavy) cabin(0,1,-length*.62,2.8,2.2,3.4,red);
    const mastZ = -length*.28, mastTop = heavy ? 12 : 8;
    surface(m,[[-.46,bridge+2.5,mastZ],[.46,bridge+2.5,mastZ],[0,mastTop,mastZ]],steel[2]);
    surface(m,[[-1.1,mastTop-.7,mastZ],[1.1,mastTop-.7,mastZ],[0,mastTop+.48,mastZ]],"#ffb479","lamp");
    return m;
  }

  function boatWake(ctx, g, e, project) {
    const heavy = e.kind === "gunboat", stern = heavy ? 22 : 15;
    const dx = Math.sin(e.yaw), dz = Math.cos(e.yaw);
    const reach = Math.min(stern*2.6, e.age*e.speed);
    if (reach < 3) return;
    for (const side of [-1,1]) {
      let previous;
      for (let i=0;i<=4;i++) {
        const behind = stern + i*reach/4, width = side*(stern*.28 + i*reach*.065);
        const x = e.x - dx*behind + dz*width, z = e.z - dz*behind - dx*width;
        if (g.world.height(x,z) > 0) break;
        const pt = project(x,.45,z);
        if (previous && pt) line(ctx,previous.x,previous.y,pt.x,pt.y,i%2 ? "#c3e4db" : "#74b7b8");
        previous=pt;
      }
    }
  }
  const contactNames = { jet: "JET", interceptor: "INTERCEPTOR", crescent: "CRESCENT", carrier: "CARRIER",
    cutter: "CUTTER", gunboat: "GUNBOAT", bomber: "BROADWING", dart: "DART",
    prism: "PRISM", relay: "RELAY", radar: "RADAR" };
  const meshes = {
    cutter: buildBoat(false),
    gunboat: buildBoat(true),
    jet: rivalMesh,
    interceptor: rivalMesh,
    bomber: buildBroadwing(),
    dart: buildDart(),
    prism: buildPrism(),
    carrier: carrierMesh,
    crescent: crescentMesh,
    radar: tower("radar"),
    relay: tower("relay"),
  };

  const nightColors = new Map();
  function moonlit(color) {
    if (!nightColors.has(color)) {
      const value = parseInt(color.slice(1),16);
      const red = Math.round((value >> 16) * .56 + 9);
      const green = Math.round(((value >> 8) & 255) * .64 + 13);
      const blue = Math.min(255, Math.round((value & 255) * .81 + 26));
      nightColors.set(color, "rgb(" + [red,green,blue].join(",") + ")");
    }
    return nightColors.get(color);
  }
  function drawMesh(ctx, e, mesh, b, project, count, atNight) {
    const faces = [],
      cache = new Map();
    for (const face of mesh) {
      if (face.flags.startsWith("rail") && +face.flags.slice(4) >= count) continue;
      const pts = [];
      for (const v of face.points) {
        let p = cache.get(v);
        if (!p) {
          p = project(...transform(e, b, v));
          if (p) cache.set(v, p);
        }
        if (!p) break;
        pts.push(p);
      }
      if (pts.length === face.points.length)
        faces.push({ pts, c: face.c, glowing: face.flags === "exhaust" || face.flags === "lamp", depth: pts.reduce((s, p) => s + p.d, 0) / pts.length });
    }
    faces.sort((a, b) => b.depth - a.depth);
    const path = (pts) => {
      ctx.beginPath();
      ctx.moveTo(Math.round(pts[0].x), Math.round(pts[0].y));
      for (let j = 1; j < pts.length; j++) ctx.lineTo(Math.round(pts[j].x), Math.round(pts[j].y));
      ctx.closePath();
    };
    // One silhouette outline, keeping the interior facets bright and uncluttered.
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.7;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const { pts, glowing } of faces) {
      if (glowing) continue;
      ctx.moveTo(Math.round(pts[0].x), Math.round(pts[0].y));
      for (let j = 1; j < pts.length; j++) ctx.lineTo(Math.round(pts[j].x), Math.round(pts[j].y));
      ctx.closePath();
    }
    ctx.stroke();
    const flashing = e.kind && e.hitFlash > 0.15;
    for (const { pts, c, glowing } of faces) {
      path(pts);
      ctx.fillStyle = flashing && !glowing ? "#fff2bf" : atNight && !glowing ? moonlit(c) : c;
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  }

  const histories = new WeakMap();
  function trailState(g, b, e = g.player) {
    let s = histories.get(e);
    if (!s || g.time < s.t || Math.hypot(e.x - s.x, e.z - s.z) > 200) {
      s = { t: -1, x: e.x, z: e.z, samples: [] };
      histories.set(e, s);
    }
    if (g.time - s.t > 0.046) {
      const tip = e.frame?.tip ?? 8.65, z = e.frame?.tipZ ?? -4.2;
      s.samples.push({
        t: g.time,
        tip: [transform(e, b, [-tip, -0.23, z]), transform(e, b, [tip, -0.23, z])],
        x: e.x,
        z: e.z,
        water: e === g.player && e.y < 12 && g.world.height(e.x, e.z) < 0.1,
      });
      s.t = g.time;
      s.x = e.x;
      s.z = e.z;
    }
    while (s.samples.length && g.time - s.samples[0].t > 1.6) s.samples.shift();
    return s.samples;
  }
  function drawTrails(ctx, g, samples, project, aircraft = g.player) {
    let last = null;
    for (const sample of samples) {
      const age = g.time - sample.t;
      if (last) {
        const wake = last.water && sample.water;
        const strength = wake
          ? 1
          : 0.3 + 0.6 * Math.min(1, Math.abs(aircraft.bank || 0)) + (aircraft.boost ? 0.35 : 0);
        for (const [i, side] of [-1, 1].entries()) {
          const tip = sample.tip[i],
            prev = last.tip[i];
          const spread = 1 + age * (wake ? 0.35 : 0.04);
          const pos = project(
            sample.x + (tip[0] - sample.x) * spread,
            wake ? 0.5 : tip[1] + age * 0.55,
            sample.z + (tip[2] - sample.z) * spread,
          );
          const pre = project(
            last.x + (prev[0] - last.x) * spread,
            wake ? 0.5 : prev[1] + age * 0.55,
            last.z + (prev[2] - last.z) * spread,
          );
          if (pos && pre) {
            ctx.globalAlpha = saturate((1 - age / 1.55) * strength) * 0.75;
            line(ctx, pos.x, pos.y, pre.x, pre.y, wake ? "#c4f2db" : "#ede5ce");
          }
          if (wake && pos && age < 0.65) {
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = "#effae5";
            ctx.fillRect(Math.round(pos.x + side * (1 + age * 8)), Math.round(pos.y - age * 2), 2, 1);
          }
        }
      }
      last = sample;
    }
    ctx.globalAlpha = 1;
  }

  // Share the engine outlets with the mesh. Each band sorts in depth with the
  // nozzle lip, fins and fuselage, including when the jet rolls toward the camera.
  function exhaustMesh(nozzle, time, boost) {
    const faces = [];
    for (const side of nozzle.x === 0 ? [0] : [-1, 1]) {
      const flicker = 1 + 0.1 * Math.sin(time * 31 + side);
      const length = nozzle.width * (boost ? 9 : 2.4) * flicker;
      const x = side * nozzle.x;
      const ring = (distance, radius) => {
        const z = nozzle.z - 0.04 - distance * length;
        return [
          [x, nozzle.y + nozzle.height * radius, z],
          [x + nozzle.width * radius, nozzle.y, z],
          [x, nozzle.y - nozzle.height * radius, z],
          [x - nozzle.width * radius, nozzle.y, z],
        ];
      };
      const mouth = ring(0, 0.85);
      const bright = ring(0.27, boost ? 0.94 : 0.67);
      const taper = ring(0.68, 0.54);
      const tip = [x, nozzle.y, nozzle.z - length];
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        surface(faces, [mouth[i], mouth[j], bright[j], bright[i]], boost ? "#fff8cb" : "#ffd89b", "exhaust");
        surface(faces, [bright[i], bright[j], taper[j], taper[i]], i % 2 ? "#ffad5e" : "#ffd079", "exhaust");
        surface(faces, [taper[i], taper[j], tip], i % 2 ? "#f77855" : "#fc925f", "exhaust");
      }
    }
    return faces;
  }
  function shadow(ctx, g, b, project) {
    const e = g.player,
      h = g.world.height,
      top = g.world.cloudTop;
    let cx = e.x,
      cz = e.z,
      y = Math.max(0, h(cx, cz)),
      c = null;
    // A low sun casts the silhouette away from the horizon; refine once over sloping ground.
    for (let i = 0; i < 2; i++) {
      const lift = Math.max(0, e.y - y);
      cx = e.x - lift * 0.28;
      cz = e.z - lift * 0.66;
      c = top ? top(cx, cz, g.time) : null;
      y = Math.max(0, h(cx, cz), Number.isFinite(c) && c < e.y ? c : -Infinity);
    }
    const silhouette = playerModels[e.frame.id].shadow || [
      [0, 11.5],
      [2.2, 3.5],
      [8.9, -3.5],
      [8.45, -5.1],
      [2.3, -5.6],
      [5.2, -9.3],
      [1.9, -8.9],
      [-1.9, -8.9],
      [-5.2, -9.3],
      [-2.3, -5.6],
      [-8.45, -5.1],
      [-8.9, -3.5],
      [-2.2, 3.5],
    ];
    const pts = [];
    for (const [x, z] of silhouette) {
      const wx = cx + x * b.r[0] + z * b.f[0],
        wz = cz + x * b.r[2] + z * b.f[2];
      const sy = c !== null && y === c ? y : Math.max(0, h(wx, wz));
      const p = project(wx, sy + 0.5, wz);
      if (!p) return;
      pts.push([p.x, p.y]);
    }
    ctx.globalAlpha = 0.4;
    polygon(ctx, pts, "#343344");
    ctx.globalAlpha = 1;
  }
  function visible(g, cam, e) {
    const dx = e.x - cam.x,
      dy = e.y - cam.y,
      dz = e.z - cam.z;
    for (let i = 1; i <= 7; i++) {
      const t = i / 8;
      if (g.world.height(cam.x + dx * t, cam.z + dz * t) > cam.y + dy * t + 4) return false;
    }
    return true;
  }
  function nightLights(ctx, e, b, project, time) {
    const tip = e.frame ? [e.frame.tip, -.2, e.frame.tipZ] : e.kind === "carrier" ? [53, 0, -26] : e.kind === "bomber" ? [23.6, -.4, -6.8]
      : e.kind === "dart" ? [6.3, -.1, -7.7] : e.kind === "crescent" ? [9.2, 0, -4.5] : [8.7, -.2, -3.8];
    for (const sign of [-1,1]) {
      const pt = project(...transform(e,b,[sign * tip[0], tip[1], tip[2]]));
      if (!pt) continue;
      disc(ctx,pt.x,pt.y,clamp(pt.k*.18,0,1.6),sign<0 ? "#ff8275" : "#91f6d2");
    }
    if (Math.sin(time*4+(e.id || 0))>.95) {
      const pt = project(...transform(e,b,[0,1.2,-5]));
      if (pt) disc(ctx,pt.x,pt.y,1,"#fff1d7");
    }
  }
  function prismCharge(ctx,e,project) {
    if (!e.charge) return;
    const p = project(e.x,e.y+12,e.z);
    if (!p) return;
    const r = clamp(3 + 9*(1-e.charge) + p.k*3,3,18);
    const x=p.x,y=p.y,tone=e.charge>.7?"#fff6ff":"#f8a6fa";
    line(ctx,x-r,y,x,y-r,tone);line(ctx,x,y-r,x+r,y,tone);
    line(ctx,x+r,y,x,y+r,tone);line(ctx,x,y+r,x-r,y,tone);
    disc(ctx,x,y,1+e.charge*2,tone);
  }
  function compactAircraft(ctx, p, e, atNight, friendly) {
    const x = Math.round(p.x),
      y = Math.round(p.y),
      ground = e.ground;
    if (e.boat) {
      const half = e.kind === "gunboat" ? 5 : 3;
      polygon(ctx,[[x-half,y],[x+half,y],[x+half-2,y+2],[x-half+1,y+2]],"#47566c");
      line(ctx,x-1,y-1,x+1,y-1,"#e3bf9d");
      ctx.fillStyle = "#e5886c"; ctx.fillRect(x,y-2,1,1);
    } else if (ground) {
      ctx.fillStyle = dark;
      ctx.fillRect(x - 2, y - 1, 5, 3);
      ctx.fillStyle = e.kind === "prism" ? "#efb0ff" : "#f7b66f";
      ctx.fillRect(x, y - 3, e.kind === "prism" ? 2 : 1, 2);
    } else if (e.kind === "bomber") {
      line(ctx,x-5,y,x+5,y,atNight?"#a5a9bb":"#665060");
      ctx.fillStyle="#dfa360";ctx.fillRect(x-1,y-1,3,3);
    } else if (e.kind === "dart") {
      polygon(ctx,[[x,y-3],[x+2,y+2],[x,y+1],[x-2,y+2]],"#70cdbc");
    } else {
      const size = clamp(Math.round(p.k * (e.kind === "carrier" ? 46 : 8)), 2, 8);
      line(ctx, x - size, y + 1, x, y - 1, "#514458");
      line(ctx, x, y - 1, x + size, y + 1, "#514458");
      ctx.fillStyle = friendly ? azure[3] : e.kind === "crescent" ? "#f5b2ab" : "#e5c6aa";
      ctx.fillRect(x, y - 1, 2, 1);
    }
  }
  function paintShot(ctx, project, s, time) {
    const p = project(s.x, s.y, s.z);
    if (!p) return;
    const kind = s.kind,
      missile = kind === "missile",
      enemy = kind === "enemy",
      wisp = kind === "wisp",
      friendly = kind === "ally";
    const v = Math.hypot(s.vx, s.vy, s.vz) || 1;
    const len = clamp(v * 0.032, 3, 26),
      end = project(s.x - (s.vx / v) * len, s.y - (s.vy / v) * len, s.z - (s.vz / v) * len);
    if (!end) return;
    if (s.style === "ember" || s.style === "pulse") {
      const ember = s.style === "ember";
      const outer = ember ? "#ff9857" : "#ed87ff";
      const r = clamp(p.k*2.4,.8,6);
      line(ctx,end.x,end.y,p.x,p.y,outer);
      disc(ctx,p.x,p.y,r,outer);
      disc(ctx,p.x,p.y,r*.4,ember?"#fff8bc":"#fff0ff");
      return;
    }
    if (s.style === "needle" || s.style === "manta") {
      const ion = s.style === "needle", halo = ion ? "#52e3e5" : "#f79a53";
      const width = clamp(Math.round(p.k * (ion ? 1.2 : .7)), 2, 5);
      line(ctx, end.x, end.y, p.x, p.y, halo, width);
      line(ctx, (end.x + p.x) / 2, (end.y + p.y) / 2, p.x, p.y, ion ? "#d8ffff" : "#fff0a0", 1);
      return;
    }
    if (missile) {
      const tail = project(s.x - (s.vx / v) * 2, s.y - (s.vy / v) * 2, s.z - (s.vz / v) * 2);
      if (tail) {
        line(ctx, tail.x, tail.y, end.x, end.y, "#ff9063", Math.max(1, Math.round(p.k * 0.8)));
        line(ctx, p.x, p.y, tail.x, tail.y, "#dae4dc", Math.max(1, Math.round(p.k * 0.5)));
      }
    } else {
      const col = enemy ? "#ff665b" : wisp ? "#72e6d6" : friendly ? "#74c4ff" : "#ffd26f";
      const width = clamp(Math.round(p.k * 0.4), 1, 3);
      line(ctx, end.x, end.y, p.x, p.y, col, width);
      line(
        ctx,
        end.x * 0.38 + p.x * 0.62,
        end.y * 0.38 + p.y * 0.62,
        p.x,
        p.y,
        enemy ? "#ffd1a2" : wisp || friendly ? "#d5fff0" : "#fff7c9",
        width,
      );
    }
  }
  const puffCache = new Map();
  function smokePuff(stage) {
    if (puffCache.has(stage)) return puffCache.get(stage);
    const img = document.createElement("canvas");
    img.width = 22;
    img.height = 20;
    const p = img.getContext("2d"),
      dither = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const lobes = [
      [7, 8, 6],
      [13, 6, 5],
      [15, 11, 6],
      [9, 13, 4],
      [4, 11, 3],
    ];
    const colors = ["#514658", "#766274", "#96808a", "#af9799", "#c8aaa4"];
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        let deep = -1;
        for (const [cx, cy, r] of lobes) deep = Math.max(deep, 1 - Math.hypot(x - cx, (y - cy) * 1.12) / r);
        const grain = dither[(x % 4) + (y % 4) * 4];
        if (deep < 0 || grain < stage * 0.9 + (1 - deep) * 2.5) continue;
        const tone = clamp(
          Math.floor((1 - y / 19) * 2.8 + deep * 0.65 + (grain > 11 ? 0.4 : 0) + stage * 0.22),
          0,
          4,
        );
        p.fillStyle = colors[tone];
        p.fillRect(x, y, 1, 1);
      }
    puffCache.set(stage, img);
    return img;
  }
  function paintFx(ctx, p, fx, project) {
    const t = 1 - saturate(fx.life / (fx.maxLife || 1)),
      r = clamp((fx.size || 1) * p.k, 0.5, 65);
    const kind = fx.kind;
    if (kind === "ring" || kind === "scorch" || kind === "foam") {
      const radius = (fx.size || 1) * (kind === "scorch" ? 1 : 0.08 + 0.92 * t);
      const points = [];
      for (let j = 0; j < 20; j++) {
        const a = (j * TAU) / 20,
          pt = project(fx.x + Math.cos(a) * radius, fx.y + 0.2, fx.z + Math.sin(a) * radius);
        if (pt) points.push([pt.x, pt.y]);
      }
      if (points.length < 3) return;
      ctx.globalAlpha = kind === "scorch" ? 0.48 * (1 - t) : 0.75 * (1 - t);
      if (kind === "foam" && t < .40) {
        const age = t / .40;
        const lift = Math.sin(Math.PI * age);
        ctx.globalAlpha = .92 * (1 - age * age);
        for (let i = 0; i < 5; i++) {
          const a = i * TAU / 5, base = fx.size * (.12 + .25 * age);
          const reach = fx.size * (.20 + .52 * age);
          const left = project(fx.x + base * Math.cos(a - .9), fx.y, fx.z + base * Math.sin(a - .9));
          const right = project(fx.x + base * Math.cos(a + .9), fx.y, fx.z + base * Math.sin(a + .9));
          const crest = project(fx.x + reach * Math.cos(a), fx.y + lift * fx.size * (1.1 + .22 * (i % 3)),
            fx.z + reach * Math.sin(a));
          if (!left || !right || !crest) continue;
          polygon(ctx, [[left.x,left.y],[crest.x,crest.y],[right.x,right.y]], i % 2 ? "#75b7be" : "#b1dbd7");
          line(ctx, crest.x, crest.y, crest.x * .7 + left.x * .3, crest.y * .7 + left.y * .3, "#eff8e5");
        }
        ctx.globalAlpha = .75 * (1 - t);
      }
      if (kind === "scorch") {
        polygon(ctx, points, "#4f3944");
        for (let j = 0; j < 6; j++) {
          const a = j * 2.4,
            spread = radius * (0.25 + j * 0.09);
          const pt = project(fx.x + Math.cos(a) * spread, fx.y + 0.85, fx.z + Math.sin(a) * spread);
          if (pt && Math.sin(fx.life * 4.6 + j * 1.43) > -0.3) {
            ctx.globalAlpha = 0.85 * (1 - t);
            ctx.fillStyle = j % 2 ? "#f29c56" : "#df6650";
            ctx.fillRect(Math.round(pt.x), Math.round(pt.y), Math.max(1, Math.round(pt.k * 0.65)), 1);
          }
        }
      } else
        for (let j = 0; j < points.length; j++) {
          const a = points[j],
            b = points[(j + 1) % points.length];
          line(ctx, a[0], a[1], b[0], b[1], kind === "ring" ? "#ffdcaa" : "#c0f0da");
        }
    } else if (kind === "smoke") {
      ctx.globalAlpha = clamp(0.82 * (1 - t), 0.03, 0.82);
      const puff = smokePuff(Math.floor(t * 5)),
        diam = Math.max(2, Math.round(r * 2.0));
      ctx.drawImage(puff, Math.round(p.x - diam * 0.5), Math.round(p.y - diam * 0.5), diam, diam);
    } else if (kind === "fire") {
      const colors = ["#fff6bb", "#ffd16a", "#ff9654", "#e65c4c", "#a94d56"];
      disc(ctx, p.x, p.y, r, colors[clamp(Math.floor(t * 5), 0, 4)]);
      if (r > 2 && t < 0.55) disc(ctx, p.x - 0.18 * r, p.y - 0.2 * r, r * 0.54, "#ffec9a");
    } else if (kind === "spray") {
      ctx.globalAlpha = 1 - t * 0.75;
      const tail = project(fx.x - (fx.vx || 0) * 0.05, fx.y - (fx.vy || 0) * 0.05, fx.z - (fx.vz || 0) * 0.05);
      if (tail) line(ctx, tail.x, tail.y, p.x, p.y, "#96d2cb", clamp(Math.round(r * 0.58), 1, 3));
      const drop = clamp(Math.round(r * 0.48), 1, 4);
      ctx.fillStyle = "#e2f7e9";
      ctx.fillRect(Math.round(p.x), Math.round(p.y), drop, drop);
    } else if (kind === "vapor") {
      ctx.globalAlpha = 1 - t;
      disc(ctx, p.x, p.y, r, "#f3e6dc");
    } else {
      ctx.globalAlpha = saturate((1 - t) * 1.65);
      const tail = project(fx.x - (fx.vx || 0) * 0.025, fx.y - (fx.vy || 0) * 0.025, fx.z - (fx.vz || 0) * 0.025);
      if (tail) line(ctx, p.x, p.y, tail.x, tail.y, t > 0.45 ? "#fc9c58" : "#ffed9d");
    }
    ctx.globalAlpha = 1;
  }
  const pickupStyles = {
    squadron: {
      label: "SQUADRON", light: "#97ffdf", shade: "#4fbab7", dark: "#254957",
      rim: [[-0.4,-1],[0.4,-1],[1,-0.4],[1,0.4],[0.4,1],[-0.4,1],[-1,0.4],[-1,-0.4]],
      symbol: ["0001000","0010100","0000000","0100010","1010101"],
      radar: ["00100","01010","00000","01010","10001"],
    },
    shield: {
      label: "SHIELD", light: "#e4baff", shade: "#a27ce5", dark: "#31284f",
      rim: [[-0.96,-0.83],[0,-1],[0.96,-0.83],[0.89,0.18],[0.58,0.64],[0,1],[-0.58,0.64],[-0.89,0.18]],
      symbol: ["001100","001100","111111","111111","001100","001100"],
      radar: ["00100","00100","11111","00100","00100"],
    },
    rapid: {
      label: "RAPID FIRE", light: "#ffdc78", shade: "#ff9c4d", dark: "#4b2d33",
      rim: [[0,-1],[1,0],[0,1],[-1,0]],
      symbol: ["000111","001110","011100","111111","001110","011100","011000","010000"],
      radar: ["0011","0110","1111","0110","0100"],
    },
  };

  function pickupGlyph(ctx, rows, x, y, scale, color) {
    ctx.fillStyle = color;
    const left = Math.round(x - rows[0].length * scale / 2);
    const top = Math.round(y - rows.length * scale / 2);
    for (let row = 0; row < rows.length; row++)
      for (let col = 0; col < rows[row].length; col++)
        if (rows[row][col] === "1") ctx.fillRect(left + col * scale, top + row * scale, scale, scale);
  }

  function drawBeacon(ctx, p, time, style) {
    const x = Math.round(p.x), y = Math.round(p.y);
    const radius = clamp(Math.round(p.k * 36), 8, 62);
    const width = clamp(Math.round(radius / 10), 1, 3);
    const points = style.rim.map(([dx, dy]) => [x + radius * dx, y + radius * dy]);
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
      line(ctx, x1 - 1, y1 - 1, x2 - 1, y2 - 1, style.dark, width + 2);
      line(ctx, x1, y1, x2, y2, (y1 + y2) / 2 > y ? style.shade : style.light, width);
    }
    for (const phase of [0, 0.5]) {
      const t = ((time * 0.38 + phase) % 1) * points.length;
      const index = Math.floor(t), u = t - index;
      const [x1, y1] = points[index], [x2, y2] = points[(index + 1) % points.length];
      disc(ctx, x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, width, "#fff9de");
    }
    const scale = clamp(Math.floor(radius / 8), 1, 3);
    pickupGlyph(ctx, style.symbol, x + 1, y + 1, scale, style.dark);
    pickupGlyph(ctx, style.symbol, x, y, scale, style.light);
    const half = style.label.length * 2 + 2;
    const labelX = clamp(x, half + 1, ctx.canvas.width - half - 1);
    const labelY = clamp(y - radius - 10, 2, ctx.canvas.height - 7);
    ctx.fillStyle = style.dark;
    ctx.fillRect(labelX - half, labelY - 1, half * 2 + 1, 7);
    label(ctx, style.label, labelX, labelY, style.light, "center");
  }

  // Camera-space bearing also works for contacts behind the camera and in north-up view.
  function edgeCue(cam, object, w, h, cockpit, inset = 0) {
    const v = [object.x - cam.x, object.y - cam.y, object.z - cam.z];
    const dot = axis => v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
    let dx = dot(cam.right), dy = -dot(cam.up);
    const ahead = v[0] * cam.forward[0] + v[2] * cam.forward[2];
    const behind = ahead < 0 && Math.hypot(cam.forward[0], cam.forward[2]) > .05;
    if (behind) {
      // A contact aft needs a heading reversal, even when the camera sits above the jet.
      const side = v[0] * cam.forward[2] - v[2] * cam.forward[0];
      dx = side < ahead * .015 ? -1 : 1;
      dy = 0;
    } else if (Math.abs(dx) + Math.abs(dy) < 0.01) dy = 1;
    const n = Math.hypot(dx, dy);
    dx /= n;
    dy /= n;
    const top = cockpit ? Math.min(.16 * h, (w < h ? .32 : .20) * h - 19) : .16 * h;
    const edgeY = dy > 0 ? (cockpit ? .12 : .35) * h : h / 2 - top;
    const t = Math.min((w / 2 - 17 - inset) / (Math.abs(dx) || 0.0001),
      (edgeY - inset) / (Math.abs(dy) || 0.0001));
    return { x: w / 2 + dx * t, y: h / 2 + dy * t, dx, dy, behind };
  }

  function corners(ctx, x, y, r, color) {
    const arm = clamp(Math.round(r * 0.35), 2, 7);
    for (const i of [-1, 1])
      for (const j of [-1, 1]) {
        const px = x + i * r,
          py = y + j * r;
        line(ctx, px - 1, py - 1, px - i * arm - 1, py - 1, "#37414a", 3);
        line(ctx, px - 1, py - 1, px - 1, py - j * arm - 1, "#37414a", 3);
        line(ctx, px, py, px - i * arm, py, color);
        line(ctx, px, py, px, py - j * arm, color);
      }
  }
  function cues(ctx, g, cam, project, b) {
    const w = ctx.canvas.width,
      h = ctx.canvas.height,
      e = g.player;
    const aimDistance = g.view === 2 ? 65 : 450;
    const aim = project(e.x + b.f[0] * aimDistance, e.y + b.f[1] * aimDistance, e.z + b.f[2] * aimDistance);
    if (aim && aim.x > 8 && aim.x < w - 8 && aim.y > 8 && aim.y < h - 8) {
      const x = Math.round(aim.x),
        y = Math.round(aim.y);
      ctx.globalAlpha = 0.92;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        line(ctx, x + dx * 5, y + dy * 5 + 1, x + dx * 9, y + dy * 9 + 1, "#424c4a");
        line(ctx, x + dx * 5, y + dy * 5, x + dx * 9, y + dy * 9, ice);
      }
      ctx.fillStyle = ice;
      ctx.fillRect(x, y, 1, 1);
      ctx.globalAlpha = 1;
    }
    const pickup = g.pickup;
    if (pickup) {
      const p = project(pickup.x, pickup.y, pickup.z);
      const cockpit = g.cockpitBlend > 0.5;
      if (!p || p.x < 15 || p.x > w - 15 || p.y < 20 || p.y > h * (cockpit ? 0.65 : 0.91) ||
          !visible(g, cam, pickup)) {
        const { x, y, dx, dy } = edgeCue(cam, pickup, w, h, cockpit, 13);
        const style = pickupStyles[pickup.kind];
        line(ctx, x, y, x + dx * 7, y + dy * 7, style.dark, 3);
        line(ctx, x, y, x + dx * 7, y + dy * 7, style.light);
        ctx.fillStyle = style.dark;
        ctx.fillRect(Math.round(x) - 5, Math.round(y) - 5, 11, 11);
        pickupGlyph(ctx, style.symbol, x, y, 1, style.light);
      }
    }
    const target = g.target || g.lockTarget;
    if (target) {
      const p = project(target.x, target.y, target.z);
      const inView = p && p.x > 16 && p.x < w - 16 && p.y > 22 && p.y < h * (g.cockpitBlend > 0.5 ? 0.65 : 0.86);
      if (inView) {
        const r = clamp(p.k * (target.kind === "carrier" ? 57 : 12) + 4, 6, 38);
        if (target !== g.lockTarget || !g.lockProgress) corners(ctx, p.x, p.y, r, amber);
        if (target.kind === "carrier" && target.maxHp) {
          const x = Math.round(p.x - 18),
            y = Math.round(p.y + r + 5);
          ctx.fillStyle = dark;
          ctx.fillRect(x - 1, y - 1, 38, 4);
          ctx.fillStyle = amber;
          ctx.fillRect(x, y, Math.ceil(36 * saturate(target.hp / target.maxHp)), 2);
        }
      } else {
        const { x, y, dx, dy, behind } = edgeCue(cam, target, w, h, g.cockpitBlend > 0.5);
        const sx = -dy, sy = dx;
        const arrow = [
          [x + dx * 5, y + dy * 5],
          [x - dx * 4 + sx * 4, y - dy * 4 + sy * 4],
          [x - dx * 2, y - dy * 2],
          [x - dx * 4 - sx * 4, y - dy * 4 - sy * 4],
        ];
        polygon(ctx, arrow, amber);
        for (let i = 0; i < arrow.length; i++) {
          const a = arrow[i], b = arrow[(i + 1) % arrow.length];
          line(ctx, a[0], a[1], b[0], b[1], "#3e3535");
        }
        const meters = Math.hypot(target.x - e.x, target.y - e.y, target.z - e.z);
        const range = meters < 1000 ? Math.round(meters / 10) * 10 + "M" : (meters / 1000).toFixed(1) + "KM";
        const text = (behind ? "TURN " : "") + range;
        const margin = typeWidth(text) / 2 + 3;
        cockpitPlate(ctx, text, clamp(x, margin, w - margin), y + (Math.abs(dy) > .45 ? -15 : 8), "#ffdf9a", "#3e3535");
      }
    }
    if (g.lockTarget && g.lockProgress > 0) {
      const t = g.lockTarget,
        p = project(t.x, t.y, t.z);
      if (!p || p.x < 8 || p.x > w - 8 || p.y < 12 || p.y > h * (g.cockpitBlend > .5 ? .65 : .91)) return;
      const ready = g.lockProgress >= 1;
      const r = clamp(p.k * (t.kind === "carrier" ? 56 : 10) + 4, 5, 40) + (1 - g.lockProgress) * 7;
      const col = ready ? "#91ffd5" : "#ffe393";
      corners(ctx, p.x, p.y, r, col);
      if (ready) {
        const text = "LOCK " + contactNames[t.kind];
        const margin = typeWidth(text) / 2 + 3;
        cockpitPlate(ctx, text, clamp(p.x, margin, w - margin), Math.max(2, p.y - r - 11), col);
      } else {
        const x = Math.round(p.x) - 8, y = Math.max(1, Math.round(p.y - r) - 5);
        ctx.fillStyle = "#3e3535";
        ctx.fillRect(x - 1, y - 1, 18, 4);
        ctx.fillStyle = col;
        ctx.fillRect(x, y, Math.ceil(16 * g.lockProgress), 2);
      }
    }
  }

  function flightHud(ctx, g, cam, project) {
    const w = ctx.canvas.width,
      h = ctx.canvas.height,
      e = g.player,
      cx = w / 2,
      cy = h / 2;
    const yaw = Math.atan2(cam.forward[0], cam.forward[2]),
      col = "#c0ffdf", glass = "#1d3938";
    const dir = (a, p) =>
      project(
        cam.x + 2000 * Math.sin(a) * Math.cos(p),
        cam.y + 2000 * Math.sin(p),
        cam.z + 2000 * Math.cos(a) * Math.cos(p),
      );
    const heading = ((yaw * 180) / Math.PI + 360) % 360,
      top = h * (w < h ? 0.32 : 0.2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - w * 0.22, h * 0.27, w * 0.44, h * 0.4);
    ctx.clip();
    ctx.globalAlpha = 0.85;
    for (let a = -60; a <= 60; a += 10) {
      const p = dir(yaw, (a * Math.PI) / 180);
      if (!p) continue;
      let dx = cam.up[1],
        dy = cam.right[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const arm = a === 0 ? 32 : 19;
      for (const side of [-1, 1]) {
        const l = (a === 0 ? 10 : 8) * side,
          r = arm * side;
        line(ctx, p.x + dx * l, p.y + dy * l, p.x + dx * r, p.y + dy * r, col);
        if (a !== 0) {
          const s = a > 0 ? 1 : -1;
          line(ctx, p.x + dx * r, p.y + dy * r, p.x + dx * r - dy * 3 * s, p.y + dy * r + dx * 3 * s, col);
        }
      }
      if (a !== 0 && w > 280) cockpitPlate(ctx, String(a), p.x + dx * (arm + 12), p.y + dy * (arm + 12) - 3, col);
    }
    ctx.restore();
    const range = Math.min(67, w * 0.18);
    for (let a = Math.floor(heading / 5) * 5 - 20; a <= heading + 20; a += 5) {
      const x = cx + (a - heading) * 2.65;
      if (Math.abs(x - cx) > range) continue;
      line(ctx, x, top, x, top + (a % 10 === 0 ? 4 : 2), col);
      if (a % 10 === 0) cockpitPlate(ctx, String((a + 360) % 360).padStart(3, "0"), x, top - 10, col);
    }
    polygon(
      ctx,
      [
        [cx, top + 5],
        [cx - 2, top + 9],
        [cx + 2, top + 9],
      ],
      amber,
    );
    const atX = Math.min(w * (cam.cockpitSpace ? 0.115 : 0.235), 110), fy = Math.round(cy - 3);
    const primaryScale = w >= 202 ? 2 : 1;
    function tape(x, value, unit, secondary) {
      const width = Math.max(typeWidth(value, primaryScale), typeWidth(secondary), typeWidth(unit)) + 6;
      const left = Math.round(x - width / 2), height = primaryScale * 7 + 12;
      ctx.fillStyle = glass;
      ctx.fillRect(left, fy, width, height);
      ctx.fillStyle = "#86c9ad";
      ctx.fillRect(left, fy, 1, height);
      ctx.fillRect(left + width - 1, fy, 1, height);
      cockpitType(ctx, value, x, fy + 2, "#e9fff0", "center", primaryScale);
      cockpitType(ctx, unit, x, fy + 7 * primaryScale + 4, col);
      cockpitPlate(ctx, secondary, x, fy + height + 3, col);
    }
    const agl = Math.max(0, e.y - Math.max(0, g.world.height(e.x, e.z)));
    tape(cx - atX, Math.round(e.speed * 1.94384), "KTS", (e.gForce || 1).toFixed(1) + " G");
    tape(cx + atX, Math.round(e.y * 3.28084), "FT", "R " + Math.round(agl * 3.28084));
    cockpitPlate(ctx, "MSL " + e.missiles, cx, cy + h * 0.12, col);
    const warning = g.terrainWarning ? "PULL UP" : e.hull < e.frame.maxHull * .40 ? "HULL" : e.shield < e.frame.maxShield * .20 ? "SHIELD" : "";
    if (warning && Math.sin(g.time * 9) > -0.25) cockpitPlate(ctx, warning, cx, cy - h * 0.1, "#ffd59d");
  }

  let panelCanvas,
    radarCanvas,
    radarStamp = -2,
    radarOwner = null;
  function panel(ctx, g, thumbSpace) {
    const e = g.player,
      w = ctx.canvas.width,
      h = ctx.canvas.height;
    // Small windshield braces remain peripheral so the open sky dominates the view.
    const leftEdge = thumbSpace ? w * thumbSpace[0] : 0;
    const rightEdge = thumbSpace ? w * thumbSpace[1] : w;
    const displayWidth = rightEdge - leftEdge;
    // In short landscape the flight instruments occupy the gap between the two thumbs.
    // Crop the console to airspeed, attitude, altitude, radar and vertical speed on narrow phones.
    const compact = displayWidth < 350;
    const sourceX = displayWidth < 155 ? 141 : compact ? 60 : 0;
    const sourceWidth = displayWidth < 155 ? 101 : compact ? 220 : 420;
    const scale = Math.min(displayWidth / sourceWidth, Math.max(.62, h / 330) * 1.22);
    const pw = sourceWidth * scale, ph = 88 * scale;
    const center = (leftEdge + rightEdge) / 2;
    const x = center - pw / 2, y = h - ph - 5;
    if (!panelCanvas) {
      panelCanvas = document.createElement("canvas");
      panelCanvas.width = 420;
      panelCanvas.height = 88;
    }
    const c = panelCanvas.getContext("2d");
    c.clearRect(0, 0, 420, 88);
    const palette = {
      bezel: "#272d3c",
      edge: "#859193",
      lit: "#b6c1ad",
      dial: "#232f39",
      tick: "#c6d0ba",
      lamp: "#ffa56c",
    };
    const cream = palette.tick;
    // Composite labels after scaling the dial art. Each stroke retains one full
    // screen pixel even on a narrow phone or a reduced-resolution renderer.
    const captions = [];
    function caption(text, cx, cy, color = "#f1f3dd", inset = false) {
      if (cx >= sourceX && cx < sourceX + sourceWidth) captions.push([text, cx, cy, color, inset]);
    }
    function panelShape(points, col) {
      polygon(c, points, col);
    }
    function bolt(x, y) {
      c.fillStyle = "#959b91";
      c.fillRect(x, y, 2, 2);
      c.fillStyle = "#454a54";
      c.fillRect(x, y + 1, 2, 1);
    }
    function gauge(x, y, r, name) {
      disc(c, x, y, r + 2, "#1d2332");
      disc(c, x, y, r + 1, "#87918a");
      disc(c, x, y, r, "#48505a");
      disc(c, x, y, r - 2, palette.dial);
      caption(name, x, y + r + 7);
    }
    function ticks(x, y, r) {
      for (let j = 0; j <= 10; j++) {
        const a = -2.45 + (j * 4.9) / 10,
          s = Math.sin(a),
          co = -Math.cos(a),
          inside = r - (j % 2 ? 2 : 4);
        line(c, x + s * inside, y + co * inside, x + s * (r - 1), y + co * (r - 1), j > 8 ? "#f2a16e" : cream);
      }
    }
    function needle(x, y, r, val, color = amber) {
      const a = -2.45 + saturate(val) * 4.9;
      line(c, x - Math.sin(a) * 2, y + Math.cos(a) * 2, x + Math.sin(a) * r, y - Math.cos(a) * r, color);
      disc(c, x, y, 1, "#e9e3c5");
    }
    // The upper lip and casting are hand stepped, mirroring the pixel silhouette of the jet.
    panelShape(
      [
        [0, 31],
        [35, 23],
        [62, 21],
        [78, 11],
        [139, 11],
        [145, 7],
        [273, 7],
        [279, 11],
        [342, 11],
        [358, 21],
        [388, 22],
        [420, 31],
        [420, 88],
        [0, 88],
      ],
      "#1d2332",
    );
    panelShape(
      [
        [0, 35],
        [35, 27],
        [64, 25],
        [79, 15],
        [140, 15],
        [146, 11],
        [271, 11],
        [277, 15],
        [341, 15],
        [356, 25],
        [390, 26],
        [420, 35],
        [420, 88],
        [0, 88],
      ],
      "#89968e",
    );
    panelShape(
      [
        [0, 38],
        [38, 30],
        [66, 27],
        [81, 18],
        [142, 18],
        [148, 14],
        [271, 14],
        [277, 18],
        [340, 18],
        [355, 28],
        [391, 29],
        [420, 38],
        [420, 88],
        [0, 88],
      ],
      "#515966",
    );
    panelShape(
      [
        [0, 62],
        [35, 62],
        [42, 45],
        [60, 36],
        [60, 87],
        [0, 87],
      ],
      "#363c4c",
    );
    panelShape(
      [
        [360, 36],
        [381, 46],
        [391, 62],
        [420, 62],
        [420, 87],
        [360, 87],
      ],
      "#363c4c",
    );
    for (const x of [37, 61, 133, 151, 270, 286, 358, 383]) {
      bolt(x, 32);
      bolt(x, 77);
    }
    // Throttle gate, lever, and position detents.
    caption("THR", 29, 41);
    c.fillStyle = dark;
    c.fillRect(25, 48, 6, 27);
    for (let j = 0; j < 5; j++) line(c, 18, 50 + j * 5, 21, 50 + j * 5, cream);
    const leverY = e.boost ? 49 : 61;
    line(c, 28, 72, 28, leverY, "#a2aaa0", 2);
    c.fillStyle = "#232834";
    c.fillRect(21, leverY - 2, 15, 6);
    c.fillStyle = amber;
    c.fillRect(22, leverY - 2, 13, 2);
    gauge(84, 46, 17, "KTS");
    ticks(84, 46, 14);
    needle(84, 46, 11, (e.speed * 1.94384) / 420);
    caption(Math.round(e.speed * 1.94384), 84, 55, "#fff7d4", true);
    gauge(123, 46, 17, "ATT");
    const pitch = e.pitch,
      bank = e.bank + e.roll,
      sb = Math.sin(bank),
      cb = Math.cos(bank);
    for (let j = -13; j <= 13; j++) {
      const a = Math.floor(Math.sqrt(13 * 13 - j * j));
      for (let i = -a; i <= a; i++) {
        const elevation = i * sb + j * cb - pitch * 24;
        c.fillStyle = elevation < -0.65 ? "#638b9d" : elevation > 0.65 ? "#ad735e" : "#f1dfad";
        c.fillRect(123 + i, 46 + j, 1, 1);
      }
    }
    line(c, 115, 46, 121, 46, amber);
    line(c, 125, 46, 131, 46, amber);
    disc(c, 123, 46, 1, amber);
    gauge(164, 46, 17, "ALT FT");
    ticks(164, 46, 14);
    needle(164, 46, 11, ((e.y * 3.28084) % 1000) / 1000);
    c.fillStyle = "#162532";
    c.fillRect(153, 51, 23, 8);
    caption(String(Math.round(e.y * 3.28084)).padStart(4, "0"), 164, 55, "#fff7d4", true);
    // Moving map, sweep arm and actual contacts share a ~2.2 km radar range.
    gauge(211, 45, 23, "RADAR");
    const rr = 19;
    if (!radarCanvas) {
      radarCanvas = document.createElement("canvas");
      radarCanvas.width = radarCanvas.height = 39;
    }
    if (g.time - radarStamp > 0.32 || radarStamp > g.time || radarOwner !== g) {
      const rc = radarCanvas.getContext("2d");
      rc.clearRect(0, 0, 39, 39);
      const sy = Math.sin(e.yaw),
        cy = Math.cos(e.yaw);
      for (let py = -rr; py <= rr; py += 2)
        for (let px = -rr; px <= rr; px += 2) {
          if (px * px + py * py > rr * rr) continue;
          const ex = e.x + (px * cy - py * sy) * 59,
            ez = e.z + (-px * sy - py * cy) * 59;
          const terrain = g.world.height(ex, ez);
          rc.fillStyle =
            terrain <= 0 ? "#0a241d" : terrain < 25 ? "#153d28" : terrain < 75 ? "#235332" : "#38683c";
          rc.fillRect(px + rr, py + rr, 2, 2);
        }
      // A dotted half-range ring remains visible over the moving terrain.
      rc.fillStyle = "#558761";
      for (let i = 0; i < 24; i++) {
        const a = (i * TAU) / 24;
        rc.fillRect(rr + Math.round(Math.sin(a) * rr / 2), rr + Math.round(Math.cos(a) * rr / 2), 1, 1);
      }
      radarOwner = g;
      radarStamp = g.time;
    }
    c.drawImage(radarCanvas, 211 - rr, 45 - rr);
    const angle = g.time * 1.85;
    for (const [offset, color] of [[-0.15, "#40824a"], [0, "#83ea80"]]) {
      line(c, 211, 45, 211 + Math.sin(angle + offset) * rr, 45 - Math.cos(angle + offset) * rr, color);
    }
    const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw);
    function plotContact(t, kind) {
      const dx = t.x - e.x, dz = t.z - e.z;
      const rx = (dx * cy - dz * sy) / 59, ry = -(dx * sy + dz * cy) / 59;
      if (Math.hypot(rx, ry) >= rr - 1) return;
      const x = Math.round(211 + rx), y = Math.round(45 + ry);
      if (kind === "pickup") {
        const style = pickupStyles[t.kind];
        pickupGlyph(c, style.radar, x, y, 1, style.light);
        return;
      }
      c.fillStyle = kind === "ally" ? "#8ff6c6" : "#d0ff94";
      if (kind === "ally") {
        c.fillRect(x - 1, y, 1, 1);
        c.fillRect(x + 1, y, 1, 1);
        c.fillRect(x, y - 1, 1, 1);
      } else c.fillRect(x, y, 2, 2);
    }
    for (const t of g.enemies) plotContact(t, "enemy");
    for (const t of g.allies || []) plotContact(t, "ally");
    if (g.pickup) plotContact(g.pickup, "pickup");
    c.fillStyle = "#e5ffda";
    c.fillRect(210, 45, 3, 1);
    c.fillRect(211, 44, 1, 3);
    gauge(257, 46, 17, "VSI");
    ticks(257, 46, 14);
    needle(257, 46, 11, 0.5 + (e.vy || 0) / 125);
    caption(Math.round(((e.vy || 0) * 196.85) / 100), 257, 55, "#fff7d4", true);
    // Turn-and-slip indicator and paired engine power tapes.
    gauge(297, 46, 16, "TURN");
    const tilt = clamp(e.bank || 0, -1, 1);
    line(c, 288, 45 - tilt * 6, 306, 45 + tilt * 6, amber);
    line(c, 297, 43, 297, 48, cream);
    line(c, 287, 52, 307, 52, "#849497");
    disc(c, 297 + tilt * 7, 52, 2, "#222b37");
    caption("ENG", 336, 32);
    for (let k = 0; k < 2; k++) {
      const x = 327 + k * 11;
      c.fillStyle = "#26313b";
      c.fillRect(x, 39, 7, 22);
      const pct = clamp(0.33 + e.speed / 270 + (e.boost ? 0.21 : 0), 0, 1);
      for (let j = 0; j < 8; j++) {
        c.fillStyle = j / 8 > pct ? "#3b454e" : j > 5 ? "#ffc276" : "#9db497";
        c.fillRect(x + 1, 58 - j * 2.5, 5, 1.6);
      }
      caption(String(k + 1), x + 3, 67);
    }
    const now = new Date(),
      clock = [now.getHours(), now.getMinutes()].map((v) => String(v).padStart(2, "0")).join(":");
    c.fillStyle = palette.dial;
    c.fillRect(365, 42, 28, 11);
    caption(clock, 379, 47, amber, true);
    const lamps = [
      ["SHD", e.shield < e.frame.maxShield * .20],
      ["HUL", e.hull < e.frame.maxHull * .40],
      ["AB", e.boost],
    ];
    lamps.forEach(([text, on], j) => {
      c.fillStyle = on ? "#b85d47" : "#3e444c";
      c.fillRect(352 + j * 22, 57, 21, 12);
      caption(text, 362 + j * 22, 63, on ? "#fff2b8" : "#c4c9c3");
    });
    polygon(
      ctx,
      [
        [0, h * 0.25],
        [5, h * 0.28],
        [w * 0.11, h * 0.76],
        [w * 0.19, h * 0.87],
        [w * 0.12, h * 0.88],
        [w * 0.075, h * 0.78],
        [0, h * 0.46],
      ],
      "#414757",
    );
    polygon(
      ctx,
      [
        [w, h * 0.25],
        [w - 5, h * 0.28],
        [w * 0.89, h * 0.76],
        [w * 0.81, h * 0.87],
        [w * 0.88, h * 0.88],
        [w * 0.925, h * 0.78],
        [w, h * 0.46],
      ],
      "#414757",
    );
    line(ctx, 0, h * 0.26, w * 0.103, h * 0.76, "#a5a799", 2);
    line(ctx, w, h * 0.26, w * 0.897, h * 0.76, "#a5a799", 2);
    polygon(
      ctx,
      [
        [0, y + 28 * scale],
        [x + 50 * scale, y + 29 * scale],
        [x + 70 * scale, h],
        [0, h],
      ],
      "#353a49",
    );
    polygon(
      ctx,
      [
        [w, y + 28 * scale],
        [x + 370 * scale, y + 29 * scale],
        [x + 350 * scale, h],
        [w, h],
      ],
      "#353a49",
    );
    // Fill the extra span on wide windscreens with joined side consoles at the same pixel scale as the dials.
    if (!thumbSpace && x >= 18) {
      for (const right of [false, true]) {
        ctx.save();
        if (right) {
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
        }
        // Edge gasket and fasteners follow the existing brace, outside the sight and heading tape.
        line(ctx, 0, h * 0.32, w * 0.086, h * 0.74, "#313b49", 2);
        for (const t of [0.24, 0.66]) {
          const fastenerX = Math.round(w * 0.086 * t), fastenerY = Math.round(h * (0.32 + 0.42 * t));
          ctx.fillStyle = "#242e3c";
          ctx.fillRect(fastenerX, fastenerY, 3, 3);
          ctx.fillStyle = "#a0aaa1";
          ctx.fillRect(fastenerX, fastenerY, 2, 1);
        }
        const lip = y + 31 * scale;
        const outer = lip - Math.min(14 * scale, x * 0.16);
        polygon(ctx, [[0, outer], [x, lip], [x + 1, h], [0, h]], "#414b59");
        polygon(ctx, [[0, outer + 8 * scale], [x, lip + 8 * scale], [x, h], [0, h]], "#2b3443");
        line(ctx, 0, outer, x, lip, "#202634", Math.max(1, Math.round(3 * scale)));
        line(ctx, 0, outer + 3 * scale, x, lip + 3 * scale, "#98a39b");
        const seam = Math.round(x - 10 * scale);
        line(ctx, seam, lip + 7 * scale, seam - 7 * scale, h, "#171f2e", 2);
        line(ctx, seam + 2, lip + 8 * scale, seam - 5 * scale, h, "#65717b");
        // The vent is recessed below the lip, away from the sightline.
        const ventY = Math.round(lip + 17 * scale);
        for (let vx = 6 * scale; vx < seam - 8 * scale; vx += 6 * scale) {
          line(ctx, vx, ventY + 6 * scale, vx + 3 * scale, ventY, "#17232d", 2);
          line(ctx, vx + 2, ventY + 6 * scale, vx + 4 * scale, ventY + 2, "#56636b");
        }
        ctx.restore();
      }
    }
    ctx.fillStyle = "#353a49";
    ctx.fillRect(Math.floor(x), Math.floor(y + ph - 1), Math.ceil(pw), Math.max(0, Math.ceil(h - y - ph + 1)));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(panelCanvas, sourceX, 0, sourceWidth, 88, Math.round(x), Math.round(y), Math.ceil(pw), Math.ceil(ph));

    for (const [text, cx, cy, color, inset] of captions) {
      const px = Math.round(x + (cx - sourceX) * scale), py = Math.round(y + cy * scale) - 3;
      if (inset) {
        const width = typeWidth(text);
        ctx.fillStyle = "#162631";
        ctx.fillRect(Math.round(px - width / 2) - 1, py - 1, width + 2, 9);
      }
      cockpitType(ctx, text, px, py, color);
    }

    // Paint this readout at the canvas pixel pitch so the numbers survive
    // narrow screens and adaptive resolution. It sits on the glare shield.
    const readoutWidth = Math.min(144, Math.floor(displayWidth) - 2);
    const left = Math.round(center - readoutWidth / 2), top = Math.round(y + 14 * scale - 17);
    ctx.fillStyle = "#87918a";
    ctx.fillRect(left - 1, top - 1, readoutWidth + 2, 19);
    ctx.fillStyle = "#202d37";
    ctx.fillRect(left, top, readoutWidth, 17);
    const readouts = [["SHIELD", e.shield, e.frame.maxShield, "#8dd7da"], ["HULL", e.hull, e.frame.maxHull, "#f7b181"]];
    readouts.forEach(([name, value, maximum, color], i) => {
      const width = Math.floor(readoutWidth / 2) - 8, x = left + 4 + i * Math.floor(readoutWidth / 2);
      const caption = width < 55 ? (i === 0 ? "SHD" : "HUL") : name;
      cockpitType(ctx, caption, x, top + 2, "#e9f0df", "left");
      cockpitType(ctx, Math.round(value), x + width, top + 2, color, "right");
      ctx.fillStyle = "#48535b";
      ctx.fillRect(x, top + 11, width, 4);
      ctx.fillStyle = color;
      ctx.fillRect(x, top + 11, Math.round(width * saturate(value / maximum)), 4);
    });
  }

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function boostVibration(ctx, g) {
    if (!g.player.boost || g.view === 2 || reducedMotion.matches) return;
    // One internal pixel of airframe movement. The world, sights and flight physics stay steady.
    const t = g.time;
    const x = Math.round(0.57 * Math.sin(t * 48) + 0.2 * Math.sin(t * 31));
    const y = Math.round(0.83 * Math.sin(t * 56));
    ctx.translate(x, y);
  }

  // Repeat a seeded volume in world space so the rain follows the bank and camera changes.
  const rainSpan = 112;
  const rainDrops = (() => {
    let seed = 1601;
    function coordinate() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed * (rainSpan / 4294967296);
    }
    return Array.from({length: 780}, () => [coordinate(), coordinate(), coordinate()]);
  })();
  function drawRain(ctx, g, cam, project, forward) {
    const wrap = v => v - rainSpan * Math.floor(v / rainSpan + .5);
    const time = g.time, speed = g.player.speed;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    const tailX = (speed * forward[0] - 11) * .014;
    const tailY = (speed * forward[1] + 45) * .014;
    const tailZ = (speed * forward[2] - 3) * .014;
    for (const drop of rainDrops) {
      const x = cam.x + wrap(drop[0] + time * 11 - cam.x);
      const y = cam.y + wrap(drop[1] - time * 45 - cam.y);
      const z = cam.z + wrap(drop[2] + time * 3 - cam.z);
      const p = project(x, y, z);
      if (!p || p.d < 6 || p.x < -5 || p.x > w + 5 || p.y < -5 || p.y > h + 5) continue;
      const tail = project(x + tailX, y + tailY, z + tailZ);
      if (!tail) continue;
      const dx = tail.x - p.x, dy = tail.y - p.y;
      const scale = Math.min(1, 8 / (Math.max(Math.abs(dx), Math.abs(dy)) || 1));
      ctx.globalAlpha = p.d < 23 ? .62 : .33;
      line(ctx, p.x, p.y, p.x + dx * scale, p.y + dy * scale, "#c0d1da");
    }
    ctx.globalAlpha = 1;
  }

  function draw(ctx, g, cam, project) {
    const w = ctx.canvas.width,
      h = ctx.canvas.height,
      p = g.player,
      b = basis(p);
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    const trail = trailState(g, b),
      blend = g.cockpitBlend || 0;
    const inScreen = (a, margin) => a && a.x > -margin && a.x < w + margin && a.y > -margin && a.y < h + margin;
    if (p.hull > 0) shadow(ctx, g, b, project);
    drawTrails(ctx, g, trail, project);
    const objects = [];
    for (const e of g.enemies) {
      const a = project(e.x, e.y, e.z);
      if (inScreen(a, 80) && visible(g, cam, e)) objects.push({ type: "enemy", e, a, d: a.d });
    }
    for (const e of g.allies || []) {
      const a = project(e.x, e.y, e.z);
      if (inScreen(a, 60) && visible(g, cam, e)) objects.push({ type: "ally", e, a, d: a.d });
    }
    for (const s of g.shots) {
      const a = project(s.x, s.y, s.z);
      if (inScreen(a, 36)) objects.push({ type: "shot", e: s, a, d: a.d });
    }
    for (const fx of g.particles) {
      const a = project(fx.x, fx.y, fx.z);
      if (inScreen(a, 42)) objects.push({ type: "fx", e: fx, a, d: a.d });
    }
    for (const e of g.wisps || []) {
      const a = project(e.x, e.y, e.z);
      if (inScreen(a, 14)) objects.push({ type: "wisp", e, a, d: a.d });
    }
    if (g.pickup) {
      const e = g.pickup, a = project(e.x, e.y, e.z);
      if (inScreen(a, 65) && visible(g, cam, e)) objects.push({ type: "pickup", e, a, d: a.d });
    }
    const pp = project(p.x, p.y, p.z);
    if (pp && blend < 0.52 && p.hull > 0) objects.push({ type: "player", e: p, a: pp, d: pp.d });
    objects.sort((a, b) => b.d - a.d);
    for (const { type, e, a } of objects) {
      if (type === "pickup") {
        drawBeacon(ctx, a, g.time, pickupStyles[e.kind]);
        continue;
      }
      if (type === "fx") {
        paintFx(ctx, a, e, project);
        continue;
      }
      if (type === "shot") {
        paintShot(ctx, project, e, g.time);
        continue;
      }
      if (type === "wisp") {
        const r = clamp(a.k * 1.15, 1, 6);
        const x = a.x,
          y = a.y;
        polygon(
          ctx,
          [
            [x - r * 2, y],
            [x, y - r],
            [x + r * 2, y],
            [x, y + r],
          ],
          "#a87448",
        );
        disc(ctx, x, y, r * 0.65, "#ffe69a");
        continue;
      }
      if (type === "player") {
        ctx.save();
        boostVibration(ctx, g);
        ctx.globalAlpha = 1 - saturate((blend - 0.12) / 0.4);
        const model = playerModels[e.frame.id];
        drawMesh(ctx, e, model.mesh.concat(exhaustMesh(model.nozzle, g.time, e.boost)), b, project, e.missiles, g.world.night);
        if (g.world.night || g.world.storm) nightLights(ctx,e,b,project,g.time);
        ctx.restore();
        continue;
      }
      const carrier = e.kind === "carrier", friendly = type === "ally";
      const fighter = friendly || e.kind === "jet" || e.kind === "interceptor";
      if (friendly) {
        const y = a.y - Math.max(5, Math.round(a.k * 5));
        line(ctx, a.x - 3, y, a.x, y - 2, "#26455f", 2);
        line(ctx, a.x, y - 2, a.x + 3, y, "#26455f", 2);
        line(ctx, a.x - 3, y, a.x, y - 2, azure[3]);
        line(ctx, a.x, y - 2, a.x + 3, y, azure[3]);
      }
      if (fighter) {
        drawTrails(ctx, g, trailState(g, basis(e), e), project, e);
      }
      if (e.boat) boatWake(ctx, g, e, project);
      if (a.k * (carrier ? 50 : e.kind === "bomber" || e.boat ? 23 : 8) < 4) {
        compactAircraft(ctx, a, e, g.world.night, friendly);
        if (e.kind === "prism") prismCharge(ctx,e,project);
        continue;
      }
      const ground = e.ground,
        base = ground ? { ...e, y: Math.max(0, g.world.height(e.x, e.z)) } : e;
      const eb = basis(e);
      let mesh = friendly ? friendlyMesh : meshes[e.kind] || rivalMesh;
      if (carrier || fighter)
        mesh = mesh.concat(exhaustMesh(carrier ? carrierNozzle : jetNozzle, g.time, false));
      drawMesh(ctx, base, mesh, eb, project, 0, g.world.night);
      if (e.kind === "prism") prismCharge(ctx,e,project);
      if ((g.world.night || g.world.storm) && !ground && !e.boat) nightLights(ctx,e,eb,project,g.time);
    }
    if (g.world.storm) drawRain(ctx, g, cam, project, b.f);
    if (g.state !== "title") {
      if (blend > 0.04) {
        ctx.globalAlpha = blend;
        flightHud(ctx, g, cam, project);
        ctx.globalAlpha = blend;
        ctx.save();
        boostVibration(ctx, g);
        panel(ctx, g, cam.cockpitSpace);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
      cues(ctx, g, cam, project, b);
      if (g.state === "playing" && blend < 0.5 && g.terrainWarning && Math.sin(g.time * 9) > -0.25) {
        const y = Math.round(h * 0.39);
        ctx.fillStyle = "#482e34";
        ctx.fillRect(Math.round(w / 2) - 17, y - 2, 34, 9);
        label(ctx, "PULL UP", Math.round(w / 2), y, "#ffd080", "center");
      }
      if (g.rapidFireRemaining > 0) {
        const style = pickupStyles.rapid;
        const text = "RAPID FIRE " + Math.ceil(g.rapidFireRemaining) + "S";
        const cockpit = blend > 0.5;
        const width = (cockpit ? typeWidth(text) : text.length * 4) + 13;
        const x = w - width - 5, y = Math.round(h * 0.27);
        ctx.fillStyle = style.dark;
        ctx.fillRect(x, y, width, 11);
        pickupGlyph(ctx, style.symbol, x + 5, y + 5, 1, style.light);
        if (cockpit) cockpitType(ctx, text, x + 11, y + 2, style.light, "left");
        else label(ctx, text, x + 11, y + 3, style.light);
      }
      if (p.hitFlash > 0.04) {
        const shield = p.shield > 0,
          col = shield ? "#82def3" : "#ff845e";
        ctx.globalAlpha = p.hitFlash * 0.74;
        ctx.fillStyle = col;
        for (const x of [0, w - 2])
          for (let j = 0; j < 7; j++) ctx.fillRect(x, Math.round(h * (0.25 + j * 0.08)), 2, Math.ceil(h * 0.044));
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
  function aircraftPortrait(id) {
    const canvas = document.createElement("canvas");
    canvas.width = 144;
    canvas.height = 64;
    canvas.setAttribute("aria-hidden", "true");
    const ctx = canvas.getContext("2d");
    const model = playerModels[id];
    const plane = {x: 0, y: 0, z: 0, yaw: 1.05};
    const scale = id === "manta" ? 2.9 : 3.65;
    const project = (x,y,z) => ({x: 72 + x * scale, y: 32 - (y * .71 + z * .70) * scale, d: z * .71 - y * .70});
    drawMesh(ctx, plane, model.mesh, basis(plane), project, 4, false);
    return canvas;
  }
  window.PatrolArt = { draw, aircraftPortrait };
})();
