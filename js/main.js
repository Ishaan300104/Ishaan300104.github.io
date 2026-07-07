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

  /* ---------- mouse parallax ---------- */
  let mouseX = 0, mouseY = 0;
  window.addEventListener("mousemove", (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  /* ---------- animation loop ---------- */
  const HALF = SPREAD / 2;
  function animate(t) {
    requestAnimationFrame(animate);

    // move particles, bounce at the edges
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      p.pos.add(p.vel);
      if (Math.abs(p.pos.x) > HALF) p.vel.x *= -1;
      if (Math.abs(p.pos.y) > HALF * 0.7) p.vel.y *= -1;
      if (Math.abs(p.pos.z) > HALF * 0.6) p.vel.z *= -1;
      pointPositions[i * 3] = p.pos.x;
      pointPositions[i * 3 + 1] = p.pos.y;
      pointPositions[i * 3 + 2] = p.pos.z;
    }
    pointsGeo.attributes.position.needsUpdate = true;

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
