/* Procedural terrain and cumulus maps are built once. CPU flight and GPU tracing
   read the same quantized elevation data, including the raised forest canopy. */
window.SplashOneWorld = (() => {
  const SIZE = 1024,
    SPAN = 8192,
    MIN = -256,
    RANGE = 1536;

  const islandCenter = { x: -180, z: 1530 };

  function generate(size, span, min, range, region, islandOrigin, progress, finish) {
    const mesa = region === "mesa", island = region === "island";
    const mix = (a, b, t) => a + (b - a) * t;
    const sat = (x) => Math.max(0, Math.min(1, x));
    const smooth = (x) => ((x = sat(x)), x * x * (3 - 2 * x));
    const tau = 2 * Math.PI;
    const hash = (x, z, seed) => {
      let n = Math.imul(x + seed * 71, 374761393) + Math.imul(z + seed, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const noise = (u, v, freq, seed) => {
      let x = u * freq,
        z = v * freq,
        ix = Math.floor(x),
        iz = Math.floor(z);
      const a = smooth(x - ix),
        b = smooth(z - iz);
      ix = ((ix % freq) + freq) % freq;
      iz = ((iz % freq) + freq) % freq;
      const j = (ix + 1) % freq,
        k = (iz + 1) % freq;
      return mix(mix(hash(ix, iz, seed), hash(j, iz, seed), a), mix(hash(ix, k, seed), hash(j, k, seed), a), b);
    };
    const wrap = (n) => n - Math.round(n / span) * span;
    const field = new Float32Array(size * size),
      biome = new Float32Array(size * size);
    const peaks = [
      [1550, 3470, 1290, 1030, 780],
      [-1420, 2960, 950, 1400, 670],
      [2850, -2520, 1160, 1350, 790],
      [-3050, -1880, 1380, 1900, 760],
      [3580, 930, 1660, 1140, 485],
      [-1780, -930, 810, 1020, 340],
    ];
    const islands = [
      [-220, 1150, 172, 240, 144],
      [230, 2250, 350, 270, 175],
      [180, -1100, 195, 360, 160],
      [-290, -2600, 180, 280, 170],
    ];
    // Broad caprock shelves alternate with slender isolated buttes. The river
    // meanders through the middle; all distances wrap across the tile seam.
    const mesas = [
      [-960, 980, 625, 400, 323], [900, 1330, 460, 355, 366],
      [-430, 2620, 285, 200, 463], [-620, 2570, 145, 150, 603],
      [870, 2780, 570, 490, 425], [1190, 2790, 174, 185, 590],
      [-2500, 2300, 960, 720, 430], [2880, -1500, 880, 950, 550],
      [-1820, -1120, 730, 670, 360], [-420, -2580, 300, 246, 500],
      [1350, -3230, 740, 420, 480], [-2850, -2750, 410, 385, 640],
    ];
    function canyonHeight(x, z, angle, broad, hills, detail) {
      const river = 410 * Math.sin(2 * angle) + 240 * Math.sin(5 * angle) + 145 * (1 - Math.cos(angle));
      const shore = Math.abs(wrap(x - river)) - (150 + 40 * Math.sin(3 * angle + .6)) + (detail - .5) * 38;
      const rise = sat(shore / 260);
      const floor = Math.max(-65, Math.min(57, shore * .24)) + rise * (broad * 50 + hills * 20);
      if (shore < 0) return floor;
      let rock = 0;
      for (const [cx, cz, rx, rz, top] of mesas) {
        const dx = Math.abs(wrap(x - cx)) / rx, dz = Math.abs(wrap(z - cz)) / rz;
        if (dx > 1.7 || dz > 1.7) continue;
        const d = Math.max(dx, dz) + .28 * Math.min(dx, dz) + (hills - .5) * .19 + (detail - .5) * .055;
        const skirt = .26 * smooth((1.65 - d) / .78);
        const wall = .50 * smooth((1.01 - d) / .20);
        const rim = .24 * smooth((.83 - d) / .12);
        rock = Math.max(rock, (skirt + wall + rim) * top);
      }
      const terrace = rock / 29;
      return floor + rise * (Math.floor(terrace) + smooth(terrace % 1)) * 29;
    }
    function islandHeight(x, z, hills, detail) {
      const u = (x - islandOrigin.x) / 1480, v = (z - islandOrigin.z) / 1200;
      const angle = Math.atan2(v, u);
      // One radius per bearing connects every headland to the interior.
      const coast = 1 + .13 * Math.sin(angle * 3) + .09 * Math.cos(angle * 2 - .4)
        + .085 * Math.sin(angle * 5) + .035 * Math.cos(angle * 9);
      const inland = (coast - Math.hypot(u, v)) * 1200;
      if (inland <= 0) {
        const depth = -inland;
        return -Math.min(180, depth * .085 + Math.max(0, depth - 150) * .48);
      }
      const summit = Math.max(0, 1 - Math.hypot((u + .23) * 1.28, (v - .12) * 1.75));
      const saddle = Math.max(0, 1 - Math.hypot((u - .34) * 1.65, (v + .12) * 2.35));
      const ridge = 550 * summit * summit + 315 * saddle * saddle;
      return Math.min(26, inland * .135) + smooth(inland / 315) *
        (ridge * (.83 + hills * .29) + 60 * hills + 32 * detail);
    }
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const u = (i + 0.5) / size,
          v = (j + 0.5) / size,
          x = wrap(u * span),
          z = wrap(v * span),
          angle = v * tau;
        const hills = noise(u, v, 9, 13),
          detail = noise(u, v, 32, 33),
          n = noise(u, v, 4, 7);
        if (mesa) {
          const k = j * size + i;
          field[k] = canyonHeight(x, z, angle, n, hills, detail);
          biome[k] = hills * .55 + detail * .45;
          continue;
        }
        if (island) {
          const k = j * size + i;
          const h = islandHeight(x, z, hills, detail);
          const grove = .62 * hills + .38 * detail;
          const crown = hash(i >> 1, j >> 1, 37);
          const wooded = h > 15 && h < 323 && grove > .34;
          field[k] = h + (wooded ? 5 + 8 * crown : 0);
          biome[k] = wooded ? .48 + .31 * grove + .15 * crown : .3 * grove;
          continue;
        }
        const center = 365 * Math.sin(angle) + 260 * Math.sin(2 * angle) + 290 * (Math.cos(angle) - 1);
        const shore =
          Math.abs(wrap(x - center)) -
          (620 + 170 * Math.cos(2 * angle) + 155 * Math.sin(3 * angle)) +
          (n - 0.5) * 700 +
          (hills - 0.5) * 375 +
          (detail - 0.5) * 86;
        let h = Math.max(-120, shore * 0.245) + (hills - 0.5) * 12;
        if (shore > 0) {
          let peak = 0;
          for (const [px, pz, rx, rz, high] of peaks) {
            const dx = wrap(x - px) / rx,
              dz = wrap(z - pz) / rz;
            peak = Math.max(peak, high * Math.max(0, 1 - 0.7 * Math.hypot(dx, dz)));
          }
          const ridge = 1 - Math.abs(noise(u, v, 14, 16) * 2 - 1);
          h =
            smooth(shore / 490) *
              (58 + 92 * n + 68 * hills + peak * (0.68 + 0.32 * ridge) + (detail - 0.5) * (30 + peak * 0.1)) +
            (1 - smooth(shore / 490)) * h;
        }
        for (const [px, pz, rx, rz, high] of islands) {
          const d = Math.hypot(wrap(x - px) / rx, wrap(z - pz) / rz);
          if (d < 1.6) h = Math.max(h, (1 - d) * high + (detail - 0.5) * 21);
        }
        let woods = noise(u, v, 17, 5) * 0.49 + noise(u, v, 41, 9) * 0.33 + noise(u, v, 7, 19) * 0.18;
        let forest = h > 7 && h < 482 && woods > 0.425;
        // Model crowns as tapered clumps, with occasional taller evergreens.
        const tx = i >> 2,
          tz = j >> 2,
          tree = hash(tx, tz, 61);
        const ox = (i % 4) - (0.65 + hash(tx, tz, 63) * 1.75),
          oz = (j % 4) - (0.65 + hash(tx, tz, 64) * 1.75);
        const distance = Math.hypot(ox, oz);
        const crown = tree > 0.85
          ? Math.max(0, 1 - distance / 1.65)
          : Math.sqrt(Math.max(0, 1 - (distance / (2.2 + tree * 0.9)) ** 2));
        if (forest) h += smooth((woods - 0.425) * 17) * (4 + (tree > 0.85 ? 38 : 23) * crown);
        const k = j * size + i;
        biome[k] = forest ? 0.45 + noise(u, v, 29, 35) * 0.44 + tree * 0.065 + crown * 0.035 : woods * 0.43;
        field[k] = h;
      }
      if (!(j % 32)) progress((0.43 * j) / size);
    }
    const heights = new Uint8Array(size * size * 4),
      surface = new Uint8Array(size * size * 4);
    const at = (i, j) => field[((j + size) & (size - 1)) * size + ((i + size) & (size - 1))];
    const colors = {
      sand: [228, 185, 125],
      meadow: [193, 177, 106],
      grass: [159, 155, 96],
      gold: [245, 184, 61],
      amber: [240, 140, 47],
      orange: [221, 98, 47],
      red: [191, 66, 69],
      pine: [45, 75, 73],
      rock: [155, 141, 151],
      snow: [246, 216, 196],
    };
    const islandColors = {
      beach: [242, 213, 153], grass: [151, 178, 104], wood: [58, 134, 95],
      fern: [112, 162, 92], shade: [37, 104, 88], cliff: [123, 125, 127], crest: [158, 155, 143],
    };
    const strata = [[177, 85, 62], [208, 115, 69], [227, 148, 88], [201, 106, 65],
      [170, 74, 58], [221, 128, 78], [240, 181, 115], [198, 97, 64]];
    const alluvium = [218, 173, 114], sage = [143, 143, 103], riverbank = [224, 193, 135];
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const k = j * size + i,
          idx = k * 4,
          h = field[k],
          b = biome[k],
          grain = hash(i, j, 3);
        const dx = ((at(i + 1, j) - at(i - 1, j)) * size) / (2 * span),
          dz = ((at(i, j + 1) - at(i, j - 1)) * size) / (2 * span);
        const grade = Math.hypot(dx, dz);
        let rgb = colors.sand;
        if (mesa) {
          const layer = Math.floor((h + 18 * Math.sin(j * tau / size * 2) + 12 * b) / 21);
          rgb = strata[(layer % strata.length + strata.length) % strata.length];
          if (h < 8) rgb = riverbank;
          else if (grade < .34 && h < 125) rgb = b < .46 || (b < .66 && grain > .91) ? sage : alluvium;
          else if (grade < .18 && b > .53) rgb = alluvium;
        } else if (island) {
          rgb = h < 13 ? islandColors.beach : islandColors.grass;
          if (b > .44) rgb = b > .79 ? islandColors.shade : b > .70 ? islandColors.wood : islandColors.fern;
          if (h > 315 && (grade > .43 || h > 400)) rgb = h > 428 ? islandColors.crest : islandColors.cliff;
        } else {
          if (h > 5) rgb = b > 0.11 ? colors.meadow : colors.grass;
          if (b > 0.44)
            rgb = b > 0.764 ? colors.red : b > 0.676 ? colors.orange : b > 0.614 ? colors.amber : colors.gold;
          if (
            b > 0.44 &&
            ((hash(i >> 2, j >> 2, 61) > 0.85 && Math.hypot((i % 4) - 1.5, (j % 4) - 1.5) < 1.7) ||
              noise(i / size, j / size, 37, 2) > 0.81)
          )
            rgb = colors.pine;
          // Canopy height contributes to the measured slope; only exposed slopes are rock.
          if (b < 0.44 && (h > 470 || (grade > 0.9 && h > 26))) rgb = colors.rock;
          if (h > 580 + noise(i / size, j / size, 23, 5) * 72 + Math.min(0.95, grade) * 82) rgb = colors.snow;
        }
        let shadow = 0;
        for (let s = 2; s < 155; s = Math.ceil(s * 1.34)) {
          const above = at(i + Math.round(0.34 * s), j + s) - h - ((s * span) / size) * 0.205;
          shadow = Math.max(shadow, sat(above / 23));
        }
        const sun = sat(0.57 - (0.34 * dx + dz) * 0.78 + grain * 0.063);
        const light = Math.floor(sun * 5) / 5;
        const amount = sat(0.28 + 0.74 * light - shadow * 0.43);
        const q = Math.round(sat((h - min) / range) * 65535);
        heights[idx] = q >>> 8;
        heights[idx + 1] = q & 255;
        heights[idx + 2] = Math.round(b * 255);
        heights[idx + 3] = 255;
        for (let c = 0; c < 3; c++) {
          const shade = rgb[c] * [0.54, 0.48, 0.64][c] + [16, 15, 26][c];
          surface[idx + c] = Math.min(255, mix(shade, rgb[c] * 1.08 + (grain - 0.5) * 9, amount));
        }
        surface[idx + 3] = !mesa && b > 0.44 ? 255 : 0;
      }
      if (!(j % 32)) progress(0.43 + (0.31 * j) / size);
    }
    if (mesa) {
      // A conservative upper bound per 64 m block lets rays traverse the empty
      // canyon air without stepping through narrow sandstone spires.
      for (let z = 0; z < size; z += 8) {
        for (let x = 0; x < size; x += 8) {
          let top = 0;
          for (let dz = -1; dz <= 8; dz++)
            for (let dx = -1; dx <= 8; dx++) top = Math.max(top, at(x + dx, z + dz));
          heights[(z * size + x) * 4 + 3] = Math.ceil(255 * sat((top - min) / range));
        }
      }
    }
    // Store a pair of height envelopes and the planar distance to the nearest
    // billow. Rays can skip empty space, including when flying within the deck.
    const cloudSize = 256,
      cloudMap = new Uint8Array(cloudSize * cloudSize * 4),
      puffs = [];
    const clusters = [
      [-1020, 1680, 1.04, 535],
      [1430, 2400, 1.15, 585],
      [60, 3800, 0.85, 365],
      [-2400, 3450, 1.45, 695],
      [2050, 430, 0.8, 198],
      [-2830, -580, 1.25, 225],
      [1220, -1470, 1.27, 286],
      [-950, -2140, 1.3, 252],
      [3400, -2430, 1.6, 350],
      [3200, 2050, 0.8, 91],
      [-2200, 300, 0.65, 85],
      [-230, -3650, 0.72, 110],
      [-3050, -2980, 0.95, 235],
      [480, -620, 0.61, 235],
    ];
    for (let c = 0; c < clusters.length; c++) {
      if (mesa && c % 3 === 0) continue;
      const [cx, cz, width, altitude] = clusters[c];
      const scale = mesa ? width * .76 : width, base = mesa ? altitude + 120 : altitude;
      for (let k = 0; k < 12; k++) {
        const a = hash(c, k, 4) * tau,
          r = k ? Math.sqrt(hash(c, k, 8)) : 0;
        puffs.push([
          cx + Math.cos(a) * r * 425 * scale,
          cz + Math.sin(a) * r * 245 * scale,
          (155 + hash(c, k, 5) * 120) * scale,
          (135 + hash(c, k, 15) * 125) * scale,
          (96 + hash(c, k, 11) * 122) * (1 - r * 0.51) * scale,
          base + (1 - r) * 22,
        ]);
      }
    }
    for (let j = 0; j < cloudSize; j++) {
      for (let i = 0; i < cloudSize; i++) {
        const x = ((i + 0.5) * span) / cloudSize,
          z = ((j + 0.5) * span) / cloudSize;
        let dist = 1800,
          top = -1,
          bottom = 1020;
        for (const [px, pz, rx, rz, ry, base] of puffs) {
          const dx = wrap(x - px),
            dz = wrap(z - pz);
          if (Math.abs(dx) > 2000 || Math.abs(dz) > 2000) continue;
          const d = Math.hypot(dx / rx, dz / rz),
            edge = (d - 1) * Math.min(rx, rz);
          dist = Math.min(dist, edge);
          if (d < 1.025) {
            const v = Math.sqrt(Math.max(0, 1 - d * d));
            top = Math.max(top, base + ry * v);
            bottom = Math.min(bottom, base - ry * (0.16 + 0.16 * v) * v);
          }
        }
        const idx = 4 * (j * cloudSize + i);
        cloudMap[idx] = Math.round(255 * sat((dist + 500) / 2300));
        cloudMap[idx + 1] = Math.round(255 * sat(top / 1020));
        cloudMap[idx + 2] = Math.round(255 * sat(bottom / 1020));
        cloudMap[idx + 3] = 255;
      }
      if (!(j % 32)) progress(0.74 + (0.25 * j) / cloudSize);
    }
    const levels = 40,
      cloudVolume = new Uint8Array(cloudSize * levels * cloudSize).fill(255);
    const cell = span / cloudSize,
      layer = 1020 / levels;
    for (const [px, pz, rx, rz, ry, base] of puffs) {
      const skirt = 130;
      for (let k = Math.floor((pz - rz - skirt) / cell); k <= Math.ceil((pz + rz + skirt) / cell); k++) {
        const dz = ((k + 0.5) * cell - pz) / rz;
        for (let i = Math.floor((px - rx - skirt) / cell); i <= Math.ceil((px + rx + skirt) / cell); i++) {
          const dx = ((i + 0.5) * cell - px) / rx;
          const horizontal = dx * dx + dz * dz;
          for (
            let j = Math.max(0, Math.floor((base - ry * 0.46 - skirt) / layer));
            j <= Math.min(levels - 1, Math.ceil((base + ry + skirt) / layer));
            j++
          ) {
            const dy = (j + 0.5) * layer - base,
              hy = dy < 0 ? ry * 0.46 : ry;
            const d = (Math.sqrt(horizontal + (dy / hy) ** 2) - 1) * Math.min(rx, rz, hy);
            const idx = ((k & (cloudSize - 1)) * levels + j) * cloudSize + (i & (cloudSize - 1));
            const old = cloudVolume[idx] - 92;
            // A soft union rounds the joins between adjacent cloud lobes.
            const blend = Math.max(0, 26 - Math.abs(old - d));
            cloudVolume[idx] = Math.round(
              Math.max(0, Math.min(255, 92 + Math.min(old, d) - (blend * blend) / 104)),
            );
          }
        }
      }
    }
    finish({ heights, surface, cloudMap, cloudSize, cloudVolume, levels });
  }

  const vertex = `#version 300 es
  void main(){
    vec2 v=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
    gl_Position=vec4(v*2.-1.,0,1);
  }`;
  const frag = `#version 300 es
  precision highp float;
  uniform vec2 resolution;
  uniform vec3 pos,rt,up,fw;
  uniform float fov,tm;
  uniform bool mesa,island,night,storm;
  uniform sampler2D elev,land,cloud;
  uniform highp sampler3D volume;
  out vec4 outColor;
  const float tile=8192.;
  const vec3 sunDir=vec3(.247,.207,.947);
  float heightAt(vec2 p){
    if(island && any(greaterThan(abs(p),vec2(tile*.5))))return -180.;
    vec2 h=texture(elev,p/tile).rg;
    return -256.+1536.*dot(h,vec2(65280.,255.))/65535.;
  }
  float dither(){
    ivec2 px=ivec2(gl_FragCoord.xy)&3;
    int b[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
    return (float(b[px.y*4+px.x])+.5)/16.;
  }
  float hash(vec2 p){return fract(sin(dot(mod(p,1024.),vec2(83.21,27.13)))*4375.83);}
  float noise(vec2 p){
    vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
  }
  vec3 horizon(vec3 rd){
    float facing=smoothstep(-.45,.99,dot(normalize(rd.xz+vec2(.00001)),normalize(sunDir.xz)));
    if(storm) return mix(vec3(.35,.42,.51),vec3(.62,.67,.69),facing);
    if(night) return mix(vec3(.12,.155,.30),vec3(.25,.33,.48),facing);
    if(island) return mix(vec3(.53,.76,.82),vec3(1.,.84,.64),facing);
    if(mesa) return mix(vec3(.63,.74,.77),vec3(1.,.79,.59),facing);
    return mix(vec3(.72,.64,.79),vec3(1.,.77,.57),facing);
  }
  vec3 sky(vec3 rd,float b){
    vec3 hor=horizon(rd);
    float a=max(0.,rd.y);
    if(storm){
      // A broad ceiling sits behind the lower, navigable cloud banks.
      vec2 sheet=(pos.xz-vec2(9.,2.)*tm+rd.xz*(1800./max(.09,a+.07)))*.00047;
      float folds=.65*noise(sheet*vec2(.78,1.5))+.26*noise(sheet*3.2)+.09*noise(sheet*7.);
      float rim=smoothstep(.33,.78,folds);
      vec3 ceiling=mix(vec3(.105,.135,.21),vec3(.39,.445,.50),floor(rim*5.+b)/5.);
      return mix(hor,ceiling,smoothstep(-.025,.24,a));
    }
    if(night){
      vec3 moon=normalize(vec3(.247,.31,.947));
      vec3 col=mix(hor,vec3(.061,.079,.188),smoothstep(.015,.38,a));
      col=mix(col,vec3(.035,.045,.13),smoothstep(.25,.95,a));
      // Anchor stars to celestial longitude and altitude so they stay fixed through banks.
      vec2 uv=vec2((atan(rd.x,rd.z)/6.2831853+.5)*640.,asin(clamp(rd.y,-1.,1.))*100.);
      vec2 cell=floor(uv); cell.x=mod(cell.x,640.);
      float seed=hash(cell);
      vec2 star=vec2(.25+.5*hash(cell+9.),.25+.5*hash(cell+23.));
      float radius=seed>.994?.28:.17;
      if(seed>.968 && distance(fract(uv),star)<radius && a>.035)
        col+=mix(vec3(.37,.44,.57),vec3(.85,.81,.66),seed)*smoothstep(.035,.16,a);
      float d=distance(rd,moon);
      col+=vec3(.13,.16,.20)*(1.-smoothstep(.035,.18,d));
      if(d<.042){
        bool lit=distance(rd,normalize(moon+vec3(.019,.011,-.006)))>.039;
        col=lit?vec3(.92,.94,.84):vec3(.165,.215,.34);
      }
      return col;
    }
    vec3 col=mix(hor,mesa?vec3(.51,.75,.79):vec3(.61,.64,.83),smoothstep(.03,.47,a));
    col=mix(col,mesa?vec3(.19,.54,.66):vec3(.28,.46,.69),smoothstep(.22,.99,a));
    float sun=distance(rd,sunDir);
    col=mix(col,vec3(1.,.827,.535),.73*(1.-smoothstep(.035,.32,sun)));
    if(rd.y>.053){
      vec2 plane=rd.xz/(rd.y+.025);
      float strands=noise(plane*vec2(.72,9.)+vec2(tm*.005,2.))
                    +.27*noise(plane*vec2(1.4,25.));
      col=mix(col,vec3(1.,.81,.77),.42*smoothstep(.85,1.05,strands)*smoothstep(.05,.17,a));
    }
    if(sun<.052) col=sun<.045?vec3(1.,.946,.718):vec3(1.,.88,.58);
    return col;
  }
  float traceGround(vec3 ro,vec3 rd){
    if(rd.y>.0 && ro.y>925.)return 16000.;
    float t=1.,old=0.;
    if(mesa){
      vec2 inv=1./max(abs(rd.xz),vec2(.000001));
      vec2 side=step(vec2(0.),rd.xz);
      for(int i=0;i<330;i++){
        vec3 p=ro+rd*t;
        if(t>14500. || (rd.y>=0. && p.y>925.))break;
        vec2 block=floor(p.xz/64.);
        vec2 gaps=abs((block+side)*64.-p.xz)*inv;
        if(abs(rd.x)<.000001)gaps.x=16000.;
        if(abs(rd.z)<.000001)gaps.y=16000.;
        float exitT=min(gaps.x,gaps.y)+.025;
        ivec2 sampleAt=ivec2(mod(block,128.))*8;
        float top=-256.+texelFetch(elev,sampleAt,0).a*1536.+1.;
        if(min(p.y,p.y+rd.y*exitT)>top){old=t;t+=exitT;continue;}
        float sep=p.y-max(0.,heightAt(p.xz));
        if(sep<.6+t*.00016){
          float lo=old,hi=t;
          for(int j=0;j<6;j++){
            float mid=(lo+hi)*.5;vec3 q=ro+rd*mid;
            if(q.y>max(0.,heightAt(q.xz)))lo=mid;else hi=mid;
          }
          return hi;
        }
        old=t;
        t+=min(exitT,max(3.2,sep/(7.+abs(rd.y))));
      }
      return 16000.;
    }
    for(int i=0;i<106;i++){
      vec3 p=ro+rd*t;
      float sep=p.y-max(0.,heightAt(p.xz));
      if(sep<.6+t*.00022){
        float a=old,b=t;
        for(int j=0;j<5;j++){
          float mid=(a+b)*.5;vec3 q=ro+rd*mid;
          if(q.y>max(0.,heightAt(q.xz)))a=mid;else b=mid;
        }
        return b;
      }
      old=t;
      t+=max(4.+t*.0008,sep/(1.85+max(0.,-rd.y))*.94);
      if(t>14500. || (rd.y>0. && p.y>925.))break;
    }
    return 16000.;
  }
  vec3 water(vec3 p,vec3 rd,float depth,float t,float b){
    float bands=floor(clamp(depth/21.+b*.68,0.,4.));
    vec3 col=mix(vec3(.38,.77,.72),vec3(.125,.335,.468),bands*.25);
    if(mesa) col=mix(vec3(.38,.83,.73),vec3(.095,.46,.48),bands*.25);
    if(island) col=mix(vec3(.38,.86,.77),vec3(.055,.26,.405),bands*.25);
    if(night) col=mix(vec3(.18,.39,.45),vec3(.055,.15,.255),bands*.25);
    if(storm) col=mix(vec3(.34,.53,.55),vec3(.11,.215,.30),bands*.25);
    float fade=1.-smoothstep(750.,3600.,t);
    vec2 wave=p.xz+vec2(tm*5.,tm*2.);
    float sw=sin(wave.y*.12+sin(wave.x*.037)*1.4)+sin(wave.y*.2+wave.x*.006);
    float shore=depth+sw*1.65;
    if(shore<1.7 || (shore<4.2 && sw>1.23))col=night?vec3(.38,.58,.65):vec3(.85,.91,.78);
    if(storm && shore<4.2 && sw>1.12)col=vec3(.64,.72,.74);
    float skim=pow(1.-clamp(-rd.y,.0,1.),5.);
    col=mix(col,horizon(rd),skim*.39);

    float path=pow(max(0.,dot(normalize(rd.xz+vec2(.00001)),normalize(sunDir.xz))),40.)*(1.-smoothstep(.48,.95,-rd.y));
    if(storm) path=0.;
    vec2 pix=p.xz/vec2(32.+t*.008,5.+t*.002);
    float ripple=noise(vec2(pix.x+tm*.45,pix.y+sin(pix.x*.32)*1.3));
    float glint=ripple+sw*.033;
    if(glint>.92-.265*path && b*.3+path>.19) col=mix(col,mix(vec3(.77,.87,.86),night?vec3(.66,.79,.88):vec3(1.,.855,.58),path),.59+.32*path);
    else col+=vec3(.023,.036,.03)*step(.63,ripple)*fade;
    return col;
  }
  float cloudSdf(vec3 p){
    vec2 uv=(p.xz-vec2(tm*(storm?9.:2.),0))/tile;
    float lateral=texture(cloud,uv).r*2300.-500.;
    if(lateral>135.)return lateral*.8;
    float d=texture(volume,vec3(uv.x,p.y/1020.,uv.y)).r*255.-92.;
    return max(d,max(-p.y,p.y-1020.));
  }
  float traceCloud(vec3 ro,vec3 rd,float limit){
    if((ro.y>1020. && rd.y>=0.) || (ro.y<34. && rd.y<=0.))return 16000.;
    float start=1.,end=limit;
    if(abs(rd.y)>.001){
      float a=(34.-ro.y)/rd.y,b=(1020.-ro.y)/rd.y;
      start=max(start,min(a,b));end=min(end,max(a,b));
    }
    float t=start;
    for(int i=0;i<57;i++){
      if(t>=end || t>11000.)break;
      vec3 p=ro+rd*t;
      float d=cloudSdf(p);
      if(d<2.5+t*.00035)return t;
      t+=max(4.,d*.9);
    }
    return 16000.;
  }
  vec3 cloudColor(vec3 p,vec3 rd,float t,float b){
    float stepSize=15.+t*.0013;
    vec2 e=vec2(stepSize,0);
    vec3 n=normalize(vec3(cloudSdf(p+e.xyy)-cloudSdf(p-e.xyy),
                          cloudSdf(p+e.yxy)-cloudSdf(p-e.yxy),
                          cloudSdf(p+e.yyx)-cloudSdf(p-e.yyx))+vec3(.0001));
    float light=dot(n,normalize(vec3(.47,.55,.85)))*.5+.5;
    float edge=pow(clamp(1.+dot(n,rd),0.,1.),3.);
    light+=.13*edge+.055*(noise(p.xz*.018)-.5);
    light=floor(clamp(light*5.+b*.72,0.,5.))/5.;
    vec3 c=mix(vec3(.58,.48,.62),vec3(.96,.69,.62),smoothstep(.02,.64,light));
    c=mix(c,vec3(1.,.894,.762),smoothstep(.49,1.,light));
    if(night) c=mix(vec3(.115,.135,.245),vec3(.41,.47,.59),light);
    if(storm){
      c=mix(vec3(.13,.15,.235),vec3(.32,.365,.44),smoothstep(.05,.72,light));
      c=mix(c,vec3(.56,.60,.63),smoothstep(.62,1.,light));
    }
    return mix(c,horizon(rd),.26*smoothstep(1200.,8500.,t));
  }
  void main(){
    vec2 uv=(gl_FragCoord.xy*2.-resolution)/resolution.y;
    vec3 rd=normalize(fw+fov*(rt*uv.x+up*uv.y));float b=dither();
    float ground=traceGround(pos,rd), vapour=traceCloud(pos,rd,ground);
    vec3 col;
    if(vapour<ground)col=cloudColor(pos+rd*vapour,rd,vapour,b);
    else if(ground<15990.){
      vec3 p=pos+rd*ground; float h=heightAt(p.xz);
      if(h<.45)col=water(p,rd,max(0.,-h),ground,b);
      else {
        vec4 material=texture(land,p.xz/tile);
        col=material.rgb;
        if(mesa && ground<1000.){
          vec2 soil=mod(p.xz,tile);
          float gravel=noise(soil*.16);
          float shale=noise(soil*.021+vec2(0.,p.y*.033));
          col+=(1.-smoothstep(420.,1000.,ground))*
            (step(.77,gravel)*.050-step(.68,shale)*.030-step(.89,gravel)*.14);
        }
        if(material.a>.25 && ground<760.){
          // Small clusters of leaves sit within the larger, sunlit crown.
          vec2 leafUV=floor(mod(p.xz,tile)*2.)*.5;
          float leaves=noise(leafUV*.31+vec2(p.y*.13,0.))+.46*noise(leafUV*.72);
          float lit=smoothstep(.51,1.04,leaves);
          float amount=material.a*(1.-smoothstep(280.,760.,ground));
          col+=amount*(floor(lit*3.99)/3.-.46)*vec3(.23,.14,.064);
        }
      }
      if(night && h>=.45){
        float brightness=dot(col,vec3(.30,.54,.16));
        col=vec3(.032,.050,.105)+col*vec3(.20,.29,.43)+brightness*vec3(.09,.11,.19);
      }
      if(storm && h>=.45){
        float brightness=dot(col,vec3(.30,.54,.16));
        col=mix(col,vec3(brightness),.28)*vec3(.57,.65,.76)+vec3(.034,.054,.09);
      }
      vec2 shadowUV=(p.xz+sunDir.xz*max(0.,230.-h)*2.6-vec2(tm*(storm?9.:2.),0))/tile;
      float occ=1.-smoothstep(.168,.231,texture(cloud,shadowUV).r);
      col=mix(col,col*vec3(.69,.68,.83),occ*.45);
      float haze=1.-exp(-ground*(storm?.00038:.000214));
      col=mix(col,horizon(rd),haze*.88);
    }else col=sky(rd,b);
    // Quantize both illumination and haze onto a common ordered pixel lattice.
    outColor=vec4(floor(clamp(col,0.,1.)*30.+b)/30.,1.);
  }`;

  function maps(onProgress, mapId) {
    return new Promise((resolve, reject) => {
      const body =
        "(" +
        generate.toString() +
        ")(" +
        [SIZE, SPAN, MIN, RANGE, JSON.stringify(mapId), JSON.stringify(islandCenter)].join(",") +
        ",v=>postMessage(v),m=>postMessage(m,[m.heights.buffer,m.surface.buffer,m.cloudMap.buffer,m.cloudVolume.buffer]));";
      const url = URL.createObjectURL(new Blob([body], { type: "text/javascript" }));
      const worker = new Worker(url);
      function clean() {
        worker.terminate();
        URL.revokeObjectURL(url);
      }
      worker.onerror = (e) => {
        clean();
        reject(new Error(e.message || "Terrain worker failed"));
      };
      worker.onmessage = ({ data }) => {
        if (typeof data === "number") onProgress(data);
        else {
          clean();
          resolve(data);
        }
      };
    });
  }
  function uploadTerrain(gl, data) {
    const program = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, frag],
    ]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(sh));
      gl.attachShader(program, sh);
      gl.deleteShader(sh);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const tex = [];
    for (const [unit, key, name, size, filter] of [
      [0, "heights", "elev", SIZE, gl.LINEAR],
      [1, "surface", "land", SIZE, gl.LINEAR],
      [2, "cloudMap", "cloud", data.cloudSize, gl.LINEAR],
    ]) {
      const t = gl.createTexture();
      tex.push(t);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data[key]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.uniform1i(gl.getUniformLocation(program, name), unit);
    }
    const volume = gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_3D, volume);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.R8,
      data.cloudSize,
      data.levels,
      data.cloudSize,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      data.cloudVolume,
    );
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, "volume"), 3);
    const loc = Object.fromEntries(
      ["resolution", "pos", "rt", "up", "fw", "fov", "tm", "mesa", "island", "night", "storm"].map((k) => [k, gl.getUniformLocation(program, k)]),
    );
    return { program, tex, volume, loc };
  }
  async function create(canvas, onProgress = () => {}, mapId = "lake") {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("Splash One needs WebGL 2 to draw the world.");
    const data = await maps(onProgress, mapId);
    let graphics = gl.isContextLost() ? null : uploadTerrain(gl, data);
    function height(x, z) {
      if (mapId === "island" && (Math.abs(x) > SPAN / 2 || Math.abs(z) > SPAN / 2)) return -180;
      const fx = (x * SIZE) / SPAN - 0.5,
        fz = (z * SIZE) / SPAN - 0.5,
        i = Math.floor(fx),
        j = Math.floor(fz),
        a = fx - i,
        b = fz - j;
      const sample = (u, v) => {
        const idx = 4 * ((v & (SIZE - 1)) * SIZE + (u & (SIZE - 1)));
        return MIN + (RANGE * (data.heights[idx] * 256 + data.heights[idx + 1])) / 65535;
      };
      return (
        (sample(i, j) * (1 - a) + sample(i + 1, j) * a) * (1 - b) +
        (sample(i, j + 1) * (1 - a) + sample(i + 1, j + 1) * a) * b
      );
    }
    let sky = "day";
    onProgress(1);
    function cloudTop(x, z, time = 0) {
      const size = data.cloudSize;
      const i = Math.floor(((x - time * (sky === "storm" ? 9 : 2)) * size) / SPAN) & (size - 1),
        j = Math.floor((z * size) / SPAN) & (size - 1);
      const idx = 4 * (j * size + i);
      return (data.cloudMap[idx] * 2300) / 255 - 500 < 0 ? (data.cloudMap[idx + 1] * 1020) / 255 : null;
    }
    return {
      height,
      cloudTop,
      waterLevel: 0,
      mapId,
      islandCenter: mapId === "island" ? islandCenter : null,
      get night() { return sky === "night"; },
      get storm() { return sky === "storm"; },
      setSky(value) { sky = value; },
      restoreGraphics() {
        graphics = uploadTerrain(gl, data);
      },
      dispose() {
        if (!graphics) return;
        const { tex, volume, program } = graphics;
        for (const texture of tex) gl.deleteTexture(texture);
        gl.deleteTexture(volume);
        gl.deleteProgram(program);
      },
      render(cam, time) {
        if (!graphics) return;
        const { program, tex, volume, loc } = graphics;
        gl.useProgram(program);
        for (let unit = 0; unit < tex.length; unit++) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, tex[unit]);
        }
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_3D, volume);
        gl.uniform1i(loc.mesa, mapId === "mesa");
        gl.uniform1i(loc.island, mapId === "island");
        gl.uniform1i(loc.night, sky === "night");
        gl.uniform1i(loc.storm, sky === "storm");
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(loc.resolution, canvas.width, canvas.height);
        gl.uniform3f(loc.pos, cam.x, cam.y, cam.z);
        gl.uniform3fv(loc.rt, cam.right);
        gl.uniform3fv(loc.up, cam.up);
        gl.uniform3fv(loc.fw, cam.forward);
        gl.uniform1f(loc.fov, cam.tan);
        gl.uniform1f(loc.tm, time);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }
  return { create };
})();
