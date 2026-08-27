# Deployment Guide — Scraped Career Stats Revamp

This guide covers the changes pushed in commits `a3dd03e` and `4caa87d`,
and the one **manual step** required in the Render dashboard before the
end-to-end flow is live.

---

## What's already pushed (no action needed)

| Commit | Service | What it changes |
|---|---|---|
| `a3dd03e` | `ml-service` + `api-server` | Replaces the broken HTML scraper with a working JSON-API scraper, and fixes 30 wrong Cricbuzz player IDs |
| `4caa87d` | Frontend (Vercel) | Adds `useLiveTicker` and `useKohliShrineLive` hooks for live pop-ups |

Render auto-rebuilds and redeploys on push. Both services are already
running the new code:

- `https://cricket-dna-ml.onrender.com/scrape/player-stats/1413`
  returns real Kohli stats (14941 ODI runs, 58.59 avg, etc.)
- `https://cricket-dna-ml.onrender.com/scrape/health` → `{"status":"ok"}`

---

## The one manual step (Render dashboard)

The api-server can't reach the ML service because the `ML_URL` env var
on the **existing** api-server is still empty. Render only auto-fills
`fromService` references for *new* services created via Blueprint — for
existing services you have to set it manually once.

**Steps:**

1. Open the Render dashboard
   → `cricket-dna-api` service
   → **Environment** tab
2. Click **Add Environment Variable**
3. Key: `ML_URL`
4. Value: `https://cricket-dna-ml.onrender.com`
   (the public URL — works fine, no need to use the internal hostname)
5. **Save Changes** — this triggers an automatic redeploy

After the redeploy:

- `https://cricket-dna-api.onrender.com/health` will show
  `ml: "✅ available"` instead of `"⚠️ unavailable"`
- `https://cricket-dna-api.onrender.com/api/scrape/player-stats/1413`
  will return Kohli's real stats
- The api-server's bootstrap will populate the 30 player career rows
  in Postgres (zero RapidAPI credits used)
- `https://cricket-dna-api.onrender.com/api/kohli` will return 200 with
  `statsSource: "scraper"` instead of 503

---

## Optional: Vercel env var

If you want to point the Vercel frontend at the same api-server URL,
the env var is `VITE_API_URL=https://cricket-dna-api.onrender.com`.
Vercel auto-redeploys when env vars change. The frontend already
defaults to `http://localhost:3001` for local dev, so this is only
needed for the production deploy.

---

## Verifying the live pop-ups

After the ML_URL step is done:

- **Hero page ticker**: imports `useLiveTicker` (already exported from
  `src/hooks/usePlayerData.ts`). Renders one card per currently-live
  Cricbuzz match, polling every 30s. Pauses when the tab is hidden.
- **Kohli page**: `useKohliShrineLive` refetches every 60s. The shrine
  response includes `lastUpdated` (ISO timestamp) — display it as
  "Updated 5m ago" so users see when the data is fresh. The component
  files themselves were not touched (your UI work is intact).

If you want the ticker to actually show live data on the Hero page, the
simplest hookup is in `src/pages/Home.tsx` (or wherever the Hero
section lives) — add `const { data: live } = useLiveTicker();` and map
over `live?.matches`. The same pattern for Kohli's `useKohliShrineLive`
in `src/pages/KohliShrine.tsx`. I left these as separate hooks so you
can drop them in wherever fits your current UI.

---

## What's not changed (intentionally)

- Your uncommitted UI files in `artifacts/cricket-dna/src/components/ui/`,
  `src/lib/smooth-scroll.tsx`, `src/pages/KohliShrine.tsx`, etc. were
  not touched and not staged.
- The two RapidAPI keys exposed earlier in the chat still need to be
  rotated. Not blocking, just outstanding.
- Redis is still showing `❌ disconnected` in /health — this is the
  free Render Key Value store, not something the scraper depends on
  (the scraper has its own in-process LRU+TTL cache).
