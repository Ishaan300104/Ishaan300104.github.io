/* =========================================================
   Commit City — my GitHub repos as a Tron-style skyline.
   One building = one repo. One floor = one of my commits.
   Data: data/city.js, refreshed every 6 hours by
   .github/workflows/commit-city.yml (tools/commit-city/build.js).
   A crane builds the next floor on the repo I committed to last.
   Past a plaza at the right end, a gold megastructure holds my
   Hugging Face projects: one turning tier per project.
   Built with Three.js (r128 UMD build, loaded in index.html).
   ========================================================= */

(function commitCity() {
  "use strict";

  const canvas = document.getElementById("city-canvas");
  if (!canvas || !window.THREE) return;

  /* ---------- tuning ---------- */
  const CYAN = 0x66d9ff, PURPLE = 0xb388ff, ORANGE = 0xff9e3d, BG = 0x03050b;
  const FLOOR_H = 1.5;        // height of one floor (one commit)
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
  // futuristic shapes: prism sides, how much it narrows to the top, how far it turns
  const STYLES = [
    { sides: 4, taper: 0.68, twist: 0 },              // tapered square spire
    { sides: 4, taper: 0.9, twist: Math.PI / 2 },     // twisting tower
    { sides: 6, taper: 0.58, twist: 0 },              // hex spire
    { sides: 8, taper: 0.78, twist: Math.PI / 5 },    // turning octagon
  ];
  const lots = repos.map((r, i) => {
    const rnd = seeded(String(r.id));
    const floors = Math.min(r.commits, MAX_FLOORS);
    const style = STYLES[Math.floor(rnd() * STYLES.length)];
    const w = 4.4 + rnd() * 1.6;                 // slim footprints read as skyscrapers
    const grow = clamp(floors / 24, 0.25, 1);      // short towers bend gently
    const extra = r.commits - floors;
    return {
      repo: r, index: i,
      x: colX(Math.floor(i / 2)), z: ROW_Z[(repos.length - 1 - i) % 2 === 0 ? 1 : 0],
      w, d: w, style,
      taper: lerp(1, style.taper, grow), twist: style.twist * grow,
      podium: floors >= 12,
      halo: floors >= 8 && rnd() < 0.5,
      antennaH: !extra && floors >= 5 && rnd() < 0.55 ? 3 + rnd() * 4 : 0,
      floors, extra,
      tint: r.private ? PURPLE : CYAN,
    };
  });
  // the newest repo gets the crane; with no data, an empty lot does
  const active = empty
    ? { repo: null, x: 0, z: ROW_Z[1], w: 5.5, d: 5.5, style: STYLES[0], taper: 1, twist: 0, floors: 0, extra: 0, antennaH: 0 }
    : lots[lots.length - 1];
  active.tint = ORANGE;
  active.active = true;
  active.halo = false;                         // the crane works on the roof
  active.antennaH = 0;

  const minX = 0;
  const maxX = empty ? 0 : colX(Math.floor((lots.length - 1) / 2));
  const spireH = (l) => (l.extra > 0 ? 6 + 5 * Math.log2(1 + l.extra / MAX_FLOORS) : 0);
  const slotH = (l) => (l.active ? FLOOR_H : 0);
  const topOf = (l) => l.floors * FLOOR_H + slotH(l) + spireH(l) + (l.antennaH || 0);
  const maxTop = Math.max(14, ...lots.map(topOf), topOf(active) + 12);

  /* ---------- Hugging Face district: one megastructure, one tier per project ---------- */
  const GOLD = 0xffc94d;
  const hfItems = ((window.COMMIT_CITY && window.COMMIT_CITY.hf) || [])
    .filter((x) => x && x.id)
    .slice()
    .sort((a, b) => String(a.created).localeCompare(String(b.created)));   // oldest at the bottom
  const hfUser = (window.COMMIT_CITY && window.COMMIT_CITY.hfUser) || "";
  const HF_ON = hfItems.length > 0;
  const PLAZA_X0 = maxX + LOT / 2 + ROAD;    // where the GitHub streets end
  const HF_X = PLAZA_X0 + 34;                 // tower centre
  const PODIUM_H = 4.5;
  const TIER_H = clamp(40 / Math.max(1, hfItems.length), 2.4, 5.5);
  const tierApo = (i) => lerp(9.2, 4.2, hfItems.length > 1 ? i / (hfItems.length - 1) : 0);
  const tierTop = PODIUM_H + hfItems.length * TIER_H;
  const CROWN_H = 7, HF_SPIRE = 16;
  const hfTop = HF_ON ? tierTop + CROWN_H + HF_SPIRE : 0;
  const panMax = HF_ON ? HF_X : maxX;
  const cityEnd = HF_ON ? HF_X + 30 : maxX;

  /* ---------- renderer, scene, camera ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(BG, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 2, 1, 2000);
  const DIST = clamp(maxTop * 2.5, 120, 240);
  const DIST_HF = clamp(hfTop * 2.3, DIST, 280);   // the camera pulls back near the HF tower
  let dist = DIST, hfNear = 0;
  scene.fog = new THREE.Fog(BG, DIST * 0.75, DIST * 2.3);
  const camTarget = new THREE.Vector3(maxX, maxTop * 0.4, 0);

  // first view: the crane, and the Hugging Face tower beside it when there is one
  const START_X = HF_ON ? lerp(maxX, HF_X, 0.55) : maxX;
  let panX = START_X, panGoal = START_X, panVel = 0;

  /* ---------- shared materials ---------- */
  const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const lineMat = {};
  const glowMat = {};
  for (const c of [CYAN, PURPLE, ORANGE, GOLD]) {
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
  const span = cityEnd - minX + 600;
  const midX = (minX + cityEnd) / 2;
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
  const x0 = minX - 300, x1 = cityEnd + 300;
  const streetsEnd = HF_ON ? PLAZA_X0 : x1;   // the alley and cross streets stop at the plaza
  for (const z of [16, 22, -16, -22]) roadPts.push(x0, 0.02, z, x1, 0.02, z);
  for (const z of [-3.6, 3.6]) roadPts.push(x0, 0.02, z, streetsEnd, 0.02, z);
  for (let c = BLOCK; c <= Math.floor(maxX / LOT) + BLOCK * 2; c += BLOCK) {
    const xr = colX(c) - LOT / 2 - ROAD / 2;
    if (xr > streetsEnd - ROAD) break;
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
  // Futuristic tower body: an n-sided prism with one height segment per floor, base at y=0,
  // bent so it narrows towards the top (taper) and turns about its axis (twist).
  function towerGeo(apothem, h, floors, sides, taper, twist, turn0) {
    const R = apothem / Math.cos(Math.PI / sides);
    const geo = new THREE.CylinderGeometry(R, R, h, sides, Math.max(1, floors), false, Math.PI / sides);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = (p.getY(i) + h / 2) / h;
      const k = lerp(1, taper, t), a = (turn0 || 0) + twist * t;
      const x = p.getX(i) * k, z = p.getZ(i) * k;
      p.setXYZ(i, x * Math.cos(a) + z * Math.sin(a), t * h, -x * Math.sin(a) + z * Math.cos(a));
    }
    geo.computeVertexNormals();
    return geo;
  }
  function towerMats(tint, apothem, sides, floors) {
    const face = 2 * apothem * Math.tan(Math.PI / sides);
    const t = facadeTexture(tint);
    t.repeat.set((sides * Math.max(1, Math.round(face / 2.2))) / 4, floors);
    return [new THREE.MeshBasicMaterial({ map: t }), roofMat, roofMat];
  }
  const bandMats = {};
  const bandMat = (c) => bandMats[c] || (bandMats[c] = new THREE.MeshBasicMaterial({ color: c, opacity: 0.9, ...add }));
  function polyPts(R, sides, y) {
    const out = [];
    for (let k = 0; k < sides; k++) {
      const a = Math.PI / sides + (k / sides) * Math.PI * 2, b = Math.PI / sides + ((k + 1) / sides) * Math.PI * 2;
      out.push(R * Math.sin(a), y, R * Math.cos(a), R * Math.sin(b), y, R * Math.cos(b));
    }
    return out;
  }
  // a tilted glowing ring that slowly spins round the tower
  const spinners = [];
  function halo(parent, radius, y, tint, tilt, speed) {
    const pivot = new THREE.Group();
    pivot.position.y = y;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.08, 6, 72), bandMat(tint));
    ring.rotation.x = Math.PI / 2 + tilt;
    pivot.add(ring);
    parent.add(pivot);
    spinners.push({ o: pivot, speed });
  }
  // antenna / spire with a blinking beacon on top; returns the beacon
  function needle(parent, h, y, tint, base) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.06, base, h, 6),
      new THREE.MeshBasicMaterial({ color: tint, opacity: 0.9, ...add }));
    n.position.y = y + h / 2;
    parent.add(n);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 1, ...add }));
    b.position.y = y + h;
    parent.add(b);
    return b;
  }
  const pickables = [];
  function addBuilding(l) {
    const h = l.floors * FLOOR_H, sides = l.style.sides, a = l.w / 2;
    const R = a / Math.cos(Math.PI / sides);
    l.group = new THREE.Group();
    l.group.position.set(l.x, 0, l.z);
    scene.add(l.group);
    l.group.add(lines(polyPts(R + 0.9, sides, 0.04), lineMat[l.tint]));     // footprint pad
    if (h > 0) {
      if (l.podium) {                                                      // wider setback base
        const pg = towerGeo(a + 1.1, 1.4, 1, sides, 0.92, 0, 0);
        l.group.add(new THREE.Mesh(pg, towerMats(l.tint, a + 1.1, sides, 1)));
        l.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(pg, 20), lineMat[l.tint]));
      }
      const geo = towerGeo(a, h, l.floors, sides, l.taper, l.twist, 0);
      const mesh = new THREE.Mesh(geo, towerMats(l.tint, a, sides, l.floors));
      mesh.userData.lot = l;
      l.group.add(mesh);
      pickables.push(mesh);
      l.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), lineMat[l.tint]));
      l.group.add(new THREE.Mesh(towerGeo(a + 0.6, h + 0.4, 1, sides, l.taper, l.twist, 0), glowMat[l.tint]));
      // glowing crown band just under the roof
      const topA = a * l.taper;
      const band = new THREE.Mesh(towerGeo(topA + 0.12, 0.3, 1, sides, 1, 0, l.twist), bandMat(l.tint));
      band.position.y = h - 0.5;
      l.group.add(band);
      if (l.halo) halo(l.group, topA / Math.cos(Math.PI / sides) + 1.5, h - 1.4, l.tint, 0.2, 0.4 + (l.index % 3) * 0.2);
      if (l.antennaH) l.beacon = needle(l.group, l.antennaH, h, l.tint, 0.22);
    }
    if (l.extra > 0) l.beacon = needle(l.group, spireH(l), h + slotH(l), l.tint, 0.5);
    // invisible pick box so short towers and spires are easy to click
    const pick = new THREE.Mesh(new THREE.BoxGeometry(l.w + 1, Math.max(topOf(l), 3), l.d + 1),
      new THREE.MeshBasicMaterial({ visible: false }));
    pick.position.y = Math.max(topOf(l), 3) / 2;
    pick.userData.lot = l;
    l.group.add(pick);
    pickables.push(pick);
  }
  lots.forEach(addBuilding);
  if (empty) addBuilding(active);

  /* ---------- the Hugging Face megastructure ---------- */
  const hfTower = { hfTower: true, x: HF_X, z: 0 };
  const hfTiers = [];
  const searchlights = [];
  let hfBeacon = null;
  if (HF_ON) (function buildHF() {
    const g = new THREE.Group();
    g.position.set(HF_X, 0, 0);
    scene.add(g);
    const gold = lineMat[GOLD];
    const part = (geo, apo, sides, floors, y, lot) => {
      const m = new THREE.Mesh(geo, towerMats(GOLD, apo, sides, floors));
      m.position.y = y;
      g.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), gold);
      e.position.y = y;
      g.add(e);
      if (lot) { m.userData.lot = lot; pickables.push(m); }
    };
    const ring = (radius, y, tube) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 96), bandMat(GOLD));
      m.rotation.x = Math.PI / 2;
      m.position.y = y;
      g.add(m);
    };

    // plaza: gold outline, a hex ring round the base, and a path from the streets
    const pl = PLAZA_X0 - HF_X + 2, pr = 24;
    const plaza = [pl, 0.03, -14.5, pr, 0.03, -14.5, pr, 0.03, -14.5, pr, 0.03, 14.5,
      pr, 0.03, 14.5, pl, 0.03, 14.5, pl, 0.03, 14.5, pl, 0.03, -14.5, ...polyPts(14.2 / Math.cos(Math.PI / 6), 6, 0.03)];
    for (const z of [-2, 2]) plaza.push(pl, 0.03, z, -15, 0.03, z);
    g.add(lines(plaza, new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.4 })));

    // sloped hex podium with a second step
    part(towerGeo(13, 3, 2, 6, 0.86, 0, 0), 13, 6, 2, 0, hfTower);
    part(towerGeo(10.4, 1.5, 1, 6, 0.95, 0, 0), 10.4, 6, 1, 3, hfTower);
    ring(10.4 / Math.cos(Math.PI / 6) * 0.95 + 0.3, PODIUM_H, 0.14);

    // one octagonal tier per project, each turned a little further, with a glowing ring
    const floors = Math.max(1, Math.round(TIER_H / 1.1));
    const n = hfItems.length;
    hfItems.forEach((item, i) => {
      const apo = tierApo(i), y = PODIUM_H + i * TIER_H, turn = i * 0.22;
      const r = (apo * 0.9) / Math.cos(Math.PI / 8) + 0.55;
      const tier = { hf: item, index: i, x: HF_X, z: 0, w: apo * 2, y: y + TIER_H / 2, r };
      part(towerGeo(apo, TIER_H - 0.25, floors, 8, 0.9, 0.08, turn), apo, 8, floors, y, tier);
      ring(r, y + TIER_H - 0.12, 0.12);
      hfTiers.push(tier);
    });
    g.add(new THREE.Mesh(towerGeo(10.5, tierTop + 1, 1, 8, 0.5, 0, 0), glowMat[GOLD]));

    // neon struts from the podium to the core
    const strutMat = new THREE.MeshBasicMaterial({ color: GOLD, opacity: 0.55, ...add });
    const midY = PODIUM_H + tierTop * 0.5, midR = tierApo(Math.floor(n / 2)) * 0.95;
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      const a = new THREE.Vector3(Math.sin(ang) * 11.5, 3, Math.cos(ang) * 11.5);
      const b = new THREE.Vector3(Math.sin(ang) * midR, midY, Math.cos(ang) * midR);
      const dir = new THREE.Vector3().subVectors(b, a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, dir.length(), 6), strutMat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      g.add(m);
    }

    // crown: a twisting octagonal cap, three spinning halos, and the needle spire
    part(towerGeo(3.6, CROWN_H, 3, 8, 0.35, Math.PI / 4, n * 0.22), 3.6, 8, 3, tierTop, hfTower);
    halo(g, 6.4, tierTop + 1.2, GOLD, 0.12, 0.6);
    halo(g, 5.0, tierTop + 3.4, GOLD, -0.18, -0.9);
    halo(g, 3.6, tierTop + 5.6, GOLD, 0.26, 1.3);
    hfBeacon = needle(g, HF_SPIRE, tierTop + CROWN_H, GOLD, 0.6);
    const crownPick = new THREE.Mesh(new THREE.BoxGeometry(9, hfTop - tierTop, 9), new THREE.MeshBasicMaterial({ visible: false }));
    crownPick.position.y = tierTop + (hfTop - tierTop) / 2;
    crownPick.userData.lot = hfTower;
    g.add(crownPick);
    pickables.push(crownPick);

    // two searchlights sweeping the sky from the podium
    if (!reduceMotion) {
      const beamGeo = new THREE.ConeGeometry(4, 120, 24, 1, true);
      beamGeo.translate(0, -60, 0);
      beamGeo.rotateX(Math.PI);                     // apex at the lamp, wide end up
      const beamMat = new THREE.MeshBasicMaterial({ color: GOLD, opacity: 0.028, side: THREE.DoubleSide, ...add, fog: false });
      for (const [bx, bz, ph] of [[-10, 8, 0], [10, 8, 2.4]]) {
        const pivot = new THREE.Group();
        pivot.position.set(bx, PODIUM_H + 0.3, bz);
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.rotation.z = 0.34;
        pivot.add(beam);
        g.add(pivot);
        searchlights.push({ pivot, ph });
      }
    }
  })();

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
    const slabGeo = towerGeo((l.w / 2) * l.taper, FLOOR_H, 1, l.style.sides, 1, 0, l.twist);
    slabGeo.translate(0, -FLOOR_H / 2, 0);
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
    c.slab.rotation.y = -ang;                 // keeps its heading, so it lands square on the tower
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
    const lo = Math.min(panX, minX) - 140;
    for (const b of bikes) {
      const hi = b.z === 0 && HF_ON ? PLAZA_X0 - 4 : Math.max(panX, panMax) + 140;
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
  const labeled = [];
  for (const l of empty ? [] : lots) {
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
    labeled.push(l);
  }
  function hfLabel(l, cls, html, anchor) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "city-label mono is-hf " + cls;
    el.innerHTML = html;
    el.addEventListener("click", () => focusLot(l));
    labelLayer.appendChild(el);
    l.label = el;
    l.anchor = anchor;
    labeled.push(l);
  }
  if (HF_ON) {
    hfLabel(hfTower, "is-hf-sign",
      `<span class="city-label-tag">🤗 hugging face</span><span class="city-label-name">${esc(hfUser)}</span>` +
      `<span class="city-label-count">${hfItems.length} project${hfItems.length === 1 ? "" : "s"}</span>`,
      new THREE.Vector3(HF_X, hfTop + 2, 0));
    // tier labels sit beside the tier corner that faces the camera, and only show up close
    for (const t of hfTiers) {
      t.side = true;
      t.gate = () => hfNear > 0.93;
      hfLabel(t, "is-side", `<span class="city-label-name">${esc(t.hf.name)}</span>` +
        `<span class="city-label-count">${esc(t.hf.task || t.hf.type)}</span>`,
        new THREE.Vector3(HF_X + t.r * Math.cos(YAW), t.y, -t.r * Math.sin(YAW)));
    }
  }
  // show labels by priority (selected, crane, nearest first); hide any that overlap one already shown
  const v = new THREE.Vector3();
  let selected = null;
  function updateLabels(w, h) {
    const cand = [];
    for (const l of labeled) {
      v.copy(l.anchor).project(camera);
      const on = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.2 && (!l.gate || l.gate());
      if (!on) { l.label.style.display = "none"; continue; }
      l.sx = ((v.x + 1) / 2) * w; l.sy = ((1 - v.y) / 2) * h; l.depth = v.z;
      cand.push(l);
    }
    const rank = (l) => (l === selected ? -4 : l.hfTower ? -3 : l.active ? -2 : l.depth);
    cand.sort((a, b) => rank(a) - rank(b));
    const shown = [];
    for (const l of cand) {
      if (!l.lw) { l.label.style.display = ""; l.lw = l.label.offsetWidth; l.lh = l.label.offsetHeight; }
      let r;
      if (l.side) {                                // left edge at the anchor, centred on it
        l.sx = Math.min(l.sx + 8, w - l.lw - 4);
        r = { x0: l.sx - 2, x1: l.sx + l.lw + 2, y0: l.sy - l.lh / 2 - 1, y1: l.sy + l.lh / 2 + 1 };
      } else {
        l.sy = Math.max(l.sy, l.lh + 30);         // keep the label inside the stage
        l.sx = clamp(l.sx, l.lw / 2 + 4, w - l.lw / 2 - 4);
        r = { x0: l.sx - l.lw / 2 - 2, x1: l.sx + l.lw / 2 + 2, y0: l.sy - l.lh - 2, y1: l.sy + 2 };
      }
      const clash = shown.some((s) => r.x0 < s.x1 && r.x1 > s.x0 && r.y0 < s.y1 && r.y1 > s.y0);
      l.label.style.display = clash ? "none" : "";
      if (clash) continue;
      shown.push(r);
      l.label.style.transform = `translate(${l.sx}px, ${l.sy}px) ` + (l.side ? "translate(0, -50%)" : "translate(-50%, -100%)");
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
  const hfUrl = (x) => "https://huggingface.co/" + (x.type === "dataset" ? "datasets/" : x.type === "space" ? "spaces/" : "") + x.id;
  const month = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("en", { month: "short", year: "numeric" }); };
  function selectCard(l, html) {
    card.innerHTML = html;
    card.hidden = false;
    selected = l;
    for (const x of labeled) x.label.classList.toggle("is-selected", x === l);
  }
  function showCard(l) {
    if (l && l.hf) {
      const x = l.hf;
      return selectCard(l,
        `<p class="city-card-kicker mono is-hf">🤗 tier ${l.index + 1} of ${hfItems.length}</p>` +
        `<h3 class="city-card-title">${esc(x.name)}</h3>` +
        `<dl class="city-card-stats mono"><dt>type</dt><dd>${esc(x.type)}</dd>` +
        (x.task ? `<dt>task</dt><dd>${esc(x.task)}</dd>` : "") +
        `<dt>published</dt><dd>${month(x.created)}</dd></dl>` +
        `<a class="city-card-link" href="${esc(hfUrl(x))}" target="_blank" rel="noopener">view on Hugging Face →</a>`);
    }
    if (l && l.hfTower) {
      const count = (t) => hfItems.filter((x) => x.type === t).length;
      const rows = [["models", count("model")], ["datasets", count("dataset")], ["spaces", count("space")]]
        .filter((r) => r[1]).map((r) => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join("");
      return selectCard(l,
        `<p class="city-card-kicker mono is-hf">🤗 hugging face tower</p>` +
        `<h3 class="city-card-title">${esc(hfUser)}</h3>` +
        `<dl class="city-card-stats mono"><dt>tiers</dt><dd>${hfItems.length}</dd>${rows}</dl>` +
        `<a class="city-card-link" href="https://huggingface.co/${esc(hfUser)}" target="_blank" rel="noopener">view profile →</a>`);
    }
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
    selectCard(l, card.innerHTML);
  }

  const total = repos.reduce((s, r) => s + r.commits, 0);
  hud.textContent = (empty ? "" : `${repos.length} towers · ${total} floors · 1 floor = 1 commit`) +
    (HF_ON ? `${empty ? "" : " · "}🤗 ${hfItems.length} HF projects →` : "");
  if (empty) badge.hidden = false;
  if (!HF_ON) showCard(active);             // with the HF tower in view, start with a clear skyline

  /* ---------- camera + panning ---------- */
  function focusLot(l) {
    panGoal = clamp(l.x, minX, panMax);
    panVel = 0;
    showCard(l);
    wake();
  }
  function worldPerPx() {
    return (2 * dist * Math.tan((FOV / 2) * Math.PI / 180)) / Math.max(1, stage.clientHeight) / Math.cos(YAW);
  }
  function panBy(dx) { panGoal = clamp(panGoal + dx, minX - LOT, panMax + LOT); wake(); }

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
    else if (e.key === "Home" && HF_ON) { focusLot(hfTower); e.preventDefault(); }
  });

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hit(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pickables, false)[0];
    return h ? h.object.userData.lot : null;
  }
  const clickable = (l) => !!(l && (l.repo || l.hf || l.hfTower));
  function pick(e) {
    const l = hit(e);
    if (clickable(l)) return focusLot(l);
    card.hidden = true;                       // click on empty ground closes the card
    selected = null;
    for (const x of labeled) x.label.classList.remove("is-selected");
  }
  function hover(e) { canvas.classList.toggle("is-pointing", clickable(hit(e))); }

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
      if (Math.abs(panVel) > 0.5) { panGoal = clamp(panGoal + panVel * dt, minX - LOT, panMax + LOT); panVel *= Math.pow(0.04, dt); }
      else panVel = 0;
      if (panGoal < minX || panGoal > panMax) panGoal = lerp(panGoal, clamp(panGoal, minX, panMax), 1 - Math.pow(0.002, dt));
      panX = reduceMotion ? panGoal : lerp(panX, panGoal, 1 - Math.pow(0.0015, dt));
    }
    hfNear = HF_ON ? ease(1 - Math.abs(panX - HF_X) / 95) : 0;
    // narrow stages see less width, so pull back to keep the same stretch of street
    const fit = Math.pow(Math.max(1, 1.7 / Math.max(0.5, camera.aspect)), 0.75);
    dist = lerp(DIST, DIST_HF, hfNear) * fit;
    scene.fog.near = dist * 0.75;
    scene.fog.far = dist * 2.3;
    camTarget.x = panX;
    camTarget.y = lerp(maxTop * 0.4, hfTop * 0.42, hfNear);
    camera.position.set(
      camTarget.x + dist * Math.cos(ELEV) * Math.sin(YAW),
      camTarget.y + dist * Math.sin(ELEV),
      camTarget.z + dist * Math.cos(ELEV) * Math.cos(YAW));
    camera.lookAt(camTarget);
    ridgeLine.position.x = panX * 0.6;        // slow parallax on the far ridge

    updateCrane(clock);
    updateBikes(dt);
    for (const l of lots) if (l.beacon) l.beacon.material.opacity = 0.35 + 0.65 * Math.abs(Math.sin(clock * 1.6 + l.index));
    if (hfBeacon) hfBeacon.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(clock * 1.1));
    for (const sl of searchlights) sl.pivot.rotation.y = clock * 0.35 + sl.ph;
    if (!reduceMotion) for (const sp of spinners) sp.o.rotation.y += sp.speed * dt;
    renderer.render(scene, camera);
    updateLabels(stage.clientWidth, stage.clientHeight);

    const settling = Math.abs(panGoal - panX) > 0.01 || panVel !== 0 || drag;
    if (visible && (!reduceMotion || settling)) requestAnimationFrame(frame);
    else running = false;
  }
  resize();
})();
