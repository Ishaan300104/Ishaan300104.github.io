# Complete Beginner's Guide to This Website

This document explains **everything that was done to build this site**, **what every
file does**, and **how websites work in general** — written for someone with zero
web-development background.

---

## 1. How a website works (the 60-second version)

A website is just a folder of text files that a **browser** (Chrome, Edge...) reads
and draws on screen. Three languages split the job:

| Language | Job | Analogy |
|---|---|---|
| **HTML** (`.html`) | The *content and structure* — headings, paragraphs, sections, links | The skeleton |
| **CSS** (`.css`) | The *appearance* — colors, fonts, spacing, layout, animations | The clothes & makeup |
| **JavaScript** (`.js`) | The *behavior* — anything that moves, reacts, or changes | The muscles |

When you open `index.html`, the browser reads it top to bottom. Inside it there are
two important "include" lines:
- `<link rel="stylesheet" href="css/style.css" />` → "also load the styles from this file"
- `<script src="js/main.js"></script>` → "also run the JavaScript in this file"

That's how the three files connect. No installation, no compiling — the browser does everything.

---

## 2. Every file in this folder and what it does

```
portfolio-website/
├── index.html      ← THE page. All your text content lives here.
├── css/
│   └── style.css   ← All colors, fonts, layout, hover effects, animations.
├── js/
│   └── main.js     ← The 3D background, typing effect, scroll animations, tilt cards.
├── assets/         ← Put your images & files here (profile.jpg, resume.pdf).
├── README.md       ← Quick-reference: what to edit + how to deploy.
├── GUIDE.md        ← This file.
└── .git/           ← Hidden folder created by Git (version history). Don't touch it.
```

### `index.html` — the content
- `index.html` is a special name: web servers automatically show it as the homepage.
- It is divided into `<section>` blocks, one per part of the page:
  `#hero` (big intro), `#about`, `#skills`, `#experience`, `#projects`,
  `#techstack`, `#contact`.
- The navigation bar links like `href="#projects"` simply scroll to the section
  with `id="projects"` — that's how one-page sites navigate.
- Everything you need to personalize is marked with `<!-- PLACEHOLDER ... -->`
  comments. Comments are notes for humans; the browser ignores them.

### `css/style.css` — the look
- The very top has a `:root { ... }` block defining **CSS variables** — the whole
  color scheme in one place. Change `--accent: #66d9ff;` to a different color code
  and the entire site re-themes itself.
- The "glass" cards use `backdrop-filter: blur(...)` — that's the frosted-glass effect.
- The `@media (max-width: 820px)` block at the bottom is the **responsive** part:
  rules that only apply on small screens (phones), e.g. turning the menu into a
  hamburger button.

### `js/main.js` — the motion
Split into small self-contained blocks, each with a banner comment:
1. **3D background** — uses a free library called **Three.js** (loaded from the
   internet by a line at the bottom of `index.html`). It draws ~170 floating dots
   and connects nearby ones with lines — a "neural network" look — plus some
   rotating wireframe shapes. It's fully interactive:
   - **Move the mouse** → the camera drifts (parallax), nearby particles are
     pushed away like a fluid, and glowing purple lines connect your cursor to
     nearby particles — as if your cursor were a neuron joining the network.
   - **Click anywhere** → a shockwave blasts particles outward, then they
     smoothly settle back to cruising speed.
   - Tuning knobs live near the top of the file: `REPEL_RADIUS` / `REPEL_FORCE`
     (push strength), `CURSOR_LINK_DIST` (cursor-line reach), `PARTICLE_COUNT`.
2. **Typing effect** — types and deletes the rotating job titles in the hero.
   Edit the `roles = [...]` list to change the words.
3. **Scroll reveal** — sections fade/slide in as you scroll to them.
4. **3D tilt** — cards tilt toward your cursor on hover.
5. **Mobile nav** — makes the ☰ button open/close the menu on phones.

### `assets/` — your stuff
Empty for now. Drop in:
- `profile.jpg` — your photo (then follow the README to display it)
- `resume.pdf` — linked from the "Download Résumé" button

### What is Three.js?
A hugely popular free JavaScript library for 3D graphics in the browser. We don't
have a copy of it in this folder — `index.html` loads it from a CDN (a public
file-hosting network) with this line:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```
This means the 3D background needs an internet connection to appear.

---

## 3. Exact steps that were taken to build this site

1. **Created the folder structure** — `portfolio-website/` with `css/`, `js/`,
   and `assets/` subfolders. (Separating files by type is just convention — it
   keeps things findable.)
2. **Wrote `index.html`** — the page skeleton with all seven sections and
   placeholder text everywhere personal info belongs.
3. **Wrote `css/style.css`** — dark theme, glassmorphism cards, gradient text for
   your name, the timeline design for Experience, pill design for Tech Stack, and
   phone-friendly rules.
4. **Wrote `js/main.js`** — the Three.js particle-network background and the
   smaller interaction effects listed above.
5. **Wrote `README.md`** — a cheat-sheet of what to edit and three free
   deployment options.
6. **Initialized Git** — ran `git init` inside the folder and made a first
   **commit** (a saved snapshot). Git is a version-history tool: every commit is a
   restore point, and it's also how you upload ("push") code to GitHub.
7. **Set the Git identity** to your GitHub account (`Ishaan300104` /
   `ishaan300104@gmail.com`) so commits are attributed to you.
8. **Installed the GitHub CLI (`gh`)** — a command-line tool for talking to
   GitHub (creating repos, pushing code) — into `~/.local/bin/gh`.
9. **Made the 3D background interactive** — cursor repulsion, cursor-to-particle
   "synapse" lines, and a click shockwave (see the `js/main.js` notes above).

---

## 4. How deployment works (getting the site online, free)

"Deploying" a site like this just means copying the folder to a computer that is
always on and reachable at a URL. Because this site is **static** (no database, no
server code), hosting it is free basically everywhere:

- **GitHub Pages** (what we're setting up): you push the code to a GitHub
  repository, GitHub serves it at `https://ishaan300104.github.io/<repo-name>`.
  Every future `git push` updates the live site automatically.
- **Netlify Drop**: drag the folder onto <https://app.netlify.com/drop> — instant
  URL, zero setup.
- **Vercel**: connect the GitHub repo at <https://vercel.com> — auto-deploys on
  every push.

## 5. Everyday workflow after editing (cheat-sheet)

Open a terminal in this folder, then:

```bash
git add -A                          # stage everything you changed
git commit -m "describe the change" # snapshot it
git push                            # upload → live site updates
```

To preview locally first: just double-click `index.html`.
