/* =========================================================
   3D animated background — "neural network" particle field
   Built with Three.js (r128 UMD build, loaded in index.html)
   ========================================================= */

(function initBackground() {
  const canvas = document.getElementById("bg-canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0e1a, 0.0021);

  const camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 1, 1200
  );
  camera.position.z = 320;

  /* ---------- particles (the "neurons") ---------- */
  const PARTICLE_COUNT = 170;
  const SPREAD = 520;
  const MAX_LINK_DIST = 110;

  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      pos: new THREE.Vector3(
        (Math.random() - 0.5) * SPREAD,
        (Math.random() - 0.5) * SPREAD * 0.7,
        (Math.random() - 0.5) * SPREAD * 0.6
      ),
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35
      ),
    });
  }

  const pointsGeo = new THREE.BufferGeometry();
  const pointPositions = new Float32Array(PARTICLE_COUNT * 3);
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(pointPositions, 3));

  const pointsMat = new THREE.PointsMaterial({
    color: 0x66d9ff,
    size: 2.6,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(pointsGeo, pointsMat));

  /* ---------- connecting lines (the "synapses") ---------- */
  const maxLinks = PARTICLE_COUNT * 8;
  const lineGeo = new THREE.BufferGeometry();
  const linePositions = new Float32Array(maxLinks * 6);
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));

  const lineMat = new THREE.LineBasicMaterial({
    color: 0x66d9ff,
    transparent: true,
    opacity: 0.13,
  });
  scene.add(new THREE.LineSegments(lineGeo, lineMat));

  /* ---------- floating wireframe polyhedra ---------- */
  const shapes = [];
  const shapeDefs = [
    { geo: new THREE.IcosahedronGeometry(26, 0), pos: [-190, 90, -80] },
    { geo: new THREE.OctahedronGeometry(20, 0), pos: [210, -70, -60] },
    { geo: new THREE.TorusGeometry(18, 5, 8, 24), pos: [150, 120, -140] },
    { geo: new THREE.TetrahedronGeometry(16, 0), pos: [-160, -110, -40] },
  ];
  shapeDefs.forEach((def, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? 0x66d9ff : 0xb388ff,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
    });
    const mesh = new THREE.Mesh(def.geo, mat);
    mesh.position.set(def.pos[0], def.pos[1], def.pos[2]);
    mesh.userData.speed = 0.002 + Math.random() * 0.003;
    scene.add(mesh);
    shapes.push(mesh);
  });

  /* ---------- cursor "neuron" links ---------- */
  // extra, brighter lines drawn from the cursor to nearby particles,
  // so the mouse behaves like one more neuron joining the network
  const CURSOR_LINK_DIST = 130;
  const cursorLineGeo = new THREE.BufferGeometry();
  const cursorLinePositions = new Float32Array(PARTICLE_COUNT * 6);
  cursorLineGeo.setAttribute("position", new THREE.BufferAttribute(cursorLinePositions, 3));
  const cursorLineMat = new THREE.LineBasicMaterial({
    color: 0xb388ff,
    transparent: true,
    opacity: 0.45,
  });
  scene.add(new THREE.LineSegments(cursorLineGeo, cursorLineMat));

  // a soft glowing dot that follows the cursor in 3D space
  const cursorDot = new THREE.Mesh(
    new THREE.SphereGeometry(3.5, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xb388ff, transparent: true, opacity: 0.9 })
  );
  scene.add(cursorDot);

  /* ---------- mouse tracking ---------- */
  let mouseX = 0, mouseY = 0;           // normalized, for camera parallax
  const ndc = new THREE.Vector2(-10, -10); // normalized device coords, for raycasting
  const mouseWorld = new THREE.Vector3(9999, 9999, 0); // cursor position in 3D space
  let mouseActive = false;

  function updatePointer(clientX, clientY) {
    mouseX = (clientX / window.innerWidth - 0.5) * 2;
    mouseY = (clientY / window.innerHeight - 0.5) * 2;
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    mouseActive = true;
  }
  window.addEventListener("mousemove", (e) => updatePointer(e.clientX, e.clientY));
  window.addEventListener("touchmove", (e) => {
    if (e.touches.length) updatePointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener("mouseleave", () => { mouseActive = false; });

  // project the 2D cursor onto the z = 0 plane of the 3D scene
  function updateMouseWorld() {
    const ray = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const t = -camera.position.z / ray.z;
    mouseWorld.copy(camera.position).add(ray.multiplyScalar(t));
  }

  /* ---------- click shockwave ---------- */
  const REPEL_RADIUS = 100;
  const REPEL_FORCE = 0.9;
  const MAX_SPEED = 1.4;
  const BASE_SPEED = 0.35;

  window.addEventListener("click", () => {
    if (!mouseActive) return;
    // blast every particle within a wide radius away from the cursor
    const BLAST_RADIUS = 260;
    for (const p of particles) {
      const d = p.pos.distanceTo(mouseWorld);
      if (d < BLAST_RADIUS && d > 0.01) {
        const strength = (1 - d / BLAST_RADIUS) * 6;
        p.vel.add(p.pos.clone().sub(mouseWorld).normalize().multiplyScalar(strength));
      }
    }
    // pulse the cursor dot
    cursorDot.scale.setScalar(4);
  });

  /* ---------- animation loop ---------- */
  const HALF = SPREAD / 2;
  function animate(t) {
    requestAnimationFrame(animate);

    if (mouseActive) updateMouseWorld();

    // move particles, bounce at the edges, react to the cursor
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];

      // cursor repulsion — particles flow away from the mouse like a fluid
      if (mouseActive) {
        const d = p.pos.distanceTo(mouseWorld);
        if (d < REPEL_RADIUS && d > 0.01) {
          const strength = (1 - d / REPEL_RADIUS) * REPEL_FORCE;
          p.vel.add(p.pos.clone().sub(mouseWorld).normalize().multiplyScalar(strength * 0.15));
        }
      }

      // damp back toward cruising speed so bursts settle smoothly
      const speed = p.vel.length();
      if (speed > MAX_SPEED) p.vel.multiplyScalar(0.96);
      else if (speed > BASE_SPEED) p.vel.multiplyScalar(0.995);

      p.pos.add(p.vel);
      if (Math.abs(p.pos.x) > HALF) p.vel.x *= -1;
      if (Math.abs(p.pos.y) > HALF * 0.7) p.vel.y *= -1;
      if (Math.abs(p.pos.z) > HALF * 0.6) p.vel.z *= -1;
      pointPositions[i * 3] = p.pos.x;
      pointPositions[i * 3 + 1] = p.pos.y;
      pointPositions[i * 3 + 2] = p.pos.z;
    }
    pointsGeo.attributes.position.needsUpdate = true;

    // draw glowing links from the cursor to nearby particles
    let cursorLinks = 0;
    if (mouseActive) {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        if (particles[i].pos.distanceTo(mouseWorld) < CURSOR_LINK_DIST) {
          const a = particles[i].pos;
          cursorLinePositions.set(
            [mouseWorld.x, mouseWorld.y, mouseWorld.z, a.x, a.y, a.z],
            cursorLinks * 6
          );
          cursorLinks++;
        }
      }
    }
    cursorLineGeo.setDrawRange(0, cursorLinks * 2);
    cursorLineGeo.attributes.position.needsUpdate = true;

    // cursor dot follows the mouse; shrinks back after a click pulse
    cursorDot.visible = mouseActive;
    cursorDot.position.copy(mouseWorld);
    if (cursorDot.scale.x > 1) cursorDot.scale.multiplyScalar(0.92);

    // rebuild links between close particles
    let linkIdx = 0;
    for (let i = 0; i < PARTICLE_COUNT && linkIdx < maxLinks; i++) {
      for (let j = i + 1; j < PARTICLE_COUNT && linkIdx < maxLinks; j++) {
        if (particles[i].pos.distanceTo(particles[j].pos) < MAX_LINK_DIST) {
          const a = particles[i].pos, b = particles[j].pos;
          linePositions.set([a.x, a.y, a.z, b.x, b.y, b.z], linkIdx * 6);
          linkIdx++;
        }
      }
    }
    lineGeo.setDrawRange(0, linkIdx * 2);
    lineGeo.attributes.position.needsUpdate = true;

    // rotate the floating shapes
    shapes.forEach((s) => {
      s.rotation.x += s.userData.speed;
      s.rotation.y += s.userData.speed * 1.4;
      s.position.y += Math.sin(t * 0.0005 + s.position.x) * 0.05;
    });

    // gentle camera drift + mouse parallax
    camera.position.x += (mouseX * 40 - camera.position.x) * 0.03;
    camera.position.y += (-mouseY * 30 - camera.position.y) * 0.03;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  }
  animate(0);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();

/* =========================================================
   Typing effect for the hero role line
   ========================================================= */
(function initTyping() {
  const roles = [
    "Data Scientist",
    "ML Engineer",
    "Storyteller with Data",
    "Problem Solver",
  ];
  const el = document.getElementById("typed-role");
  let roleIdx = 0, charIdx = 0, deleting = false;

  function tick() {
    const word = roles[roleIdx];
    el.textContent = word.slice(0, charIdx);

    if (!deleting && charIdx === word.length) {
      deleting = true;
      setTimeout(tick, 1800);
      return;
    }
    if (deleting && charIdx === 0) {
      deleting = false;
      roleIdx = (roleIdx + 1) % roles.length;
    }
    charIdx += deleting ? -1 : 1;
    setTimeout(tick, deleting ? 45 : 95);
  }
  tick();
})();

/* =========================================================
   Reveal sections on scroll
   ========================================================= */
(function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
})();

/* =========================================================
   3D tilt effect on cards
   ========================================================= */
(function initTilt() {
  document.querySelectorAll(".tilt").forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        `perspective(800px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
})();

/* =========================================================
   Mobile nav toggle
   ========================================================= */
(function initNav() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  toggle.addEventListener("click", () => links.classList.toggle("open"));
  links.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => links.classList.remove("open"))
  );
})();
