# Portfolio Website — Data Scientist

A single-page portfolio with a 3D animated "neural network" background (Three.js),
glassmorphism cards, a typing effect, scroll-reveal animations, and 3D tilt cards.
No build tools needed — it's plain HTML/CSS/JS.

## Run it locally

Just double-click `index.html`. That's it.

## What to edit (all placeholders are marked with `PLACEHOLDER` comments)

| What | Where |
|---|---|
| Your name, tagline, roles | `index.html` (hero section) + typing roles in `js/main.js` |
| About / bio / stats | `index.html` → `#about` section |
| Skills | `index.html` → `#skills` section |
| Experience timeline | `index.html` → `#experience` section |
| Projects | `index.html` → `#projects` section |
| Tech stack pills | `index.html` → `#techstack` section |
| Email & social links | `index.html` → `#contact` section |
| Your photo | Save as `assets/profile.jpg`, then replace the `.photo-placeholder` div with `<img src="assets/profile.jpg" alt="Your Name" />` |
| Résumé | Save as `assets/resume.pdf` |
| Colors | `css/style.css` → the `:root` variables at the top |

## Deploy for free

### Option A — Netlify Drop (easiest, ~30 seconds, no account setup pain)
1. Go to <https://app.netlify.com/drop>
2. Drag this whole `portfolio-website` folder onto the page.
3. Done — you get a live URL instantly (you can rename it in Site settings).

### Option B — GitHub Pages (best long-term, free custom URL)
1. Create a repo on GitHub named `<your-username>.github.io`
2. In this folder, run:
   ```bash
   git remote add origin https://github.com/<your-username>/<your-username>.github.io.git
   git push -u origin main
   ```
3. Your site is live at `https://<your-username>.github.io` within a minute or two.
   (If you used a different repo name, enable Pages in repo **Settings → Pages →
   Deploy from branch → main**, and the URL becomes
   `https://<your-username>.github.io/<repo-name>`.)

### Option C — Vercel
1. Push to any GitHub repo (as above).
2. Go to <https://vercel.com>, sign in with GitHub, click **Import** on the repo.
3. Live URL + automatic redeploys on every push.
