# Commit City data

`build.js` counts **your** commits on the default branch of every repo you can see.
It writes `data/city.js`. `js/city.js` draws one tower per repo and one floor per commit.

The GitHub Action `.github/workflows/commit-city.yml` runs it every 6 hours.
It commits `data/city.js` only when a count changes.

## One-time setup

1. Create a fine-grained token: GitHub → **Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token**.
   - Repository access: **All repositories**.
   - Permissions: **Contents: Read-only** (Metadata: Read-only is added automatically).
   - Expiration: pick a date and put a reminder in your calendar to renew it.
2. In the site repo, open **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `CITY_TOKEN`. Value: the token.
3. Open **Actions → Commit City data → Run workflow** to fill the city now.

Note: the built-in `GITHUB_TOKEN` cannot see your other repos, so the Action needs this token.
Repos in organizations need the token to have access to that organization too.

## Privacy

For private repos, the file contains only: a hashed id, the commit count, and the last commit time.
No names, URLs, descriptions, or languages.

## What counts as a floor

- Commits that GitHub links to your account (`author=Ishaan300104`), on the default branch.
- A commit made with an email that is not on your GitHub account does not count.
  Add that email under **Settings → Emails** to count it.
- The bot's own data commits are not yours, so they add no floors.

## Run it locally

```bash
CITY_TOKEN=<token> node tools/commit-city/build.js   # real data
node tools/commit-city/build.js --sample             # fake city, for design work
node tools/commit-city/build.js --empty              # empty city ("under construction")
```

Do not commit sample data. Run `--empty` (or let the Action run) before you commit.
