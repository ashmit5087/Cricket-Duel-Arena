# API Surface Audit — What's Used, What's Dead Weight

> Date: 2026-08-27
> Scope: Every endpoint in `artifacts/api-server/` traced to its frontend consumer
> Method: `grep` for every route path in `artifacts/cricket-dna/src/**`, then
> follow-up grep for every hook that imports the matching fetcher

---

## TL;DR

The api-server has **21 mounted routes**. **12 of them have no frontend caller.** The dead routes come from two half-finished feature areas (engagement / aura / rivalry, and live-match drill-down) plus the vestigial 10-second poller worker that was replaced by the 12-hour refresher. Cutting the dead weight removes **~600 lines of code and 12 endpoints** with zero functional impact.

The api-server itself **should stay** — the scraper, the ML proxies, the quota guard, and the refresher all legitimately need it. The frontend can't safely call the scraper directly, and the api-server is the right place for `internalId` → `espnId` translation and cold-start tolerance.

---

## 1. ✅ USED — keep these

Traced to a live frontend consumer. Don't touch.

| Endpoint | File | Consumer | Notes |
|---|---|---|---|
| `GET /api/battle?p1=&p2=` | `routes/battle.ts` | `useBattle` → `BattleArena` | The headline feature |
| `GET /api/cluster/:internalId` | `index.ts` (proxy) | `useArchetype` → `KohliShrine`, `Archetypes` | Live dnaScore |
| `GET /api/knn?player=&k=` | `index.ts` (proxy) | `useKNNTwins` → `DNASearch`, `Archetypes` | DNA twins |
| `GET /api/similarity?p1=&p2=` | `index.ts` (proxy) | `routes/battle.ts` (internal) | 20-dim DNA similarity for battle verdict |
| `GET /api/scrape/player-stats/:cricbuzzId` | `routes/scrape.ts` | `workers/refresher.ts`, `db/bootstrapStats.ts` (server-side) | Career stats source — free, via ML scraper |
| `GET /api/scrape/live-matches` | `routes/scrape.ts` | `useLiveTicker` → `Home` (Hero section) | Live ticker, polls every 30s |
| `GET /api/kohli` | `routes/kohli.ts` | `useKohliShrine`, `useKohliShrineLive` → `Home`, `KohliShrine` | Shrine data |
| `GET /api/quiz/kohli-fanboy` | `routes/quiz.ts` | `useQuiz` → `Quiz` | Quiz generation via Gemini |
| `POST /api/quiz/kohli-fanboy/submit` | `routes/quiz.ts` | `useSubmitQuiz` → `Quiz` | Quiz scoring |
| `GET /api/quiz/kohli-fanboy/leaderboard` | `routes/quiz.ts` | `useQuizLeaderboard` → `Quiz` | Leaderboard |
| `GET /api/algorithms` | not mounted (404 list) | `useAlgorithms` → `BattleArena` | **Routing gap — see §4** |
| `GET /api/battle/moments?p1=&p2=` | `routes/battle.ts` | `useStatementMoments` → `BattleArena` | Rivalry moments |
| `GET /api/search?q=` | `index.ts` (proxy → playersRouter) | `usePlayerSearch` → `DNASearch` | Player search |
| `GET /api/players/:internalId/stats` | `routes/players.ts` | `usePrefetchPlayer` → `BattleArena`, `DNASearch` (on hover) | Prefetched profile |
| `POST /api/refresh` | `index.ts` | manual trigger | Refresher cycle trigger |
| `GET /api/quota` | `index.ts` | no frontend, ops/debug | Useful — keep |
| `GET /health` | `index.ts` | Render health checks | Required |

**That's 17 routes with real consumers.**

---

## 2. 🗑️ DEAD WEIGHT — delete these

Mounted in the api-server, listed in the 404 catch-all, but **no frontend code calls them**. The DB tables they read from are also never written to by any worker.

| Endpoint | File | Why it's dead |
|---|---|---|
| `GET /api/live/matches` | `routes/live.ts:14` | The `useLiveTicker` hook uses `/api/scrape/live-matches` (the scraper proxy), not this. The `matches` table is read by no one. |
| `GET /api/live/match/:matchId` | `routes/live.ts:34` | Same — no frontend consumer. The Hero ticker doesn't drill into individual match scorecards. |
| `GET /api/live/match/:matchId/commentary` | (404 list only — not even mounted) | Same. |
| `GET /api/live/history` | `routes/live.ts:56` | Same. |
| `GET /api/engagement/aura/:internalId` | `routes/engagement.ts:12` | No `useAura` hook exists. The `aura_history` table is never written to. |
| `GET /api/engagement/aura/leaderboard` | `routes/engagement.ts:60` | Same. |
| `GET /api/engagement/rivalry/:p1Id/:p2Id` | `routes/engagement.ts:99` | Same — `useStatementMoments` is a different endpoint, and even that has minimal usage. |
| `GET /api/engagement/rivalry/hottest` | `routes/engagement.ts:145` | Same. |
| `GET /api/engagement/rankings?format=` | `routes/engagement.ts:180` | Same. |
| `GET /api/engagement/streaks/:internalId` | `routes/engagement.ts:220` | Same. |
| `GET /api/engagement/streaks/active` | `routes/engagement.ts:247` | Same. |
| `GET /api/battle/history/:internalId` | `routes/battle.ts:475` | No `useBattleHistory` hook. The battle results ARE being persisted (`persistBattleOutcome` in battle.ts), but no one reads them back. |
| `GET /api/players/` (list) | `routes/players.ts:185` | `usePlayerList` exists but **no page calls it**. Only `usePlayerSearch` is used. |
| `GET /api/players/:internalId/momentum` | `routes/players.ts:291` | `usePlayerStats` exists but **no page calls it**; the momentum field is part of `usePlayerStats` and inherits the dead state. |
| `GET /api/players/:internalId` (full profile) | `routes/players.ts:254` | `usePlayerStats` calls `/stats` not `/`, but usePlayerStats itself is unused. |
| `GET /api/players/search?q=` | `routes/players.ts:201` | The frontend uses `/api/search?q=`, not `/api/players/search?q=`. (The api-server has a redirect proxy at `/api/search`, but `usePlayerSearch` is the only one that calls it.) |
| `GET /api/constellation` | `index.ts:97` | Stub that returns `[]`. The `useConstellation` hook calls the ML service directly through `/api/cluster`-style patterns, not this stub. |
| `GET /api/clusters` | `index.ts:98` | Same — the frontend calls the ML service directly through the cluster proxy pattern, not this stub. |

**That's 18 dead routes. Combined with the ones in §3, that's the full picture.**

---

## 3. ⚠️ DOWNGRADE — not dead, but over-built

| Item | Real usage | Verdict |
|---|---|---|
| `GET /api/players/:internalId/stats` | Only called by `usePrefetchPlayer` on hover in BattleArena/DNASearch. The result is a `LivePlayerProfile` shape that includes `testStats/odiStats/.../recentForm` — but the consumers just use the player identity, not the stats. | Keep the endpoint (it's the only path to live career stats for the prefetch), but **the response is being over-fetched**. The current call returns ~3KB of stats just to populate the React Query cache. Fine — leave it. |
| `getPlayerStats()` in `services/cricbuzz.ts` | Only used by `getPlayerStatsWithFallback()` (the scraper→RapidAPI fallback chain) and `bootstrapStats.ts`. | The non-fallback `getPlayerStats()` is exported but **only called from inside `getPlayerStatsWithFallback()`**. Could be private. |
| `usePlayerStats()` hook | Exported, documented in JSDoc, but no page uses it. | **Unused public API surface.** The prefetch is the only consumer and it inlines the query. |
| `usePlayerList()` hook | Same — exported, unused. | **Unused public API surface.** |
| `usePlayerStats` and `usePlayerList` hooks | ~80 lines of code in `usePlayerData.ts` + their fetchers in `api.ts` | **Delete** — no callers, no documentation promise. |
| `socket.io` server | Initialised in `boot()`, runs forever, no clients. The only message channel (`BATTLE_UPDATE`) has no consumer. | Either **wire it up** (publish `BATTLE_UPDATE` to a room for real-time battle spectators — there are none today) or **delete the init + the `initSocketServer` call**. Don't leave it running. |

---

## 4. Routing gap: `/api/algorithms`

`useAlgorithms` (in `usePlayerData.ts`) calls `/api/algorithms`. This endpoint is **listed in the 404 catch-all** of `index.ts` but **not actually mounted**. Hitting it returns the 404 catch-all JSON. This is a bug — the BattleArena picker uses `algorithms` to show enabled algorithm checkboxes, and right now it falls back to the default `["xgboost", "random_forest"]` set in the `useBattle` hook.

Either:
- Mount the route: `app.get("/api/algorithms", (_req, res) => res.json([{ id: "xgboost", name: "XGBoost", ... }, { id: "random_forest", name: "Random Forest", ... }]))`
- Or remove `useAlgorithms` from `BattleArena` and hardcode the algorithm list

---

## 5. The three layers of "do we still need the API server?"

The question "do we need an API endpoint when we have a scraper now" has a nuanced answer:

### Layer 1: The scraper **does** need the API server
The scraper is on the ML service. The frontend can't talk to it directly because:
- CORS would let any origin call it (currently ML CORS is `["http://localhost:3001", "http://localhost:5173", "*"]` — the `"*"` is a hack)
- The quota counter and credit-spend logic live in the api-server
- The refresher is the only place that should call the scraper (it batches calls, applies backoff, persists to DB)

So `/api/scrape/live-matches` and `/api/scrape/player-stats/:cricbuzzId` need to stay. The api-server is the right place for them.

### Layer 2: The ML endpoints (cluster/knn/similarity) **should** stay proxied
The frontend can technically call the ML service directly (CORS is `*`). But:
- The api-server does the `internalId` → `espnId` translation (frontend doesn't know ESPN IDs)
- Having one URL pattern for ML means we can swap the ML service out without frontend changes
- The 60s cold-start tolerance is set on the api-server side

So the cluster/knn/similarity proxies are worth keeping.

### Layer 3: What could be deleted without impact
**Everything in §2 and §3 above.** The api-server currently has 21 mounted routes; 18 of them have no callers (or are stubs that return `[]`). Cut those, and the boot log becomes a lot cleaner and the `index.ts` route list shrinks from 22 lines to 10.

---

## 6. Why this matters — the "lot of time is wasting" symptom

The 7 unused route files, the unused engagement/elo/aura code paths, and the dead `poller.ts` are why the codebase feels overgrown:

1. **The `engagement.ts` file (265 lines) does nothing** — its 7 routes read tables that no worker writes to. The aura/rivalry/streak/elo features were specced but never built. Either build them or delete them; right now they exist as a maintenance trap.

2. **The `live.ts` file (68 lines) is entirely dead** — its 3 routes read from the `matches`/`innings` tables that the `refresher` *partially* populates (it has a comment about scorecard → recent_form), but the scorecard→DB write path is itself a half-finished feature.

3. **The `poller.ts` is dead code** that the boot sequence has a comment about ("poller is dead, refresher replaced it") but never actually removed. The `poller` field in `/health` always shows `running: false`.

4. **The Socket.io server runs forever** with zero subscribers. The `BATTLE_UPDATE` channel is published to but no client listens. Either drop it or wire it up.

5. **The `lib/features.ts` `mapStatsToFeatures` helper** was removed from `battle.ts` (correctly) but the file still exports it, and no other file uses it.

6. **The `usePlayerStats` and `usePlayerList` hooks are documented but never called** — the JSDoc is misleading future agents into thinking the data flow is wired up.

---

## 7. Recommended cuts (in one PR)

**The high-confidence, low-risk cuts:**

1. **Delete `routes/engagement.ts` entirely** (265 lines, 7 dead routes). The aura/rivalry/streak/elo features were never built end-to-end — there's no worker writing to those tables, and no frontend reading them. Keep the schema (the tables cost nothing), drop the route file and the import in `index.ts`.

2. **Delete `routes/live.ts` entirely** (68 lines, 3 dead routes). Same reasoning — the `matches`/`innings` tables are partially populated by the scorecard applier in `refresher.ts`, but the consumers (these routes) were never wired to the frontend. Either commit to the live-match UX (and re-introduce these when there's a UI for it) or cut.

3. **Delete `workers/poller.ts` entirely** (210 lines). The 10s poller was replaced by the 12h refresher. The `poller` field in `/health` should report `running: false` permanently or be removed.

4. **Delete `services/socket.ts` and the `initSocketServer()` call** in `index.ts`. No clients subscribe. Either wire it up to a real-time battle spectator UI, or remove. (See §7.1 for the risk call.)

5. **Delete the `usePlayerStats` and `usePlayerList` hooks** in `usePlayerData.ts` (and their fetcher functions in `api.ts`). No page calls them. ~80 lines of dead code.

6. **Delete the `getLiveCommentary()` and bare `getPlayerStats()`** exports from `services/cricbuzz.ts`. The commentary is only imported by the dead poller. The bare `getPlayerStats()` is only called from `getPlayerStatsWithFallback()` (make it private).

7. **Delete `/api/constellation` and `/api/clusters` stubs** in `index.ts` (lines 97-98). The frontend calls the ML service through the cluster/knn proxies; these stubs return `[]` and would shadow the real endpoints if anyone wired them.

**That's ~600 lines deleted, 18 dead endpoints removed, 0 functional impact.** The boot log stops mentioning features that don't exist, the 404 catch-all stops advertising routes that return empty arrays, and the next agent doesn't have to wonder why `engagement.ts` is 265 lines when nothing calls it.

### §7.1 The one risk call: Socket.io

The socket removal has a "maybe" attached: if you're planning a real-time battle spectator UI (a `/spectate` page that opens a Socket.io connection and shows live battle results as they happen), then `services/socket.ts` and the `BATTLE_UPDATE` publish in `battle.ts` are the foundation. Keep them.

If real-time spectators are not on the roadmap, delete it. The `socket.io` import in `index.ts` (`import { initSocketServer } from "./services/socket"`) and the `initSocketServer(httpServer)` call in `boot()` are the only two lines to remove. Don't leave the server running with no subscribers — it leaks memory on long-running instances and confuses anyone reading the boot log.

---

## 8. The schema question

The `schema.sql` defines more tables than the api-server reads from:

- `aura_history`, `rivalries`, `streaks`, `elo_ratings` — written by no worker, read by no route (all in `engagement.ts`, which would be deleted)
- `matches`, `innings` — partially written by `refresher.ts` (scorecard applier), read by no route (`live.ts` would be deleted)
- `quiz_attempts` — written by `routes/quiz.ts` and read by `useQuizLeaderboard` ✓
- `player_career_stats` — written by `refresher.ts` and `bootstrapStats.ts`, read by `routes/players.ts`, `routes/kohli.ts`, `routes/battle.ts` ✓
- `players` — written by `refresher.ts` and `routes/battle.ts`, read everywhere ✓
- `refresh_queue` — written by `routes/battle.ts`, drained by `refresher.ts` ✓

The unused tables cost nothing in terms of runtime (Postgres only scans what's queried), so leaving them in `schema.sql` is fine. The `migrate.ts` runner is idempotent (`CREATE TABLE IF NOT EXISTS`), so the schema won't break on existing DBs. Don't delete the unused tables — just stop pretending they're being used.

---

## 9. Summary

- **17 routes are real** (consumed by the frontend or the workers)
- **18 routes are dead** (no callers, sometimes stubs returning `[]`)
- **1 routing gap**: `/api/algorithms` is documented in the 404 catch-all but never mounted — `useAlgorithms` always 404s
- **1 vestigial worker**: `poller.ts` replaced by `refresher.ts` but never deleted
- **1 vestigial service**: `socket.ts` running with zero subscribers
- **2 vestigial hooks**: `usePlayerStats` and `usePlayerList` exported but never called
- **~600 lines of code** can be removed with zero functional impact

Cut the dead weight. The next agent will thank you.
