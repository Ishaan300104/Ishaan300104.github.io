#!/usr/bin/env node
/* =========================================================
   Commit City data builder.
   Counts MY commits on the default branch of every repo I can
   see, and writes data/city.js for js/city.js to draw.

   Usage:
     CITY_TOKEN=<token> node tools/commit-city/build.js
     node tools/commit-city/build.js --sample   # fake data, no token
     node tools/commit-city/build.js --empty    # empty city

   The output has no timestamp, so the file only changes when
   the commit counts change. The GitHub Action relies on that.
   ========================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const USER = process.env.CITY_USER || "Ishaan300104";
const HF_USER = process.env.HF_USER || "NotIshaan";
const OUT = path.join(__dirname, "..", "..", "data", "city.js");
const API = "https://api.github.com";

function hashId(n) {
  return "p" + crypto.createHash("sha256").update(String(n)).digest("hex").slice(0, 8);
}

async function gh(url, token) {
  const res = await fetch(url.startsWith("http") ? url : API + url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "commit-city-builder",
    },
  });
  return res;
}

function lastPage(link) {
  if (!link) return null;
  const m = link.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  return m ? Number(m[1]) : null;
}

async function listRepos(token) {
  const repos = [];
  let url = "/user/repos?affiliation=owner,collaborator,organization_member&per_page=100";
  while (url) {
    const res = await gh(url, token);
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${await res.text()}`);
    repos.push(...(await res.json()));
    const next = (res.headers.get("link") || "").match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return repos;
}

async function countMine(repo, token) {
  const url = `/repos/${repo.full_name}/commits?author=${encodeURIComponent(USER)}&per_page=1`;
  const res = await gh(url, token);
  if (res.status === 409 || res.status === 404) return { commits: 0, lastCommit: null };
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${await res.text()}`);
  const items = await res.json();
  if (!items.length) return { commits: 0, lastCommit: null };
  const commits = lastPage(res.headers.get("link")) || items.length;
  const c = items[0].commit;
  const lastCommit = (c.committer && c.committer.date) || (c.author && c.author.date) || null;
  return { commits, lastCommit };
}

async function buildReal() {
  const token = process.env.CITY_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Set CITY_TOKEN (see tools/commit-city/README.md), or use --sample.");
  const repos = await listRepos(token);
  const out = [];
  for (const r of repos) {
    const { commits, lastCommit } = await countMine(r, token);
    if (!commits) continue;
    out.push(r.private
      ? { id: hashId(r.id), name: null, private: true, commits, lastCommit, language: null }
      : { id: String(r.id), name: r.name, url: r.html_url, private: false, commits, lastCommit, language: r.language || null });
  }
  return out;
}

function buildSample() {
  const names = ["portfolio-website", "vit-attention", "tsp-annealing", "kaggle-titanic", "rag-notes",
    "yolo-traffic", "dotfiles", "spark-etl", "llm-evals", "timeseries-lab", "cv-playground", "airflow-dags", "ab-testing", "streamlit-apps"];
  const langs = ["Python", "JavaScript", "Jupyter Notebook", "TypeScript", "Shell", null];
  const counts = [34, 12, 7, 58, 3, 140, 21, 9, 77, 15, 410, 5, 28, 46];
  const day = 86400000, base = Date.UTC(2026, 10, 6, 12);
  const out = [];
  for (let i = 0; i < 14; i++) {
    const priv = i % 4 === 2;
    const lastCommit = new Date(base - i * i * day * 2.5).toISOString().replace(".000", "");
    out.push(priv
      ? { id: hashId(1000 + i), name: null, private: true, commits: counts[i], lastCommit, language: null }
      : { id: String(1000 + i), name: names[i % names.length], url: `https://github.com/${USER}/${names[i % names.length]}`,
          private: false, commits: counts[i], lastCommit, language: langs[i % langs.length] });
  }
  return out;
}

/* ---------- Hugging Face: public models, datasets and Spaces ----------
   Only fields that change when I publish or update a project are kept
   (no likes or downloads), so the file does not churn every run. */
async function buildHF() {
  const out = [];
  for (const type of ["models", "datasets", "spaces"]) {
    const url = `https://huggingface.co/api/${type}?author=${encodeURIComponent(HF_USER)}&limit=1000&full=true`;
    const res = await fetch(url, { headers: { "User-Agent": "commit-city-builder" } });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    for (const x of await res.json()) {
      if (x.private) continue;
      out.push({
        id: x.id,
        type: type.slice(0, -1),                 // model | dataset | space
        name: x.id.split("/").pop(),
        task: x.pipeline_tag || x.sdk || null,
        created: x.createdAt || null,
        updated: x.lastModified || null,
      });
    }
  }
  return out;
}

function sampleHF() {
  const t = ["text-generation", "question-answering", null, "image-classification"];
  return ["OdeGPT-poetry", "Legal-SLM", "arduino-qa-v2", "arduino-qa-v3", "vit-alzheimer", "vit-alzheimer-aug", "gemma-autobiography-lora"]
    .map((n, i) => ({ id: `${HF_USER}/${n}`, type: i === 6 ? "space" : "model", name: n, task: t[i % 4],
      created: new Date(Date.UTC(2024, 9 + i * 3, 5)).toISOString().replace(".000", ""), updated: null }));
}

// keep the last good Hugging Face list if the API is down, so GitHub data still refreshes
function previousHF() {
  try {
    const txt = fs.readFileSync(OUT, "utf8");
    return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)).hf || [];
  } catch (e) { return []; }
}

async function main() {
  const args = process.argv.slice(2);
  let repos, hf;
  if (args.includes("--empty")) { repos = []; hf = []; }
  else if (args.includes("--sample")) { repos = buildSample(); hf = sampleHF(); }
  else {
    repos = await buildReal();
    try { hf = await buildHF(); }
    catch (e) { console.warn("Hugging Face fetch failed, keeping the old list: " + e.message); hf = previousHF(); }
  }
  hf.sort((a, b) => String(a.created).localeCompare(String(b.created)) || a.id.localeCompare(b.id));

  repos.sort((a, b) => String(b.lastCommit).localeCompare(String(a.lastCommit)) || a.id.localeCompare(b.id));

  const body =
    "/* Generated by tools/commit-city/build.js (GitHub Action, every 6 hours).\n" +
    "   Do not edit by hand. repos: one building each, commits = floors.\n" +
    "   hf: one tier each of the Hugging Face tower, oldest at the bottom. */\n" +
    "window.COMMIT_CITY = " + JSON.stringify({ user: USER, hfUser: HF_USER, repos, hf }, null, 2) + ";\n";

  const old = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : null;
  if (old === body) {
    console.log("data/city.js unchanged (" + repos.length + " repos).");
    return;
  }
  fs.writeFileSync(OUT, body);
  const total = repos.reduce((s, r) => s + r.commits, 0);
  console.log(`data/city.js written: ${repos.length} repos, ${total} commits, ${hf.length} Hugging Face projects.`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
