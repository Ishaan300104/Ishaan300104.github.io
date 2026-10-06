#!/usr/bin/env node
/* =========================================================
   commit-globe — record where you commit, show it on a globe.

     node tools/commit-globe/commit-globe.js <command>

   install [folders...]   add the post-commit hook to this repo, to every
                          repo found under the given folders, and to git's
                          template so future clones / `git init`s get it too
   uninstall              remove the hook everywhere it was installed
   status                 show what's installed and the latest recorded commits
   pin <lat> <lon> <city> [country-code]
                          record a fixed location (e.g. when a VPN hides yours)
   unpin                  go back to looking the location up from your IP
   publish [--public-only] [--precision N]
                          turn the private log into data/commits.js for the site

   No dependencies — needs Node 18+ and git.
   ========================================================= */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const GLOBE_HOME = process.env.COMMIT_GLOBE_HOME || path.join(os.homedir(), ".commit-globe");
const RECORDER = path.join(GLOBE_HOME, "record.sh");
const LOG = path.join(GLOBE_HOME, "commits.tsv");
const PIN = path.join(GLOBE_HOME, "pinned.tsv");
const REGISTRY = path.join(GLOBE_HOME, "repos.txt");
const TEMPLATE = path.join(GLOBE_HOME, "template");
const SITE_ROOT = path.resolve(__dirname, "..", "..");
const DATA_FILE = path.join(SITE_ROOT, "data", "commits.js");

const MARK_START = "# >>> commit-globe >>>";
const MARK_END = "# <<< commit-globe <<<";
const SKIP_DIRS = new Set(["node_modules", "venv", ".venv", "__pycache__", "AppData", "Library"]);

/* ---------- small helpers ---------- */

const posix = (p) => p.replace(/\\/g, "/");

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function readLines(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean) : [];
}

function expandHome(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

function hookBlock() {
  const rec = posix(RECORDER);
  return [
    MARK_START,
    "# records where & when each commit was made — see tools/commit-globe in the portfolio repo",
    `if [ -f "${rec}" ]; then sh "${rec}"; fi`,
    MARK_END,
  ].join("\n");
}

/* ---------- hook installation ---------- */

// add our block to <hooksDir>/post-commit, keeping any hook that's already there
function addHook(hooksDir) {
  const file = path.join(hooksDir, "post-commit");
  fs.mkdirSync(hooksDir, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `#!/bin/sh\n${hookBlock()}\n`);
    fs.chmodSync(file, 0o755);
    return "installed";
  }
  const current = fs.readFileSync(file, "utf8");
  if (current.includes(MARK_START)) return "already installed";
  const [first, ...rest] = current.split("\n");
  if (!/^#!.*\b(sh|bash|zsh|dash|ksh)\b/.test(first)) return "skipped (existing post-commit hook isn't a shell script)";
  // insert right after the shebang so an `exit` later in their hook can't skip us
  fs.writeFileSync(file, [first, hookBlock(), ...rest].join("\n"));
  return "added to existing hook";
}

function removeHook(hooksDir) {
  const file = path.join(hooksDir, "post-commit");
  if (!fs.existsSync(file)) return false;
  const current = fs.readFileSync(file, "utf8");
  const start = current.indexOf(MARK_START), end = current.indexOf(MARK_END);
  if (start === -1 || end === -1) return false;
  const remaining = current.slice(0, start) + current.slice(end + MARK_END.length).replace(/^\r?\n/, "");
  if (remaining.replace(/^#!.*/, "").trim() === "") fs.rmSync(file);
  else fs.writeFileSync(file, remaining);
  return true;
}

// the hooks folder git will actually use for this repo, or why we can't use it
function repoHooksDir(repo) {
  if (git(["config", "--get", "core.hooksPath"], repo)) {
    return { error: "skipped (repo uses core.hooksPath, e.g. husky — add the hook there by hand)" };
  }
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], repo);
  return common ? { dir: `${common}/hooks` } : { error: "skipped (not a git repository)" };
}

// git repos at or below `folder`, without descending into a repo once found
function findRepos(folder, depth = 4) {
  const found = [];
  (function walk(dir, level) {
    if (fs.existsSync(path.join(dir, ".git"))) { found.push(dir); return; }
    if (level >= depth) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && !SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), level + 1);
    }
  })(path.resolve(expandHome(folder)), 0);
  return found;
}

function register(hooksDir) {
  const known = readLines(REGISTRY);
  if (!known.includes(hooksDir)) fs.appendFileSync(REGISTRY, hooksDir + "\n");
}

// a template dir seeded with git's defaults, so new repos still get info/exclude etc.
function setUpTemplate() {
  const configured = git(["config", "--global", "init.templateDir"]);
  if (configured && path.resolve(expandHome(configured)) !== path.resolve(TEMPLATE)) {
    return { dir: path.resolve(expandHome(configured)), note: "your existing init.templateDir" };
  }
  if (!configured) {
    const defaults = path.resolve(git(["--exec-path"]), "..", "..", "share", "git-core", "templates");
    if (!fs.existsSync(TEMPLATE) && fs.existsSync(defaults)) fs.cpSync(defaults, TEMPLATE, { recursive: true });
    fs.mkdirSync(TEMPLATE, { recursive: true });
    git(["config", "--global", "init.templateDir", posix(TEMPLATE)]);
  }
  return { dir: TEMPLATE, note: "git template (future clones and `git init`)" };
}

function install(folders) {
  fs.mkdirSync(GLOBE_HOME, { recursive: true });
  const script = fs.readFileSync(path.join(__dirname, "record.sh"), "utf8").replace(/\r\n/g, "\n");
  fs.writeFileSync(RECORDER, script);
  fs.chmodSync(RECORDER, 0o755);
  console.log(`Recorder → ${RECORDER}\n`);

  const template = setUpTemplate();
  console.log(`  ${addHook(path.join(template.dir, "hooks")).padEnd(24)} ${template.note}`);

  const repos = new Set([SITE_ROOT]);
  for (const f of folders) findRepos(f).forEach((r) => repos.add(r));
  for (const repo of repos) {
    const { dir, error } = repoHooksDir(repo);
    if (error) { console.log(`  ${error}  ${repo}`); continue; }
    const result = addHook(dir);
    if (!result.startsWith("skipped")) register(dir);
    console.log(`  ${result.padEnd(24)} ${repo}`);
  }

  console.log(`
Done. Every commit in those repos is now logged privately to
  ${LOG}
When you want the website to show them:
  node tools/commit-globe/commit-globe.js publish
Behind a VPN? Pin your real location: … commit-globe.js pin <lat> <lon> "<city>" <country-code>`);
}

function uninstall() {
  const dirs = new Set(readLines(REGISTRY));
  const configured = git(["config", "--global", "init.templateDir"]);
  if (configured) dirs.add(path.join(path.resolve(expandHome(configured)), "hooks"));
  for (const dir of dirs) if (removeHook(dir)) console.log(`  removed  ${dir}`);

  if (configured && path.resolve(expandHome(configured)) === path.resolve(TEMPLATE)) {
    git(["config", "--global", "--unset", "init.templateDir"]);
    fs.rmSync(TEMPLATE, { recursive: true, force: true });
    console.log("  restored git's default init.templateDir");
  }
  // hooks we never saw (e.g. repos cloned from the template) become no-ops once the recorder is gone
  fs.rmSync(RECORDER, { force: true });
  fs.rmSync(REGISTRY, { force: true });
  console.log(`\nUninstalled. Your commit log was kept at ${LOG} — delete it if you don't need it.`);
}

/* ---------- status & location pinning ---------- */

function readLog() {
  const [header, ...rows] = readLines(LOG);
  if (!header) return [];
  const cols = header.split("\t");
  return rows.map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] || ""]));
  });
}

// minutes east of UTC for an IANA zone at a given moment ("Asia/Tokyo" → 540)
function zoneOffset(timeZone, date) {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date).find((p) => p.type === "timeZoneName").value;
    const m = name.match(/([+-])(\d{2}):(\d{2})/);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  } catch {
    return null;
  }
}

// IP location in one time zone while your clock is in another usually means a VPN
function looksLikeVpn(c) {
  const m = c.committed_at.match(/([+-])(\d{2}):(\d{2})$/);
  if (!c.timezone || !m) return false;
  const clock = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  const zone = zoneOffset(c.timezone, new Date(c.committed_at));
  return zone !== null && zone !== clock;
}

const VPN_HINT = "your clock's time zone doesn't match the IP location (a VPN?) — fix with `pin`";

function status() {
  const repos = readLines(REGISTRY);
  console.log(`Recorder:  ${fs.existsSync(RECORDER) ? RECORDER : "not installed — run `install`"}`);
  console.log(`Repos:     ${repos.length} with the hook${repos.length ? "\n  " + repos.join("\n  ") : ""}`);
  console.log(`Template:  ${git(["config", "--global", "init.templateDir"]) || "(not set)"}`);
  const pin = readLines(PIN)[0];
  console.log(`Location:  ${pin ? "pinned to " + pin.split("\t").filter(Boolean).join(", ") : "looked up from your IP"}`);

  const log = readLog();
  console.log(`\n${log.length} commits recorded in ${LOG}`);
  const recent = log.slice(-8);
  for (const c of recent) {
    const where = c.city ? `${c.city}, ${c.country}` : "unknown location";
    const flag = looksLikeVpn(c) ? "  ⚠ time zone mismatch" : "";
    console.log(`  ${c.committed_at.slice(0, 16).replace("T", " ")}  ${c.repo.padEnd(22).slice(0, 22)}  ${where}  (${c.located_by})${flag}`);
  }
  if (recent.some(looksLikeVpn)) console.log(`\n⚠ ${VPN_HINT}`);
}

function pin([lat, lon, city, country = ""]) {
  if (!city || !isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('usage: pin <lat> <lon> "<city>" [country-code]   e.g. pin 35.68 139.69 Tokyo JP');
  }
  fs.mkdirSync(GLOBE_HOME, { recursive: true });
  fs.writeFileSync(PIN, [city, "", country.toUpperCase(), Number(lat), Number(lon), ""].join("\t") + "\n");
  console.log(`New commits will be placed in ${city}${country ? ", " + country.toUpperCase() : ""} until you run \`unpin\`.`);
}

function unpin() {
  fs.rmSync(PIN, { force: true });
  console.log("Location will be looked up from your IP again.");
}

/* ---------- publishing ---------- */

// "owner/repo" for GitHub remotes, otherwise null
function githubSlug(remote) {
  const m = remote.match(/github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

// also trust the OS certificate store, so HTTPS works behind corporate TLS-inspecting proxies
// (needs Node 22.19+ / 24.5+; older versions just keep Node's built-in list)
function trustSystemCertificates() {
  const tls = require("tls");
  try {
    tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...tls.getCACertificates("system")]);
  } catch {}
}

// ask GitHub whether a repo is public — anything we can't confirm counts as private
async function lookUpRepo(slug) {
  const headers = { "User-Agent": "commit-globe", Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${slug}`, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 404) return { public: false };
    if (!res.ok) return { public: false, unverified: true };
    const info = await res.json();
    return { public: info.private === false, name: info.full_name };
  } catch {
    return { public: false, unverified: true };
  }
}

// some geolocation APIs return \u-escaped city names
function unescape(s) {
  if (!/\\u[0-9a-f]{4}/i.test(s)) return s;
  try { return JSON.parse(`"${s.replace(/"/g, '\\"')}"`); } catch { return s; }
}

async function publish(args) {
  const publicOnly = args.includes("--public-only");
  const pIdx = args.indexOf("--precision");
  const precision = pIdx === -1 ? 1 : Number(args[pIdx + 1]);
  if (!Number.isInteger(precision) || precision < 0 || precision > 4) throw new Error("--precision must be 0–4 decimals");
  const round = (v) => Number(Number(v).toFixed(precision));

  // newest record wins if a commit was somehow logged twice
  const bySha = new Map();
  let unlocated = 0;
  for (const c of readLog()) {
    if (c.lat === "" || c.lon === "" || !isFinite(c.lat) || !isFinite(c.lon)) { unlocated++; continue; }
    bySha.set(c.sha, c);
  }
  const rows = [...bySha.values()];

  const slugs = [...new Set(rows.map((c) => githubSlug(c.remote)).filter(Boolean))];
  trustSystemCertificates();
  const repos =new Map(await Promise.all(slugs.map(async (s) => [s, await lookUpRepo(s)])));
  const unverified = [...repos.values()].filter((r) => r.unverified).length;

  const commits = [];
  for (const c of rows) {
    const repo = repos.get(githubSlug(c.remote));
    const base = { t: c.committed_at, lat: round(c.lat), lon: round(c.lon), city: unescape(c.city), country: c.country };
    if (repo && repo.public) {
      commits.push({
        ...base, repo: repo.name, sha: c.sha.slice(0, 7), msg: c.subject.slice(0, 140),
        files: Number(c.files) || 0, add: Number(c.insertions) || 0, del: Number(c.deletions) || 0,
      });
    } else if (!publicOnly) {
      commits.push({ ...base, private: true });
    }
  }
  commits.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

  const generated = new Date().toISOString();
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, `/* Generated by \`node tools/commit-globe/commit-globe.js publish\` — re-run it to refresh;
   manual edits get overwritten. Commits from private repositories are anonymised:
   only their time and city are kept. */
window.COMMIT_GLOBE = {
  "generated": "${generated}",
  "commits": [
${commits.map((c) => "    " + JSON.stringify(c)).join(",\n")}
  ]
};
`);

  const pub = commits.filter((c) => !c.private).length;
  const cities = new Set(commits.map((c) => `${c.city}|${c.country}`)).size;
  console.log(`Wrote ${path.relative(SITE_ROOT, DATA_FILE)}: ${commits.length} commits from ${cities} cities`);
  console.log(`  ${pub} from public GitHub repos (message + repo shown)`);
  console.log(`  ${commits.length - pub} from private/non-GitHub repos (${publicOnly ? "left out" : "time + city only"})`);
  if (unlocated) console.log(`  ${unlocated} skipped — no location could be determined`);
  const vpn = rows.filter(looksLikeVpn).length;
  if (vpn) console.log(`  ! ${vpn} commit(s): ${VPN_HINT}`);
  if (unverified) console.log(`  ! couldn't check ${unverified} repo(s) with GitHub (offline or rate-limited) — treated as private; set GITHUB_TOKEN and re-run`);
  console.log("\nReview with `git diff data/commits.js`, then commit & push to update the live site.");
}

/* ---------- entry point ---------- */

const [command, ...rest] = process.argv.slice(2);
const commands = { install, uninstall, status, pin, unpin, publish };
if (!commands[command]) {
  console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^#!.*\n\/\*[=\s]*/, "").replace(/=+\s*$/, ""));
  process.exit(command ? 1 : 0);
}
Promise.resolve(commands[command](rest)).catch((err) => {
  console.error(err.message);
  process.exit(1);
});
