/* =========================================================
   Commit City — my GitHub repos as a Tron-style skyline.
   One building = one repo. One floor = one of my commits.
   Data: data/city.js, refreshed every 6 hours by
   .github/workflows/commit-city.yml (tools/commit-city/build.js).
   A crane builds the next floor on the repo I committed to last.
   Built with Three.js (r128 UMD build, loaded in index.html).
   ========================================================= */

(function commitCity() {
  "use strict";

  const canvas = document.getElementById("city-canvas");
  if (!canvas || !window.THREE) return;

  /* ---------- tuning ---------- */
  const CYAN = 0x66d9ff, PURPLE = 0xb388ff, ORANGE = 0xff9e3d, BG = 0x03050b;
  const FLOOR_H = 1.0;        // height of one floor (one commit)
  const MAX_FLOORS = 60;      // above this, extra commits become a spire
  const LOT = 12;             // lot pitch along the street
  const ROAD = 8;             // extra gap for a cross street
  const BLOCK = 3;            // lots per block between cross streets
  const ROW_Z = [-8, 8];      // back row, front row
  const LANES = [19, 0, -19]; // avenue, alley, back street (z)
  const FOV = 30, ELEV = 40 * Math.PI / 180, YAW = 0.6;
  const CYCLE = 12.5;         // seconds per crane lift
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stage = canvas.parentElement;
  // Layout set here, not only in CSS: if a stale stylesheet is cached, the canvas
  // must still not size the stage, or each resize would grow it again.
  if (getComputedStyle(stage).position === "static") stage.style.position = "relative";
  stage.style.overflow = "hidden";
  Object.assign(canvas.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%", display: "block" });
  if (stage.clientHeight < 200 || stage.clientHeight > 1200) stage.style.height = "520px";
  const labelLayer = stage.querySelector(".city-labels");
  const card = stage.querySelector(".city-card");
  const badge = stage.querySelector(".city-badge");
  const hud = stage.querySelector(".city-hud");
  const btnPrev = stage.querySelector(".city-pan-prev");
  const btnNext = stage.querySelector(".city-pan-next");

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- data: oldest on the left, newest on the right ---------- */
  const raw = (window.COMMIT_CITY && window.COMMIT_CITY.repos) || [];
  const user = (window.COMMIT_CITY && window.COMMIT_CITY.user) || "";
  const repos = raw
    .filter((r) => r && r.commits > 0)
    .slice()
    .sort((a, b) => String(a.lastCommit).localeCompare(String(b.lastCommit)));
  const empty = repos.length === 0;

  const colX = (c) => c * LOT + Math.floor(c / BLOCK) * ROAD;
  const lots = repos.map((r, i) => {
    const rnd = seeded(String(r.id));
    const floors = Math.min(r.commits, MAX_FLOORS);
    return {
      repo: r, index: i,
      x: colX(Math.floor(i / 2)), z: ROW_Z[(repos.length - 1 - i) % 2 === 0 ? 1 : 0],
      w: 6 + rnd() * 2.5, d: 6 + rnd() * 2.5,
      floors, extra: r.commits - floors,
      tint: r.private ? PURPLE : CYAN,
    };
  });
  // the newest repo gets the crane; with no data, an empty lot does
  const active = empty
    ? { repo: null, x: 0, z: ROW_Z[1], w: 7, d: 7, floors: 0, extra: 0, tint: ORANGE }
    : lots[lots.length - 1];
  active.tint = ORANGE;
  active.active = true;

  const minX = 0;
  const maxX = empty ? 0 : colX(Math.floor((lots.length - 1) / 2));
  const spireH = (l) => (l.extra > 0 ? 6 + 5 * Math.log2(1 + l.extra / MAX_FLOORS) : 0);
  const slotH = (l) => (l.active ? FLOOR_H : 0);
  const topOf = (l) => l.floors * FLOOR_H + slotH(l) + spireH(l);
  const maxTop = Math.max(14, ...lots.map(topOf), topOf(active) + 12);

  /* ---------- renderer, scene, camera ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(BG, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 2, 1, 2000);
  const DIST = clamp(maxTop * 2.5, 120, 240);
  scene.fog = new THREE.Fog(BG, DIST * 0.75, DIST * 2.3);
  const camTarget = new THREE.Vector3(maxX, maxTop * 0.4, 0);
  let panX = maxX, panGoal = maxX, panVel = 0;

  /* ---------- shared materials ---------- */
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const lineMat = {};
  const glowMat = {};
  for (const c of [CYAN, PURPLE, ORANGE]) {
    lineMat[c] = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.95 });
    glowMat[c] = new THREE.MeshBasicMaterial({ color: c, opacity: 0.07, side: THREE.BackSide, ...add });
  }
  const roofMat = new THREE.MeshBasicMaterial({ color: 0x060a14 });

  // one floor of windows, tiled up the facade: texture.repeat.y = floors
  const facadeBase = {};
  function facadeTexture(tint) {
    if (!facadeBase[tint]) {
      const cv = document.createElement("canvas");
      cv.width = 128; cv.height = 32;
      const g = cv.getContext("2d");
      const hex = "#" + tint.toString(16).padStart(6, "0");
      g.fillStyle = "#070b16"; g.fillRect(0, 0, 128, 32);
      g.fillStyle = hex;
      g.globalAlpha = 0.85; g.fillRect(0, 30, 128, 2);        // floor slab line
      const lit = [0.55, 0.18, 0.4, 0.75];
      for (let i = 0; i < 4; i++) {
        g.globalAlpha = lit[i];
        g.fillRect(i * 32 + 5, 8, 22, 16);
      }
      facadeBase[tint] = cv;
    }
    const t = new THREE.CanvasTexture(facadeBase[tint]);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function facadeMat(tint, width, floors) {
    const t = facadeTexture(tint);
    t.repeat.set(Math.max(1, Math.round(width / 2.2)) / 4, floors);
    return new THREE.MeshBasicMaterial({ map: t });
  }

  /* ---------- ground: dark floor, light grid, glowing roads ---------- */
  const span = maxX - minX + 600;
  const midX = (minX + maxX) / 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, 600), new THREE.MeshBasicMaterial({ color: 0x04070f }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(midX, -0.05, 0);
  scene.add(ground);

  const grid = new THREE.GridHelper(Math.ceil(span / 6) * 6, Math.ceil(span / 6), CYAN, CYAN);
  grid.material.transparent = true;
  grid.material.opacity = 0.09;
  grid.position.set(midX, 0, 0);
  scene.add(grid);

  function lines(points, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return new THREE.LineSegments(g, mat);
  }
  const roadPts = [];
  const x0 = minX - 300, x1 = maxX + 300;
  for (const z of [16, 22, -16, -22, -3.6, 3.6]) roadPts.push(x0, 0.02, z, x1, 0.02, z);
  for (let c = BLOCK; c <= Math.floor(maxX / LOT) + BLOCK * 2; c += BLOCK) {
    const xr = colX(c) - LOT / 2 - ROAD / 2;
    for (const dx of [-ROAD / 2 + 0.6, ROAD / 2 - 0.6]) roadPts.push(xr + dx, 0.02, -22, xr + dx, 0.02, 22);
  }
  scene.add(lines(roadPts, new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.45 })));
  const dashPts = [];
  for (let x = x0; x < x1; x += 5) dashPts.push(x, 0.03, 19, x + 2.2, 0.03, 19, x, 0.03, -19, x + 2.2, 0.03, -19);
  scene.add(lines(dashPts, new THREE.LineBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.35 })));

  // far mountain ridge, Tron: Legacy style (not fogged)
  const ridge = [];
  const rr = seeded("ridge");
  let px = x0, py = 20;
  while (px < x1) {
    const nx = px + 14 + rr() * 26, ny = 12 + rr() * 46;
    ridge.push(px, py, -330, nx, ny, -330);
    px = nx; py = ny;
  }
  const ridgeLine = lines(ridge, new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.22, fog: false }));
  scene.add(ridgeLine);

  /* ---------- buildings ---------- */
  const pickables = [];
  function addBuilding(l) {
    const h = l.floors * FLOOR_H;
    l.group = new THREE.Group();
    l.group.position.set(l.x, 0, l.z);
    scene.add(l.group);
    // footprint pad
    l.group.add(lines(rectPts(l.w / 2 + 0.8, l.d / 2 + 0.8, 0.04), lineMat[l.tint]));
    if (h > 0) {
      const geo = new THREE.BoxGeometry(l.w, h, l.d);
      const sideX = facadeMat(l.tint, l.d, l.floors);
      const sideZ = facadeMat(l.tint, l.w, l.floors);
      const mesh = new THREE.Mesh(geo, [sideX, sideX, roofMat, roofMat, sideZ, sideZ]);
      mesh.position.y = h / 2;
      mesh.userData.lot = l;
      l.group.add(mesh);
      pickables.push(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat[l.tint]);
      edges.position.y = h / 2;
      l.group.add(edges);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(l.w + 1.2, h + 0.6, l.d + 1.2), glowMat[l.tint]);
      glow.position.y = h / 2;
      l.group.add(glow);
    }
    if (l.extra > 0) {
      const sh = spireH(l);
      const base = h + slotH(l);
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.5, sh, 6),
        new THREE.MeshBasicMaterial({ color: l.tint, opacity: 0.9, ...add }));
      spire.position.y = base + sh / 2;
      l.group.add(spire);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 1, ...add }));
      beacon.position.y = base + sh;
      l.group.add(beacon);
      l.beacon = beacon;
    }
    // invisible pick box so short towers and spires are easy to click
    const pick = new THREE.Mesh(new THREE.BoxGeometry(l.w + 1, Math.max(topOf(l), 3), l.d + 1),
      new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = Math.max(topOf(l), 3) / 2;
    pick.userData.lot = l;
    l.group.add(pick);
    pickables.push(pick);
  }
  function rectPts(hw, hd, y) {
    return [-hw, y, -hd, hw, y, -hd, hw, y, -hd, hw, y, hd, hw, y, hd, -hw, y, hd, -hw, y, hd, -hw, y, -hd];
  }
  lots.forEach(addBuilding);
  if (empty) addBuilding(active);

  /* ---------- the crane ---------- */
  function lattice(len, s, step) {
    // vertical square truss, base at y=0, with X braces on every face
    const p = [], hs = s / 2;
    const c = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]];
    const n = Math.max(1, Math.round(len / step)), st = len / n;
    for (let k = 0; k < 4; k++) p.push(c[k][0], 0, c[k][1], c[k][0], len, c[k][1]);
    for (let i = 0; i <= n; i++) {
      const y = i * st;
      for (let k = 0; k < 4; k++) {
        const a = c[k], b = c[(k + 1) % 4];
        p.push(a[0], y, a[1], b[0], y, b[1]);
        if (i < n) p.push(a[0], y, a[1], b[0], y + st, b[1]);
      }
    }
    return p;
  }

  const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  const crane = {};
  (function buildCrane() {
    const l = active;
    const mx = l.x - l.w * 0.3, mz = l.z - l.d / 2 - 2.6;   // behind the tower, in the alley
    const slotY = l.floors * FLOOR_H + FLOOR_H / 2;
    const mastTop = Math.max(topOf(l) + 10, slotY + 14);
    const dx = l.x - mx, dz = l.z - mz;
    const reach = Math.hypot(dx, dz);
    const craneMat = lineMat[ORANGE];

    scene.add(at(lines(lattice(mastTop, 1.6, 2), craneMat), mx, 0, mz));

    const head = new THREE.Group();
    head.position.set(mx, mastTop, mz);
    scene.add(head);
    const jibLen = reach + 7, counterLen = 9;
    const jib = lines(lattice(jibLen + counterLen, 1.2, 2), craneMat);
    jib.rotation.z = -Math.PI / 2;           // lay the truss along +x
    jib.position.set(-counterLen, 0.6, 0);
    head.add(jib);
    head.add(lines(lattice(4, 1.2, 2), craneMat));
    // tie cables from the peak to both jib ends
    head.add(lines([0, 4, 0, jibLen, 0.6, 0, 0, 4, 0, -counterLen, 0.6, 0], craneMat));
    const cw = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.2), new THREE.MeshBasicMaterial({ color: 0x1a0d03 }));
    cw.position.set(-counterLen + 1.6, -0.6, 0);
    head.add(cw);
    head.add(at(new THREE.LineSegments(new THREE.EdgesGeometry(cw.geometry), craneMat), cw.position.x, cw.position.y, cw.position.z));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4d3d, ...add, opacity: 1 }));
    tip.position.set(jibLen, 1.2, 0);
    head.add(tip);

    const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), new THREE.MeshBasicMaterial({ color: ORANGE }));
    trolley.position.set(reach, -0.3, 0);
    head.add(trolley);
    const cableGeo = new THREE.BufferGeometry();
    cableGeo.setAttribute("position", new THREE.Float32BufferAttribute([reach, 0, 0, reach, -5, 0], 3));
    head.add(new THREE.LineSegments(cableGeo, craneMat));
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshBasicMaterial({ color: ORANGE }));
    head.add(hook);

    // the floor being lifted, and its copy once it lands
    const slabGeo = new THREE.BoxGeometry(l.w, FLOOR_H, l.d);
    const slabMat = new THREE.MeshBasicMaterial({ color: ORANGE, opacity: 0.35, ...add });
    const slab = new THREE.Group();
    slab.add(new THREE.Mesh(slabGeo, slabMat));
    slab.add(new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), craneMat));
    head.add(slab);
    const landedMat = new THREE.MeshBasicMaterial({ color: ORANGE, opacity: 0, ...add });
    const landed = new THREE.Mesh(slabGeo, landedMat);
    landed.position.set(l.x, slotY, l.z);
    scene.add(landed);
    // dashed outline of the next floor, waiting for the slab
    const slotMat = new THREE.LineDashedMaterial({ color: ORANGE, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.8 });
    const slot = new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), slotMat);
    slot.computeLineDistances();
    slot.position.set(l.x, slotY, l.z);
    scene.add(slot);

    // jib angles: B = over the tower, A = over the street (+x)
    const angB = Math.atan2(-dz, dx), angA = 0;
    Object.assign(crane, { head, cableGeo, hook, slab, slabMat, landedMat, slotMat, tip, reach,
      mastTop, slotY, angA, angB, groundY: FLOOR_H / 2 });
  })();

  function updateCrane(t) {
    const c = crane;
    const s = reduceMotion ? 4.6 : t % CYCLE;
    const high = c.mastTop - 4;               // slab centre height while swinging
    const rel = (y) => y - c.mastTop;         // world y -> head-local y
    let ang, y, carrying = true, landedA = 0;
    if (s < 1)        { ang = c.angA; y = c.groundY; }
    else if (s < 3)   { ang = c.angA; y = lerp(c.groundY, high, ease((s - 1) / 2)); }
    else if (s < 5.5) { ang = lerp(c.angA, c.angB, ease((s - 3) / 2.5)); y = high; }
    else if (s < 7)   { ang = c.angB; y = lerp(high, c.slotY, ease((s - 5.5) / 1.5)); }
    else {
      carrying = false;
      landedA = s < 7.3 ? 0.9 : 0.9 * (1 - ease((s - 7.3) / 2.5));
      if (s < 8.5)       { ang = c.angB; y = lerp(c.slotY, high, ease((s - 7) / 1.5)); }
      else if (s < 11)   { ang = lerp(c.angB, c.angA, ease((s - 8.5) / 2.5)); y = high; }
      else               { ang = c.angA; y = lerp(high, c.groundY, ease((s - 11) / 1.5)); }
    }
    c.head.rotation.y = ang;
    const hookY = rel(y + (carrying ? FLOOR_H / 2 + 0.4 : 0));
    const pos = c.cableGeo.attributes.position;
    pos.setY(1, hookY);
    pos.needsUpdate = true;
    c.hook.position.set(c.reach, hookY, 0);
    c.slab.visible = carrying;
    c.slab.position.set(c.reach, rel(y), 0);
    c.slab.rotation.y = c.angB - ang;         // stays square to the tower when it lands
    c.slabMat.opacity = s < 0.6 ? 0.35 * (s / 0.6) : 0.35;
    c.landedMat.opacity = landedA;
    c.slotMat.opacity = 0.45 + 0.4 * Math.abs(Math.sin(t * 2.2));
    c.tip.visible = Math.floor(t * 1.4) % 2 === 0;
  }

  /* ---------- light cycles with light-wall trails ---------- */
  const bikes = [];
  if (!reduceMotion) {
    const specs = [
      { z: 18.2, dir: 1, speed: 26, color: CYAN },
      { z: 19.8, dir: -1, speed: 21, color: ORANGE },
      { z: 0, dir: 1, speed: 17, color: CYAN },
      { z: -19, dir: -1, speed: 24, color: PURPLE },
    ];
    const TRAIL = 48;
    specs.forEach((sp, i) => {
      const bike = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      scene.add(bike);
      const pos = new Float32Array(TRAIL * 2 * 3), col = new Float32Array(TRAIL * 2 * 3);
      const base = new THREE.Color(sp.color);
      for (let k = 0; k < TRAIL; k++) {
        const f = 1 - k / (TRAIL - 1);
        for (const o of [0, 1]) {
          col.set([base.r * f, base.g * f, base.b * f], (k * 2 + o) * 3);
        }
      }
      const idx = [];
      for (let k = 0; k < TRAIL - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setIndex(idx);
      const trail = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...add, opacity: 0.9 }));
      trail.frustumCulled = false;
      scene.add(trail);
      bikes.push({ ...sp, bike, geo, pos, hist: [], x: minX - 40 + i * 37 });
    });
  }
  function updateBikes(dt) {
    const lo = Math.min(panX, minX) - 140, hi = Math.max(panX, maxX) + 140;
    for (const b of bikes) {
      b.x += b.dir * b.speed * dt;
      if (b.x > hi || b.x < lo) { b.x = b.dir > 0 ? lo : hi; b.hist.length = 0; }
      b.bike.position.set(b.x, 0.4, b.z);
      b.hist.unshift(b.x);
      const n = b.pos.length / 6;
      if (b.hist.length > n) b.hist.length = n;
      for (let k = 0; k < n; k++) {
        const hx = b.hist[Math.min(k, b.hist.length - 1)] - b.dir * 1.1;
        b.pos.set([hx, 0, b.z, hx, 0.9, b.z], k * 6);
      }
      b.geo.attributes.position.needsUpdate = true;
    }
  }

  /* ---------- labels ---------- */
  const labeled = empty ? [] : lots;
  for (const l of labeled) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "city-label mono" + (l.repo.private ? " is-private" : "") + (l.active ? " is-active" : "");
    el.innerHTML = (l.active ? '<span class="city-label-tag">⚒ building now</span>' : "") +
      `<span class="city-label-name">${l.repo.private ? "🔒 private" : esc(l.repo.name)}</span>` +
      `<span class="city-label-count">${l.repo.commits}</span>`;
    el.addEventListener("click", () => focusLot(l));
    labelLayer.appendChild(el);
    l.label = el;
    l.anchor = new THREE.Vector3(l.x, topOf(l) + 1.5, l.z);
  }
  // show labels by priority (selected, crane, nearest first); hide any that overlap one already shown
  const v = new THREE.Vector3();
  let selected = null;
  function updateLabels(w, h) {
    const cand = [];
    for (const l of labeled) {
      v.copy(l.anchor).project(camera);
      const on = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.2;
      if (!on) { l.label.style.display = "none"; continue; }
      l.sx = ((v.x + 1) / 2) * w; l.sy = ((1 - v.y) / 2) * h; l.depth = v.z;
      cand.push(l);
    }
    const rank = (l) => (l === selected ? -3 : l.active ? -2 : l.depth);
    cand.sort((a, b) => rank(a) - rank(b));
    const shown = [];
    for (const l of cand) {
      if (!l.lw) { l.label.style.display = ""; l.lw = l.label.offsetWidth; l.lh = l.label.offsetHeight; }
      l.sy = Math.max(l.sy, l.lh + 30);           // keep the label inside the stage
      l.sx = clamp(l.sx, l.lw / 2 + 4, w - l.lw / 2 - 4);
      const r = { x0: l.sx - l.lw / 2 - 2, x1: l.sx + l.lw / 2 + 2, y0: l.sy - l.lh - 2, y1: l.sy + 2 };
      const clash = shown.some((s) => r.x0 < s.x1 && r.x1 > s.x0 && r.y0 < s.y1 && r.y1 > s.y0);
      l.label.style.display = clash ? "none" : "";
      if (clash) continue;
      shown.push(r);
      l.label.style.transform = `translate(${l.sx}px, ${l.sy}px) translate(-50%, -100%)`;
    }
  }

  /* ---------- info card + HUD ---------- */
  function ago(iso) {
    const ms = Date.now() - Date.parse(iso);
    if (!isFinite(ms)) return "—";
    const d = Math.floor(ms / 86400000);
    if (d < 1) { const h = Math.floor(ms / 3600000); return h < 1 ? "just now" : `${h} h ago`; }
    if (d < 45) return `${d} day${d === 1 ? "" : "s"} ago`;
    const m = Math.round(d / 30);
    return m < 18 ? `${m} months ago` : `${(d / 365).toFixed(1)} years ago`;
  }
  function showCard(l) {
    if (!l || !l.repo) { card.hidden = true; return; }
    const r = l.repo;
    const title = r.private ? "Private repo" : esc(r.name);
    const link = !r.private && r.url ? `<a class="city-card-link" href="${esc(r.url)}" target="_blank" rel="noopener">view on GitHub →</a>` : "";
    card.innerHTML =
      `<p class="city-card-kicker mono">${l.active ? "⚒ under construction" : r.private ? "🔒 name hidden" : "tower"}</p>` +
      `<h3 class="city-card-title">${title}</h3>` +
      `<dl class="city-card-stats mono">` +
      `<dt>floors</dt><dd>${r.commits}${l.extra > 0 ? ` <span class="dim">(${MAX_FLOORS} + spire)</span>` : ""}</dd>` +
      (r.language ? `<dt>language</dt><dd>${esc(r.language)}</dd>` : "") +
      `<dt>last commit</dt><dd>${ago(r.lastCommit)}</dd></dl>` + link;
    card.hidden = false;
    selected = l;
    for (const x of labeled) x.label.classList.toggle("is-selected", x === l);
  }

  const total = repos.reduce((s, r) => s + r.commits, 0);
  hud.textContent = empty ? "" : `${repos.length} towers · ${total} floors · 1 floor = 1 commit`;
  if (empty) badge.hidden = false;
  showCard(active);

  /* ---------- camera + panning ---------- */
  function focusLot(l) {
    panGoal = clamp(l.x, minX, maxX);
    panVel = 0;
    showCard(l);
    wake();
  }
  function worldPerPx() {
    return (2 * DIST * Math.tan((FOV / 2) * Math.PI / 180)) / Math.max(1, stage.clientHeight) / Math.cos(YAW);
  }
  function panBy(dx) { panGoal = clamp(panGoal + dx, minX - LOT, maxX + LOT); wake(); }

  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, last: e.clientX, t: performance.now(), moved: 0 };
    panVel = 0;
    canvas.setPointerCapture(e.pointerId);
    stage.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) { hover(e); return; }
    const dx = e.clientX - drag.last;
    const now = performance.now();
    drag.moved += Math.abs(dx);
    drag.last = e.clientX;
    const dw = -dx * worldPerPx();
    panBy(dw);
    panX = panGoal;
    panVel = dw / Math.max(1, now - drag.t) * 1000;
    drag.t = now;
  });
  function endDrag(e) {
    if (!drag) return;
    const click = drag.moved < 6 && Math.abs(e.clientY - drag.y) < 6;
    drag = null;
    stage.classList.remove("is-dragging");
    if (click) pick(e); else if (reduceMotion) panVel = 0;
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => { drag = null; panVel = 0; stage.classList.remove("is-dragging"); });

  canvas.addEventListener("wheel", (e) => {
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (!horizontal) return;                  // vertical wheel scrolls the page
    e.preventDefault();
    panBy(horizontal * worldPerPx());
  }, { passive: false });

  const step = () => Math.max(LOT * 2, stage.clientWidth * worldPerPx() * 0.5);
  btnPrev.addEventListener("click", () => panBy(-step()));
  btnNext.addEventListener("click", () => panBy(step()));
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { panBy(-LOT * 2); e.preventDefault(); }
    else if (e.key === "ArrowRight") { panBy(LOT * 2); e.preventDefault(); }
    else if (e.key === "End") { focusLot(active); e.preventDefault(); }
  });

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pickables, false)[0];
    return h ? h.object.userData.lot : null;
  }
  function pick(e) { const l = hit(e); if (l && l.repo) focusLot(l); }
  function hover(e) { canvas.classList.toggle("is-pointing", !!(hit(e) || {}).repo); }

  /* ---------- size, visibility, loop ---------- */
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    wake();
  }
  new ResizeObserver(resize).observe(stage);

  let visible = false, running = false, last = 0, clock = 0;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; wake(); }, { threshold: 0.05 }).observe(stage);
  function wake() { if (visible && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    if (!drag) {
      if (Math.abs(panVel) > 0.5) { panGoal = clamp(panGoal + panVel * dt, minX - LOT, maxX + LOT); panVel *= Math.pow(0.04, dt); }
      else panVel = 0;
      if (panGoal < minX || panGoal > maxX) panGoal = lerp(panGoal, clamp(panGoal, minX, maxX), 1 - Math.pow(0.002, dt));
      panX = reduceMotion ? panGoal : lerp(panX, panGoal, 1 - Math.pow(0.0015, dt));
    }
    camTarget.x = panX;
    camera.position.set(
      camTarget.x + DIST * Math.cos(ELEV) * Math.sin(YAW),
      camTarget.y + DIST * Math.sin(ELEV),
      camTarget.z + DIST * Math.cos(ELEV) * Math.cos(YAW));
    camera.lookAt(camTarget);
    ridgeLine.position.x = panX * 0.6;        // slow parallax on the far ridge

    updateCrane(clock);
    updateBikes(dt);
    for (const l of lots) if (l.beacon) l.beacon.material.opacity = 0.35 + 0.65 * Math.abs(Math.sin(clock * 1.6 + l.index));
    renderer.render(scene, camera);
    updateLabels(stage.clientWidth, stage.clientHeight);

    const settling = Math.abs(panGoal - panX) > 0.01 || panVel !== 0 || drag;
    if (visible && (!reduceMotion || settling)) requestAnimationFrame(frame);
    else running = false;
  }
  resize();
})();
