# commit-globe

Puts every commit you make on the 3D globe in the portfolio's **Where I Ship Code**
section: which city it was made in, when, which repo, and how big it was.

Git doesn't store where a commit was made, so this tool records it at commit time:

```
git commit ──► post-commit hook ──► record.sh ──► ~/.commit-globe/commits.tsv   (private, stays on your machine)
                                                          │
                     node commit-globe.js publish  ◄──────┘
                                │
                                ▼
                         data/commits.js  ──► git push ──► globe on the live site
```

1. **Record:** a small `post-commit` hook runs `record.sh`. It reads the commit
   (time, repo, message, lines changed) and looks up your city from your public IP
   (ipinfo.io, falling back to ipwho.is), all in the background, so `git commit`
   isn't slowed down by the network. Lookups are cached for 20 minutes.
2. **Publish:** when you choose to, `publish` turns that log into `data/commits.js`,
   which the website reads. You review the diff, then commit and push as usual.

## Setup

Needs Node 18+ and git (Git for Windows is fine). Run from the portfolio folder:

```bash
node tools/commit-globe/commit-globe.js install ~/code ~/Desktop
```

This adds the hook to:
- the portfolio repo itself,
- every git repo found up to 4 levels under the folders you list (optional),
- git's template folder (`init.templateDir`), so **future** `git clone`s and `git init`s
  get it automatically.

Existing `post-commit` hooks are kept: the hook is added at the top of the file, between
`# >>> commit-globe >>>` markers. Repos that use `core.hooksPath` (e.g. husky) are skipped
and listed, so you can add the hook there yourself if you want.

## Day to day

```bash
node tools/commit-globe/commit-globe.js status    # is it working? last few recorded commits
node tools/commit-globe/commit-globe.js publish   # refresh data/commits.js
git diff data/commits.js                          # check what will go public
git add data/commits.js && git commit -m "Update commit globe" && git push
```

## Privacy

The site is public, so `publish` only shares what it can confirm is already public:

| Commit is from… | What appears on the site |
|---|---|
| a **public** GitHub repo (checked with the GitHub API) | city, time, repo, short sha, message, lines changed |
| anything else: private repos, GitLab/Azure DevOps, no remote | city and time only, shown as "Private repository" |
| a repo GitHub can't be reached for (offline, rate-limited) | treated as private |

- Coordinates are rounded to 1 decimal (about 11 km). Use `--precision 0` for about 110 km.
- `publish --public-only` leaves out private commits entirely.
- The local log never leaves your machine. Credentials embedded in remote URLs are
  stripped before anything is written.
- To stop recording a repo, delete the marked block from its `.git/hooks/post-commit`.
  To pause recording everywhere, set `COMMIT_GLOBE_DISABLE=1`.

## Behind a VPN

IP lookups find the VPN's exit point, not you. `status` and `publish` warn when the
location's time zone doesn't match your computer's clock. Pin your real location instead:

```bash
node tools/commit-globe/commit-globe.js pin 12.97 77.59 "Bengaluru" IN
node tools/commit-globe/commit-globe.js unpin     # back to IP lookups
```

Only commits made after pinning are affected. Already-recorded lines can be fixed by
editing `~/.commit-globe/commits.tsv` (it's tab-separated; Excel opens it).

## Uninstall

```bash
node tools/commit-globe/commit-globe.js uninstall
```

Removes the hook block from every repo it was installed in, restores `init.templateDir`,
and deletes the recorder. Your log (`~/.commit-globe/commits.tsv`) is kept. Delete it if you
don't need it. A repo cloned from the template that never committed afterwards may keep an
inert hook block that does nothing once the recorder is gone.

## Notes

- Commits replayed by `git rebase` aren't recorded again. Merges don't run `post-commit`,
  so they aren't recorded either.
- Corporate networks that inspect HTTPS: `publish` also trusts the operating system's
  certificate store (Node 22.19+ / 24.5+). On older Node, run it as
  `node --use-system-ca tools/commit-globe/commit-globe.js publish`.
- Until anything is published, the globe shows clearly-badged sample data.
- Files: `record.sh` (the recorder), `commit-globe.js` (the CLI). The site side is
  `js/globe.js`, `js/world-land.js` (land mask from Natural Earth, public domain) and
  `data/commits.js`.
