/* =========================================================
   Commit Globe — where (and when) I commit, on a 3D globe.
   Data: data/commits.js, written by tools/commit-globe
   (a git post-commit hook logs each commit's city; its
   `publish` command turns that log into the data file).
   Until real commits are published, a badged sample is shown.
   Built with Three.js (r128 UMD build, loaded in index.html).
   ========================================================= */

(function commitGlobe() {
  "use strict";

  const canvas = document.getElementById("globe-canvas");
  if (!canvas || !window.THREE) return;

  const CYAN = 0x66d9ff, PURPLE = 0xb388ff, LIFT = 0xeafaff;
  const R = 100;            // globe radius in scene units
  const DOT_STEP = 1.2;     // degrees between land dots
  const MAX_ARCS = 30;      // only the most recent trips get an arc
  const ARC_DUR = 1.6, ARC_GAP = 0.8;   // seconds per arc / between arc starts
  const D2R = Math.PI / 180;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stage = canvas.parentElement;
  const tooltip = stage.querySelector(".globe-tooltip");
  const panel = document.querySelector(".globe-panel");
  const ui = {
    title: panel.querySelector(".globe-scope-title"),
    clear: panel.querySelector(".globe-scope-clear"),
    stats: panel.querySelector(".globe-stats"),
    hours: panel.querySelector(".hour-chart"),
    caption: panel.querySelector(".hour-caption"),
    feed: panel.querySelector(".feed-list"),
  };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pad = (v) => String(v).padStart(2, "0");
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  /* ---------- data ---------- */

  const published = (window.COMMIT_GLOBE && window.COMMIT_GLOBE.commits) || [];
  const isSample = published.length === 0;
  const commits = (isSample ? sampleCommits() : published)
    .map((c) => ({ ...c, when: Date.parse(c.t), hour: Number(String(c.t).slice(11, 13)) }))
    .filter((c) => !isNaN(c.when) && isFinite(c.lat) && isFinite(c.lon))
    .sort((a, b) => a.when - b.when);

  const regionNames = (() => {
    try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) { return null; }
  })();
  function countryName(code) {
    if (!code) return "";
    try { return (regionNames && regionNames.of(code.toUpperCase())) || code; } catch (e) { return code; }
  }

  // one cluster per city — that's one beam on the globe
  const clusters = [];
  const byKey = new Map();
  for (const c of commits) {
    const key = c.city ? `${c.city}|${c.country}` : `${c.lat.toFixed(1)},${c.lon.toFixed(1)}`;
    let cl = byKey.get(key);
    if (!cl) {
      cl = { key, city: c.city || "Unknown place", country: c.country || "", lat: c.lat, lon: c.lon, commits: [] };
      cl.place = cl.country ? `${cl.city}, ${countryName(cl.country)}` : cl.city;
      byKey.set(key, cl);
      clusters.push(cl);
    }
    cl.commits.push(c);
    c.cluster = cl;
  }
  const latestCluster = commits.length ? commits[commits.length - 1].cluster : null;

  /* ---------- formatting ---------- */

  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const plural = (n, one, many = one + "s") => `${compact.format(n)} ${n === 1 ? one : many}`;
  const shortDate = (ms) => new Date(ms).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
  const monthYear = (ms) => new Date(ms).toLocaleDateString("en", { month: "short", year: "numeric" });
  function ago(ms) {
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
    return shortDate(ms);
  }
  const localClock = (c) => String(c.t).slice(11, 16);   // the committer's own wall-clock time

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;   // commit text is untrusted: never innerHTML
    return node;
  }

  /* ---------- scene ---------- */

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
  const globe = new THREE.Group();
  scene.add(globe);

  // lat/lon → point; lon 0 / lat 0 faces the camera when the globe isn't rotated
  function toVec(lat, lon, r) {
    const la = lat * D2R, lo = lon * D2R;
    return new THREE.Vector3(r * Math.cos(la) * Math.sin(lo), r * Math.sin(la), r * Math.cos(la) * Math.cos(lo));
  }

  // ocean: dark sphere with a soft cyan rim
  globe.add(new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.985, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { uBase: { value: new THREE.Color(0x0b1427) }, uRim: { value: new THREE.Color(0x1d4a72) } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uBase; uniform vec3 uRim; varying vec3 vNormal;
        void main() {
          float rim = pow(1.0 - max(vNormal.z, 0.0), 2.5);
          gl_FragColor = vec4(mix(uBase, uRim, rim), 1.0);
        }`,
    })
  ));

  // land: one dot per ~1.2° wherever the land mask (js/world-land.js) says there's ground
  const mask = Uint8Array.from(atob(window.WORLD_LAND_MASK || ""), (ch) => ch.charCodeAt(0));
  function isLand(lat, lon) {
    if (!mask.length) return false;
    const i = Math.min(179, Math.floor(90 - lat)) * 360 + Math.min(359, Math.floor(lon + 180));
    return (mask[i >> 3] >> (7 - (i & 7))) & 1;
  }
  const dotPositions = [];
  for (let lat = -90 + DOT_STEP / 2; lat < 90; lat += DOT_STEP) {
    const n = Math.max(1, Math.round((360 * Math.cos(lat * D2R)) / DOT_STEP));
    for (let i = 0; i < n; i++) {
      const lon = -180 + ((i + 0.5) * 360) / n;
      if (isLand(lat, lon)) { const v = toVec(lat, lon, R); dotPositions.push(v.x, v.y, v.z); }
    }
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dotPositions, 3));
  const dotMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0x5b8ab9) }, uSize: { value: 1.15 }, uScale: { value: 1 } },
    vertexShader: `
      uniform float uSize; uniform float uScale; varying float vFacing;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFacing = dot(normalize(normalMatrix * position), normalize(-mv.xyz));
        gl_PointSize = uSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vFacing;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float fade = mix(0.2, 0.95, clamp(vFacing * 1.5, 0.0, 1.0));   // dimmer toward the limb
        gl_FragColor = vec4(uColor, smoothstep(0.5, 0.3, d) * fade);
      }`,
  });
  globe.add(new THREE.Points(dotGeo, dotMat));

  // atmosphere: back-facing shell that glows just outside the silhouette
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.13, 64, 48),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(CYAN) } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying vec3 vNormal;
        void main() {
          float glow = pow(clamp(-vNormal.z * 2.1, 0.0, 1.0), 2.0);
          gl_FragColor = vec4(uColor * glow * 0.55, glow * 0.55);
        }`,
    })
  ));

  /* ---------- markers: a beam per city, taller = more commits ---------- */

  const glowTexture = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.8)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  const UP = new THREE.Vector3(0, 1, 0), OUT = new THREE.Vector3(0, 0, 1);
  const maxCount = Math.max(1, ...clusters.map((cl) => cl.commits.length));
  clusters.forEach((cl, i) => {
    const n = toVec(cl.lat, cl.lon, 1);
    const h = 5 + (18 * Math.log(1 + cl.commits.length)) / Math.log(1 + maxCount);

    const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, h, 8, 1, true);
    beamGeo.translate(0, h / 2, 0);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.85 }));
    beam.position.copy(n).multiplyScalar(R);
    beam.quaternion.setFromUnitVectors(UP, n);

    const head = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture, color: CYAN, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    head.position.copy(n).multiplyScalar(R + h);
    head.scale.setScalar(7);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 1.9, 40),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.position.copy(n).multiplyScalar(R + 0.4);
    ring.quaternion.setFromUnitVectors(OUT, n);

    globe.add(beam, head, ring);
    Object.assign(cl, { n, h, beam, head, ring, phase: i * 0.37 });
  });

  /* ---------- arcs: trips between consecutive commit cities ---------- */

  const arcShader = {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aT; varying float vT;
      void main() {
        vT = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uHead; varying float vT;
      void main() {
        float d = uHead - vT;                                   // distance behind the comet's head
        float comet = step(0.0, d) * (1.0 - smoothstep(0.0, 0.3, d));
        gl_FragColor = vec4(uColor, 0.16 + 0.84 * comet);
      }`,
  };

  const trips = [];
  for (let i = 1; i < commits.length; i++) {
    const a = commits[i - 1].cluster, b = commits[i].cluster;
    if (a !== b) trips.push([a, b]);
  }
  const arcs = trips.slice(-MAX_ARCS).map(([a, b], k) => {
    const SEG = 64;
    const theta = a.n.angleTo(b.n), s = Math.sin(theta);
    const lift = R * (0.04 + (0.45 * theta) / Math.PI);   // longer trips fly higher
    const pos = new Float32Array((SEG + 1) * 3), ts = new Float32Array(SEG + 1);
    for (let j = 0; j <= SEG; j++) {
      const t = j / SEG;
      // great-circle interpolation (slerp), lifted off the surface in the middle
      const v = s > 1e-4
        ? a.n.clone().multiplyScalar(Math.sin((1 - t) * theta) / s).add(b.n.clone().multiplyScalar(Math.sin(t * theta) / s))
        : a.n.clone().lerp(b.n, t).normalize();
      v.multiplyScalar(R + lift * Math.sin(Math.PI * t));
      pos.set([v.x, v.y, v.z], j * 3);
      ts[j] = t;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aT", new THREE.BufferAttribute(ts, 1));
    const mat = new THREE.ShaderMaterial({
      ...arcShader,
      uniforms: { uColor: { value: new THREE.Color(PURPLE) }, uHead: { value: -1 } },
    });
    globe.add(new THREE.Line(geo, mat));
    return { mat, start: k * ARC_GAP };
  });
  const arcCycle = arcs.length ? arcs[arcs.length - 1].start + ARC_DUR + 2 : 1;

  /* ---------- view: drag to spin, inertia, idle auto-rotate, fly-to ---------- */

  const view = { yaw: 0, pitch: 0.35, vYaw: 0, vPitch: 0, target: null, lastInput: -1e9 };
  const busiest = clusters.reduce((best, cl) => (!best || cl.commits.length > best.commits.length ? cl : best), null);
  if (busiest) {
    view.yaw = -busiest.lon * D2R - 0.5;   // start just west of it; auto-rotate brings it to the centre
    view.pitch = clamp(busiest.lat * D2R * 0.8, -1.1, 1.1);
  }

  const pointer = { x: 0, y: 0, inside: false, down: false, moved: 0, lastMove: 0 };
  let hovered = null, selected = null;

  function localPoint(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  canvas.addEventListener("pointerdown", (e) => {
    [pointer.x, pointer.y] = localPoint(e);
    pointer.down = true;
    pointer.moved = 0;
    view.target = null;
    view.vYaw = view.vPitch = 0;
    view.lastInput = performance.now();
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (e) => {
    const [x, y] = localPoint(e);
    if (pointer.down) {
      const dx = x - pointer.x, dy = y - pointer.y;
      view.vYaw = dx * 0.005;
      view.vPitch = dy * 0.005;
      view.yaw += view.vYaw;
      view.pitch = clamp(view.pitch + view.vPitch, -1.1, 1.1);
      pointer.moved += Math.abs(dx) + Math.abs(dy);
      pointer.lastMove = view.lastInput = performance.now();
    }
    pointer.x = x;
    pointer.y = y;
    pointer.inside = true;
  });
  canvas.addEventListener("pointerup", () => {
    pointer.down = false;
    canvas.classList.remove("is-dragging");
    if (performance.now() - pointer.lastMove > 80) view.vYaw = view.vPitch = 0;   // held still before letting go
    if (pointer.moved < 6) select(pickCluster(pointer.x, pointer.y), true);       // a click, not a drag
  });
  canvas.addEventListener("pointercancel", () => {
    pointer.down = false;
    canvas.classList.remove("is-dragging");
  });
  canvas.addEventListener("pointerleave", () => {
    pointer.inside = false;
    hovered = null;
  });

  function select(cl, fly) {
    selected = cl;
    // stop a little short in pitch, so the beam is seen from the side rather than end-on
    if (cl && fly) view.target = { yaw: -cl.lon * D2R, pitch: clamp(cl.lat * D2R - 0.35, -1.1, 1.1) };
    renderPanel();
  }
  ui.clear.addEventListener("click", () => select(null));

  /* ---------- picking & tooltip ---------- */

  const scratch = new THREE.Vector3();
  function toScreen(local) {
    scratch.copy(local).applyMatrix4(globe.matrixWorld).project(camera);
    return { x: ((scratch.x + 1) / 2) * canvas.clientWidth, y: ((1 - scratch.y) / 2) * canvas.clientHeight };
  }

  // > 0 when the city is on the side of the globe facing the camera
  function facing(cl) {
    const normal = cl.n.clone().applyQuaternion(globe.quaternion);
    return normal.dot(camera.position.clone().sub(normal.clone().multiplyScalar(R)).normalize());
  }

  function distToSegment(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
  }

  // the beam nearest the pointer — the hit area is the whole beam plus a 16px margin
  function pickCluster(px, py) {
    let best = null, bestDist = 16;
    for (const cl of clusters) {
      if (facing(cl) < 0.12) continue;
      const d = distToSegment(px, py, toScreen(cl.n.clone().multiplyScalar(R)), toScreen(cl.n.clone().multiplyScalar(R + cl.h)));
      if (d < bestDist) { bestDist = d; best = cl; }
    }
    return best;
  }

  function fillTooltip(cl) {
    const latest = cl.commits[cl.commits.length - 1];
    const repos = new Set(cl.commits.filter((c) => !c.private).map((c) => c.repo)).size;
    tooltip.textContent = "";
    tooltip.append(
      el("strong", "tt-value", plural(cl.commits.length, "commit")),
      el("span", "tt-place", cl.place),
      el("span", "tt-line", `Latest: ${latest.private ? "private repository" : `“${latest.msg}”`} · ${ago(latest.when)}`),
      el("span", "tt-line", `Since ${shortDate(cl.commits[0].when)}${repos ? ` · ${plural(repos, "public repo")}` : ""}`)
    );
    tooltip.dataset.key = cl.key;
  }

  function updateTooltip() {
    const cl = hovered || selected;
    if (!cl || facing(cl) < 0.05) { tooltip.hidden = true; return; }
    if (tooltip.dataset.key !== cl.key || tooltip.hidden) fillTooltip(cl);
    tooltip.hidden = false;
    const tip = toScreen(cl.n.clone().multiplyScalar(R + cl.h));
    const w = tooltip.offsetWidth, h = tooltip.offsetHeight;
    const left = clamp(tip.x, w / 2 + 8, canvas.clientWidth - w / 2 - 8);
    const below = tip.y - h - 18 < 0;   // no room above → flip under the beam
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${below ? tip.y + 18 : tip.y - h - 14}px`;
  }

  /* ---------- side panel: stats, commit clock, feed ---------- */

  function renderPanel() {
    const list = selected ? selected.commits : commits;
    ui.title.textContent = selected ? selected.place : "All locations";
    ui.clear.hidden = !selected;

    const publicRepos = new Set(list.filter((c) => !c.private).map((c) => c.repo)).size;
    const tiles = selected
      ? [["Commits", compact.format(list.length)], ["Public repos", compact.format(publicRepos)],
         ["First here", monthYear(list[0].when)], ["Latest", ago(list[list.length - 1].when)]]
      : [["Commits", compact.format(list.length)], ["Cities", compact.format(clusters.length)],
         ["Countries", compact.format(new Set(clusters.map((cl) => cl.country)).size)], ["Public repos", compact.format(publicRepos)]];
    ui.stats.textContent = "";
    for (const [label, value] of tiles) {
      const tile = el("div", "globe-stat");
      tile.append(el("span", "globe-stat-label", label), el("span", "globe-stat-value", value));
      ui.stats.append(tile);
    }

    renderHours(list);
    renderFeed(list);
    canvas.setAttribute("aria-label",
      `3D globe of where my commits were made: ${plural(commits.length, "commit")} from ${plural(clusters.length, "city", "cities")}`);
  }

  function renderHours(list) {
    const counts = new Array(24).fill(0);
    for (const c of list) if (c.hour >= 0 && c.hour < 24) counts[c.hour]++;
    const max = Math.max(...counts);
    const peak = counts.indexOf(max);
    const night = [22, 23, 0, 1, 2, 3, 4].reduce((s, h) => s + counts[h], 0);
    const pct = (n) => (list.length ? Math.round((100 * n) / list.length) : 0);
    const summary = list.length ? `Peak ${pad(peak)}:00 · ${pct(night)}% after dark (22–05h)` : "No commits yet";

    ui.hours.textContent = "";
    counts.forEach((n, h) => {
      const col = el("div", "hour-col" + (h === peak && n ? " is-peak" : ""));
      const bar = el("span", "hour-bar");
      bar.style.height = n ? `${Math.max(6, (n / max) * 100)}%` : "0";
      col.append(bar);
      col.addEventListener("mouseenter", () => {
        ui.caption.textContent = `${pad(h)}:00–${pad((h + 1) % 24)}:00 · ${plural(n, "commit")} (${pct(n)}%)`;
      });
      col.addEventListener("mouseleave", () => { ui.caption.textContent = summary; });
      ui.hours.append(col);
    });
    ui.caption.textContent = summary;
    ui.hours.setAttribute("aria-label", `Commits by local hour of day. ${summary}. ` +
      counts.map((n, h) => `${pad(h)}:00 ${n}`).join(", "));
  }

  function renderFeed(list) {
    ui.feed.textContent = "";
    if (!list.length) { ui.feed.append(el("li", "feed-empty", "No commits yet.")); return; }
    for (const c of list.slice(-25).reverse()) {
      const li = el("li", "feed-row");
      const item = el("button", "feed-item");
      item.type = "button";
      item.append(
        el("span", "feed-msg" + (c.private ? " is-private" : ""), c.private ? "Private repository" : c.msg),
        el("span", "feed-where mono", `${c.cluster.city} · ${localClock(c)} local · ${ago(c.when)}`)
      );
      item.addEventListener("click", () => select(c.cluster, true));
      li.append(item);
      if (!c.private && c.repo) {
        // sample repos don't exist, so they stay plain text
        const repo = el(isSample ? "span" : "a", "feed-repo mono", `${c.repo} · ${c.sha}${c.add || c.del ? ` · +${c.add} −${c.del}` : ""}`);
        if (!isSample) {
          repo.href = `https://github.com/${c.repo}`;
          repo.target = "_blank";
          repo.rel = "noopener";
        }
        li.append(repo);
      }
      ui.feed.append(li);
    }
  }

  /* ---------- render loop (paused while scrolled off-screen) ---------- */

  let visible = true;
  new IntersectionObserver((entries) => {
    entries.forEach((e) => { visible = e.isIntersecting; });
  }, { threshold: 0.05 }).observe(canvas);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h || (canvas.width === Math.round(w * dpr) && canvas.height === Math.round(h * dpr))) return;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // back the camera off far enough that the globe and its beams fit whatever the panel's shape
    const halfV = (camera.fov / 2) * D2R, halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    camera.position.set(0, 0, (R * 1.32) / Math.sin(Math.min(halfV, halfH)));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    dotMat.uniforms.uScale.value = (h * dpr) / (2 * Math.tan(halfV));
  }

  let lastT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    resize();
    const t = now / 1000;
    const dt = Math.min(0.05, t - lastT);
    lastT = t;

    // rotation priority: fly-to target, then drag inertia, then idle auto-spin
    if (view.target) {
      const dYaw = wrapAngle(view.target.yaw - view.yaw), dPitch = view.target.pitch - view.pitch;
      view.yaw += dYaw * 0.08;
      view.pitch += dPitch * 0.08;
      if (Math.abs(dYaw) + Math.abs(dPitch) < 0.002) view.target = null;
    } else if (!pointer.down) {
      view.yaw += view.vYaw;
      view.pitch = clamp(view.pitch + view.vPitch, -1.1, 1.1);
      view.vYaw *= 0.93;
      view.vPitch *= 0.93;
      if (!selected && !reduceMotion && now - view.lastInput > 2500) view.yaw += 0.08 * dt;
    }
    globe.rotation.set(view.pitch, view.yaw, 0);
    globe.updateMatrixWorld();

    hovered = pointer.inside && !pointer.down ? pickCluster(pointer.x, pointer.y) : null;
    canvas.classList.toggle("is-pointing", !!hovered);

    // markers: pulse at the base; the hovered/selected one lifts, the rest dim while one is selected
    for (const cl of clusters) {
      const isLatest = cl === latestCluster;
      const p = ((t + cl.phase) % 2.4) / 2.4;
      cl.ring.scale.setScalar(1 + p * (isLatest ? 4 : 2.6));
      cl.ring.material.opacity = (1 - p) * (isLatest ? 0.9 : 0.5);
      const active = cl === hovered || cl === selected;
      const color = active ? LIFT : CYAN;
      cl.beam.material.color.setHex(color);
      cl.head.material.color.setHex(color);
      cl.ring.material.color.setHex(color);
      cl.beam.material.opacity = selected && !active ? 0.3 : 0.85;
      cl.head.scale.setScalar(active ? 10 : 7);
    }

    // arcs: a comet travels each trip in chronological order, then the journey replays
    const tc = t % arcCycle;
    for (const arc of arcs) {
      arc.mat.uniforms.uHead.value = reduceMotion ? -1 : ((tc - arc.start) / ARC_DUR) * 1.3;
    }

    updateTooltip();
    renderer.render(scene, camera);
  }

  stage.querySelector(".globe-badge").hidden = !isSample;
  renderPanel();
  requestAnimationFrame(frame);

  /* ---------- sample data (only shown until real commits are published) ---------- */

  function sampleCommits() {
    let seed = 20260705;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const PLACES = {   // lat, lon, country, UTC offset in minutes
      Bengaluru: [12.97, 77.59, "IN", 330], Tokyo: [35.68, 139.69, "JP", 540],
      Singapore: [1.35, 103.82, "SG", 480], London: [51.51, -0.13, "GB", 60],
      Berlin: [52.52, 13.4, "DE", 120], "San Francisco": [37.77, -122.42, "US", -420],
    };
    const TRIP = [["Bengaluru", 34], ["Tokyo", 9], ["Bengaluru", 16], ["Singapore", 4], ["Bengaluru", 12],
      ["London", 6], ["Berlin", 3], ["Bengaluru", 10], ["San Francisco", 7], ["Bengaluru", 9]];
    const REPOS = ["sample/vit-from-scratch", "sample/rag-playground", "sample/portfolio-website", "sample/tsp-annealing"];
    const MESSAGES = [
      "Add patch-embedding visualiser", "Tune learning-rate warmup", "Fix tokenizer edge case for emoji",
      "Stream the data loader instead of loading it all", "Add attention-rollout heatmaps",
      "Speed up 2-opt with neighbour lists", "Write README for the RAG demo", "Cache embeddings on disk",
      "Add unit tests for eval metrics", "Plot loss curves per epoch", "Add k-means++ initialisation",
      "Handle missing values in the pipeline", "Try a cosine LR schedule", "Fix off-by-one in sliding window",
      "Add Dockerfile for the inference API", "Improve mobile layout", "Quantise model to int8",
    ];
    const HOURS = [9, 10, 11, 11, 12, 14, 15, 16, 16, 17, 18, 19, 20, 21, 21, 22, 22, 23, 23, 0, 1];
    const totalDays = TRIP.reduce((s, [, d]) => s + d, 0);
    const iso = (localMs, offset) => {
      const d = new Date(localMs), sign = offset < 0 ? "-" : "+", a = Math.abs(offset);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:` +
        `${pad(d.getUTCMinutes())}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
    };

    const out = [];
    let day = Math.floor(Date.now() / 864e5) - totalDays;
    for (const [city, stay] of TRIP) {
      const [lat, lon, country, offset] = PLACES[city];
      for (let d = 0; d < stay; d++, day++) {
        const perDay = Math.floor(rand() * rand() * 6);   // mostly quiet days, a few busy ones
        for (let k = 0; k < perDay; k++) {
          const localMs = day * 864e5 + (pick(HOURS) * 60 + Math.floor(rand() * 60)) * 6e4;
          if (localMs - offset * 6e4 > Date.now() - 36e5) continue;   // nothing in the future
          const base = { t: iso(localMs, offset), lat, lon, city, country };
          out.push(rand() < 0.18 ? { ...base, private: true } : {
            ...base, repo: pick(REPOS), sha: Math.floor(rand() * 0xfffffff).toString(16).padStart(7, "0"),
            msg: pick(MESSAGES), files: 1 + Math.floor(rand() * 6), add: Math.floor(rand() * 180), del: Math.floor(rand() * 60),
          });
        }
      }
    }
    return out;
  }
})();
