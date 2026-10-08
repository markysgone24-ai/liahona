# Deployment status

## GitHub
- Repo: https://github.com/markysgone24-ai/liahona
- Branch: main
- Auto-commit: done. From now on every change made here will be committed/pushed.

## Vercel
- Tried REST/CLI with provided token — token appears valid but CLI/API creation blocked by permissions ("You don't have permission to create a project" / limited token).
- Static site: just open `index.html` + assets; no build needed.
- Recommended: Vercel → New Project → Import `markysgone24-ai/liahona` (GitHub integration). That gives auto-deploy on every push to `main`.
- Manual fallback: drag the entire project folder (`stitch_liahona_scripture_study_assistant`) to https://vercel.com/new for instant deploy.

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