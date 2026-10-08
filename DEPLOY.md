# Deployment status

## LIVE
- **URL: https://markysgone24-ai.github.io/liahona/**
- Host: GitHub Pages (source: `main` branch, `/` root), HTTPS enforced
- Auto-deploy: every `git push` to `main` rebuilds the site automatically
- `.nojekyll` added so all files are served as-is

## GitHub
- Repo: https://github.com/markysgone24-ai/liahona
- Branch: main
- Auto-commit: done. From now on every change made here will be committed/pushed.

## Vercel
- NOT USED. The provided token is a restricted token (`limited":true`): only `GET /v2/user` works; projects/teams/create all return 403 ("You don't have permission to create a project").
- To use Vercel instead, generate a full-access token at https://vercel.com/account/tokens (or import the repo in the dashboard). Not required, since GitHub Pages already serves the site.

## Supabase
- Project URL: https://jevszvneuftydyobpxgs.supabase.com
- Project ref: jevszvneuftydyobpxgs
- Publishable key saved to `src/config.js` (not a secret for client)
- DB connection string: you provided (with [YOUR-PASSWORD]) — keep secure.
- Saved to `.env.deploy` locally (gitignored). Credentials never committed.

## Local validation (keep minimal)
- `node --check src/views/settings.js src/views/read.js src/tts.js src/store.js src/config.js` still pass
- `node tools/verify-reader.js && node tools/audit-a11y.js && node tools/font-probe.js` still pass
- Full UI: `node tools/uitest.js` (80/80) and `tools/smoke.ps1` (0/18) pass

## Next steps (once you connect Vercel to GitHub)
- Vercel will auto-deploy after push. Provide live URL; I'll adjust if needed.

If you paste Supabase service role key or DB password, I'll store in `.env.deploy` (gitignored) and never commit.