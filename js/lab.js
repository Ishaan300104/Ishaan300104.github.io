/* =========================================================
   ML in Motion — Interactive Lab
   Four themed animations:
     1. Self-Attention   (NLP / Transformers)  — canvas 2D
     2. Convolution      (Computer Vision)     — canvas 2D
     3. Gradient Descent (Deep Learning)       — Three.js
     4. K-Means          (Classical ML)        — canvas 2D
   Each animation pauses automatically when scrolled off-screen.
   ========================================================= */

(function () {
  "use strict";

  const CYAN = "#66d9ff";
  const PURPLE = "#b388ff";
  const MINT = "#69f0ae";

  /* ---------- shared helpers ---------- */

  // resize a canvas to its CSS size × devicePixelRatio and return a 2D context
  function fitCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  // pause animations that are scrolled out of view
  function watchVisibility(el, state) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => { state.visible = e.isIntersecting; });
    }, { threshold: 0.05 }).observe(el);
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* =========================================================
     1. SELF-ATTENTION — tokens with animated attention arcs.
        The highlighted "query" token cycles automatically;
        hovering a token makes it the query.
     ========================================================= */
  (function attentionDemo() {
    const canvas = document.getElementById("attention-canvas");
    if (!canvas) return;
    const state = { visible: true, hover: -1, query: 0, lastSwitch: 0, slots: null };
    watchVisibility(canvas, state);

    const tokens = ["attention", "is", "all", "you", "need"];

    // stable pseudo-random weight for a (head, query, key) triple
    function weight(h, q, k) {
      const s = Math.sin(h * 37.7 + q * 12.9898 + k * 78.233) * 43758.5453;
      return 0.15 + (s - Math.floor(s)) * 0.85;
    }

    canvas.addEventListener("mousemove", (e) => {
      if (!state.slots) return;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      state.hover = state.slots.findIndex((s) => x >= s.x0 && x <= s.x1);
    });
    canvas.addEventListener("mouseleave", () => { state.hover = -1; });

    function draw(t) {
      requestAnimationFrame(draw);
      if (!state.visible) return;
      const { ctx, w, h } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      if (state.hover >= 0) {
        state.query = state.hover;
        state.lastSwitch = t;
      } else if (t - state.lastSwitch > 2400) {
        state.query = (state.query + 1) % tokens.length;
        state.lastSwitch = t;
      }

      // lay out token pills along the bottom
      ctx.font = "500 14px 'JetBrains Mono', monospace";
      const gap = Math.max(8, w * 0.02), padX = 12, pillH = 32;
      const widths = tokens.map((tok) => ctx.measureText(tok).width + padX * 2);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (tokens.length - 1);
      let x = (w - total) / 2;
      const yPill = h - pillH - 14;
      state.slots = widths.map((wd) => {
        const s = { x0: x, x1: x + wd, cx: x + wd / 2 };
        x += wd + gap;
        return s;
      });
      const q = state.slots[state.query];

      // attention arcs from the query to every other token (two heads, two colors)
      [CYAN, PURPLE].forEach((color, head) => {
        state.slots.forEach((slot, k) => {
          if (k === state.query) return;
          const wgt = weight(head, state.query, k);
          const lift = 34 + Math.abs(slot.cx - q.cx) * 0.32 + head * 24;
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.10 + wgt * 0.45;
          ctx.lineWidth = 0.5 + wgt * 3;
          ctx.beginPath();
          ctx.moveTo(q.cx, yPill - 4);
          ctx.quadraticCurveTo((q.cx + slot.cx) / 2, yPill - lift, slot.cx, yPill - 4);
          ctx.stroke();

          // pulse traveling along the arc (quadratic bezier interpolation)
          const p = ((t * 0.0004 * (0.6 + wgt)) + k * 0.37 + head * 0.5) % 1;
          const mx = (q.cx + slot.cx) / 2, my = yPill - lift;
          const bx = (1 - p) * (1 - p) * q.cx + 2 * (1 - p) * p * mx + p * p * slot.cx;
          const by = (1 - p) * (1 - p) * (yPill - 4) + 2 * (1 - p) * p * my + p * p * (yPill - 4);
          ctx.globalAlpha = 0.3 + wgt * 0.7;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(bx, by, 2.4, 0, Math.PI * 2);
          ctx.fill();
        });
      });
      ctx.globalAlpha = 1;

      // token pills
      tokens.forEach((tok, i) => {
        const s = state.slots[i];
        const isQ = i === state.query;
        roundedRect(ctx, s.x0, yPill, s.x1 - s.x0, pillH, 8);
        ctx.fillStyle = isQ ? "rgba(102,217,255,0.18)" : "rgba(255,255,255,0.04)";
        ctx.fill();
        ctx.strokeStyle = isQ ? CYAN : "rgba(102,217,255,0.25)";
        ctx.lineWidth = isQ ? 1.6 : 1;
        ctx.stroke();
        ctx.fillStyle = isQ ? "#ffffff" : "#aab3c5";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tok, s.cx, yPill + pillH / 2 + 1);
      });

      // label
      ctx.fillStyle = "rgba(170,179,197,0.55)";
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText("softmax(QKᵀ/√d)·V", 12, 20);
    }
    requestAnimationFrame(draw);
  })();

  /* =========================================================
     2. CONVOLUTION — a 3×3 edge-detection kernel scans an
        input image and writes the real convolved output.
        Mouse over the input grid drives the kernel by hand.
     ========================================================= */
  (function convDemo() {
    const canvas = document.getElementById("conv-canvas");
    if (!canvas) return;
    const state = { visible: true, mouseCell: null, step: 0, lastStep: 0, pauseUntil: 0 };
    watchVisibility(canvas, state);

    const N = 16;
    const KERNEL = [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]]; // edge detector

    // input "image": a bright ring on a soft gradient
    const img = [];
    for (let r = 0; r < N; r++) {
      img[r] = [];
      for (let c = 0; c < N; c++) {
        const dx = c - N / 2 + 0.5, dy = r - N / 2 + 0.5;
        const d = Math.sqrt(dx * dx + dy * dy);
        img[r][c] = Math.min(1, Math.exp(-Math.pow(d - 4.2, 2) / 3) + (c / N) * 0.25);
      }
    }

    // true convolution result (clamped absolute response)
    function convAt(r, c) {
      let s = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const rr = Math.min(N - 1, Math.max(0, r + i));
          const cc = Math.min(N - 1, Math.max(0, c + j));
          s += img[rr][cc] * KERNEL[i + 1][j + 1];
        }
      }
      return Math.min(1, Math.abs(s) / 4);
    }

    const revealed = Array.from({ length: N }, () => new Array(N).fill(false));
    let geom = null; // computed per-frame layout

    canvas.addEventListener("mousemove", (e) => {
      if (!geom) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const c = Math.floor((x - geom.inX) / geom.cell);
      const r = Math.floor((y - geom.gridY) / geom.cell);
      state.mouseCell = (r >= 0 && r < N && c >= 0 && c < N) ? [r, c] : null;
    });
    canvas.addEventListener("mouseleave", () => { state.mouseCell = null; });

    function draw(t) {
      requestAnimationFrame(draw);
      if (!state.visible) return;
      const { ctx, w, h } = fitCanvas(canvas);
      ctx.clearRect(0, 0, w, h);

      // layout: input grid | arrow | output grid
      const cell = Math.min((w - 70) / (N * 2), (h - 46) / N);
      const gridW = cell * N;
      const inX = (w - gridW * 2 - 50) / 2;
      const outX = inX + gridW + 50;
      const gridY = (h - gridW) / 2 + 8;
      geom = { inX, outX, gridY, cell };

      // advance the kernel: mouse drives it, otherwise it auto-scans
      let kr, kc;
      if (state.mouseCell) {
        [kr, kc] = state.mouseCell;
        revealed[kr][kc] = true;
      } else {
        if (t > state.pauseUntil && t - state.lastStep > 55) {
          state.step++;
          state.lastStep = t;
          if (state.step >= N * N) {
            state.step = 0;
            state.pauseUntil = t + 1600; // admire the finished feature map
            for (const row of revealed) row.fill(false);
          }
        }
        kr = Math.floor(state.step / N);
        kc = state.step % N;
        revealed[kr][kc] = true;
      }

      // input grid (cyan-tinted intensities)
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          ctx.fillStyle = `rgba(102,217,255,${0.06 + img[r][c] * 0.75})`;
          ctx.fillRect(inX + c * cell, gridY + r * cell, cell - 1, cell - 1);
        }
      }
      // output grid (purple feature map, only revealed cells)
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const v = revealed[r][c] ? convAt(r, c) : 0;
          ctx.fillStyle = revealed[r][c]
            ? `rgba(179,136,255,${0.06 + v * 0.9})`
            : "rgba(255,255,255,0.025)";
          ctx.fillRect(outX + c * cell, gridY + r * cell, cell - 1, cell - 1);
        }
      }

      // kernel window on the input + link to the output cell being written
      ctx.strokeStyle = MINT;
      ctx.lineWidth = 2;
      ctx.strokeRect(inX + (kc - 1) * cell, gridY + (kr - 1) * cell, cell * 3, cell * 3);
      ctx.strokeStyle = "rgba(105,240,174,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(inX + kc * cell + cell * 1.5 - cell, gridY + kr * cell + cell / 2);
      ctx.lineTo(outX + kc * cell, gridY + kr * cell + cell / 2);
      ctx.stroke();
      ctx.strokeStyle = MINT;
      ctx.strokeRect(outX + kc * cell, gridY + kr * cell, cell - 1, cell - 1);

      // labels
      ctx.fillStyle = "rgba(170,179,197,0.6)";
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("input", inX + gridW / 2, gridY - 8);
      ctx.fillText("edge map", outX + gridW / 2, gridY - 8);
      ctx.fillText("⊛ 3×3", inX + gridW + 25, gridY + gridW / 2);
    }
    requestAnimationFrame(draw);
  })();

  /* =========================================================
     3. GRADIENT DESCENT — a 3D loss surface (Three.js) with
        glowing balls that roll downhill using real gradients
        + momentum. Click the surface to drop a new ball.
     ========================================================= */
  (function gradientDescentDemo() {
    const canvas = document.getElementById("gd-canvas");
    if (!canvas || !window.THREE) return;
    const state = { visible: true };
    watchVisibility(canvas, state);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 100);
    camera.position.set(0, 9.5, 13.5);
    camera.lookAt(0, -0.5, 0);

    const group = new THREE.Group();
    scene.add(group);

    // the "loss function": a bumpy bowl with several local minima
    const SIZE = 14;
    const f = (x, z) => 0.055 * (x * x + z * z) + 0.9 * Math.sin(x * 0.75) * Math.cos(z * 0.75);
    const grad = (x, z) => {
      const h = 0.01;
      return [(f(x + h, z) - f(x - h, z)) / (2 * h), (f(x, z + h) - f(x, z - h)) / (2 * h)];
    };

    // wireframe surface colored purple (valleys) → cyan (peaks)
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, 52, 52);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = f(pos.getX(i), pos.getZ(i));
      pos.setY(i, y);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const colors = new Float32Array(pos.count * 3);
    const cLow = new THREE.Color(PURPLE), cHigh = new THREE.Color(CYAN);
    for (let i = 0; i < pos.count; i++) {
      const c = cLow.clone().lerp(cHigh, (pos.getY(i) - minY) / (maxY - minY));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const surface = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, wireframe: true, transparent: true, opacity: 0.45,
    }));
    group.add(surface);

    // descending balls, each with a fading trail
    const TRAIL_LEN = 140;
    const balls = [];
    function spawnBall(x, z) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 14, 14),
        new THREE.MeshBasicMaterial({ color: MINT })
      );
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
      trailGeo.setDrawRange(0, 0);
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
        color: MINT, transparent: true, opacity: 0.55,
      }));
      group.add(mesh, trail);
      balls.push({ mesh, trail, trailGeo, x, z, vx: 0, vz: 0, pts: 0, stillFor: 0 });
    }
    const rnd = (s) => (Math.random() - 0.5) * SIZE * s;
    for (let i = 0; i < 3; i++) spawnBall(rnd(0.85), rnd(0.85));

    // click → raycast onto the surface → drop a ball there
    const raycaster = new THREE.Raycaster();
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(surface)[0];
      if (hit) {
        const local = group.worldToLocal(hit.point.clone());
        if (balls.length > 7) removeBall(balls.shift());
        spawnBall(local.x, local.z);
      }
    });
    function removeBall(b) { group.remove(b.mesh); group.remove(b.trail); }

    function respawn(b) {
      b.x = rnd(0.85); b.z = rnd(0.85);
      b.vx = b.vz = 0; b.pts = 0; b.stillFor = 0;
      b.trailGeo.setDrawRange(0, 0);
    }

    function animate() {
      requestAnimationFrame(animate);
      if (!state.visible) return;

      // keep renderer size in sync with the panel
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * Math.min(devicePixelRatio, 2)) {
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }

      for (const b of balls) {
        // gradient descent with momentum
        const [gx, gz] = grad(b.x, b.z);
        b.vx = b.vx * 0.93 - gx * 0.016;
        b.vz = b.vz * 0.93 - gz * 0.016;
        b.x = Math.max(-SIZE / 2, Math.min(SIZE / 2, b.x + b.vx));
        b.z = Math.max(-SIZE / 2, Math.min(SIZE / 2, b.z + b.vz));
        b.mesh.position.set(b.x, f(b.x, b.z) + 0.3, b.z);

        // trail
        if (b.pts < TRAIL_LEN) {
          b.trailGeo.attributes.position.set([b.x, f(b.x, b.z) + 0.25, b.z], b.pts * 3);
          b.pts++;
          b.trailGeo.setDrawRange(0, b.pts);
          b.trailGeo.attributes.position.needsUpdate = true;
        }

        // settled in a minimum → wait a moment, then start over elsewhere
        const speed = Math.abs(b.vx) + Math.abs(b.vz);
        b.stillFor = speed < 0.004 ? b.stillFor + 1 : 0;
        if (b.stillFor > 150 || b.pts >= TRAIL_LEN) respawn(b);
      }

      group.rotation.y += 0.0022;
      renderer.render(scene, camera);
    }
    animate();
  })();

  /* =========================================================
     4. K-MEANS — points cluster around moving centroids,
        re-shuffling into new blobs every few seconds.
        Click to inject your own data points.
     ========================================================= */
  (function kmeansDemo() {
    const canvas = document.getElementById("kmeans-canvas");
    if (!canvas) return;
    const state = { visible: true, lastShuffle: 0, inited: false };
    watchVisibility(canvas, state);

    const K = 3, COLORS = [CYAN, PURPLE, MINT];
    let pts = [], cents = [];
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

    function newTargets(w, h) {
      // pick K blob centers, then aim every point at one of them
      const centers = Array.from({ length: K }, () => [
        w * (0.18 + Math.random() * 0.64),
        h * (0.2 + Math.random() * 0.6),
      ]);
      pts.forEach((p, i) => {
        const [cx, cy] = centers[i % K];
        const spread = Math.min(w, h) * 0.16;
        p.tx = cx + gauss() * spread;
        p.ty = cy + gauss() * spread;
      });
    }

    function init(w, h) {
      pts = Array.from({ length: 90 }, () => ({
        x: Math.random() * w, y: Math.random() * h, tx: 0, ty: 0, k: 0,
      }));
      cents = Array.from({ length: K }, () => ({
        x: Math.random() * w, y: Math.random() * h,
      }));
      newTargets(w, h);
      state.inited = true;
    }

    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      for (let i = 0; i < 8; i++) {
        pts.push({ x, y, tx: x + gauss() * 30, ty: y + gauss() * 30, k: 0 });
      }
      while (pts.length > 220) pts.shift();
    });

    function draw(t) {
      requestAnimationFrame(draw);
      if (!state.visible) return;
      const { ctx, w, h } = fitCanvas(canvas);
      if (!state.inited) { init(w, h); state.lastShuffle = t; }
      if (t - state.lastShuffle > 7000) { newTargets(w, h); state.lastShuffle = t; }
      ctx.clearRect(0, 0, w, h);

      // points drift toward their blob targets with a little jitter
      for (const p of pts) {
        p.x += (p.tx - p.x) * 0.03 + (Math.random() - 0.5) * 0.7;
        p.y += (p.ty - p.y) * 0.03 + (Math.random() - 0.5) * 0.7;
      }

      // ASSIGN step: each point joins its nearest centroid
      const sums = Array.from({ length: K }, () => [0, 0, 0]);
      for (const p of pts) {
        let best = 0, bestD = Infinity;
        for (let k = 0; k < K; k++) {
          const d = (p.x - cents[k].x) ** 2 + (p.y - cents[k].y) ** 2;
          if (d < bestD) { bestD = d; best = k; }
        }
        p.k = best;
        sums[best][0] += p.x; sums[best][1] += p.y; sums[best][2]++;
      }
      // UPDATE step: centroids glide toward the mean of their cluster
      for (let k = 0; k < K; k++) {
        if (sums[k][2] > 0) {
          cents[k].x += (sums[k][0] / sums[k][2] - cents[k].x) * 0.06;
          cents[k].y += (sums[k][1] / sums[k][2] - cents[k].y) * 0.06;
        }
      }

      // membership lines
      ctx.lineWidth = 1;
      for (const p of pts) {
        ctx.strokeStyle = COLORS[p.k];
        ctx.globalAlpha = 0.06;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(cents[p.k].x, cents[p.k].y);
        ctx.stroke();
      }
      // points
      ctx.globalAlpha = 0.9;
      for (const p of pts) {
        ctx.fillStyle = COLORS[p.k];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // centroids: pulsing ring + white core
      cents.forEach((c, k) => {
        const pulse = 7 + Math.sin(t * 0.004 + k * 2) * 1.5;
        ctx.globalAlpha = 1;
        ctx.strokeStyle = COLORS[k];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(draw);
  })();

})();
