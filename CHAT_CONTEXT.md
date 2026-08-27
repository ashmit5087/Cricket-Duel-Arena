# Cricket DNA — Revamped Data Architecture & Execution Plan

**Supersedes:** the earlier ML/roadmap doc's Section 4 (Data Pipeline) and the CricSheet-ETL portions of the quota-fix follow-up. Everything else from those docs (multi-algorithm Battle Engine, Judge logic, quiz feature, Kohli-hardcode fix) still stands unchanged — this file only revises **where career stats come from** and **cleans up the project directory** around that change.

**What changed and why:** RapidAPI's `cricbuzz-cricket` monthly quota (190 credits) was getting spent almost entirely on career-stat refreshes that don't need to be that fresh — a player's career average doesn't meaningfully change day to day. Swapping the *primary* source for career stats to a free, unlimited, self-hosted scraper (adapted from `tarun7r/cricket-mcp-server`) removes that spend entirely and keeps RapidAPI for the one thing that actually needs a real-time, reliable source: live match state. The CricSheet ETL is dropped — it solved the same problem with far more build effort (raw ball-by-ball data requiring your own aggregation pipeline) for no benefit over the scraper, which already returns pre-aggregated stats in the same shape Cricbuzz does.

---

## 1. Architecture

```
                    ┌─────────────────────────────────────────┐
                    │         Refresher worker (Express)        │
                    │         replaces the old 10s poller        │
                    │         runs every 8h + once on boot        │
                    │         if last snapshot >8h old (DB-checked)│
                    └───────────────┬─────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────────┐
              │                     │                         │
              ▼                     ▼                         ▼
  ┌───────────────────┐  ┌───────────────────────┐  ┌──────────────────┐
  │  Live match check   │  │  Career-stats refresh   │  │  (unchanged)       │
  │  RapidAPI, ~1 credit │  │  PRIMARY: scraper        │  │  Quota guard        │
  │  every 8h            │  │  (ml_service/scraper)     │  │  self-blocks at     │
  │  → if live: 1 scorecard│  │  FREE, unlimited          │  │  ~190 credits/mo    │
  │  covers all 22+ players│  │                          │  │                    │
  │                       │  │  FALLBACK: RapidAPI       │  │                    │
  │                       │  │  getPlayerStats(), 3 credits│  │                  │
  │                       │  │  only if scraper fails      │  │                    │
  └──────────┬───────────┘  └───────────┬───────────────┘  └────────┬──────────┘
             │                          │                            │
             └──────────────┬───────────┘                            │
                             ▼                                       │
                  ┌────────────────────────┐                        │
                  │  Postgres: player_career_stats │◄──────────────────┘
                  │  + stats_source column (NEW)     │
                  │  ("scraper" | "rapidapi")          │
                  │  extends the existing table —       │
                  │  no new snapshot table              │
                  └───────────┬─────────────────────┘
                              │  reads only, no external calls
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       battle.ts        players.ts        live.ts
       (Express routes users actually hit — instant, no external latency)
```

**The one rule that makes this work:** user-facing routes (`battle.ts`, `players.ts`, `live.ts`) never call the scraper or RapidAPI directly. Every external call — scraped or metered — happens inside the refresher worker, on its own schedule, writing to Postgres. Users always read a snapshot, never trigger a live fetch.

---

## 2. Where the scraper lives

Fold it into `ml_service` as a second router — don't stand up a 4th service.

```
ml_service/
├── main.py                    # battle predictions (unchanged from ML roadmap)
├── battle_engine.py           # unchanged
└── scraper/
    ├── cricbuzz_scrape.py     # adapted from tarun7r/cricket-mcp-server's get_player_stats
    └── router.py              # FastAPI: GET /scrape/player-stats/{cricbuzz_id}
```

Pull out the scraping logic itself, not the MCP server wrapper — `tarun7r`'s tool is built for an LLM client to call via MCP, which is the wrong protocol for a service-to-service call from Express. You want the plain scraping function underneath, exposed as a normal REST endpoint.

**Be a polite scraper:** add a delay/backoff between requests (this is scraping Cricbuzz's actual pages, not a metered API — don't hammer it), and cache results at the same 24h TTL already used for `TTL.CAREER_STATS` in `redis.ts`. No reason to re-scrape a player whose stats you pulled that morning.

---

## 3. Cleanup — remove clutter before adding anything new

The project has accumulated dead weight across this whole exploration (CricketData.org/CricAPI was evaluated and rejected, the CricSheet ETL is now also dropped, and a debug endpoint was added mid-investigation). Clear all of it out in one pass so the codebase reflects the current plan, not its history.

**Instructions to give Antigravity (or do yourself) as one cleanup task, before starting the scraper build:**

1. **Search the whole repo for CricketData.org / CricAPI references** — env vars (`CRICAPI_KEY`, `CRICKETDATA_*`), any client file (e.g. `services/cricketdata.ts` if one exists), package.json dependencies added for it, and any `.env.example` entries. Delete all of it — this provider was evaluated and explicitly rejected (free tier doesn't expose stats endpoints), it should not exist anywhere in the project.
2. **Remove the `/api/debug/raw-stats` endpoint** in `index.ts` (added during the quota debugging session) — and its line in the 404 route list. It served its purpose diagnosing the 429; leaving it live costs 3 credits per hit on an unauthenticated route.
3. **Delete any CricSheet-related scaffolding** if anything was started (ETL scripts, a `cricsheet/` directory, related package.json deps like YAML parsers added specifically for it) — the scraper replaces this scope entirely, don't leave half-built ETL code sitting alongside it.
4. **Audit `package.json` in both `api-server` and the frontend for unused dependencies** — anything installed for a path that got abandoned (CricAPI SDKs, CricSheet parsers, etc.) should be uninstalled, not just left unimported. Run a dependency-usage check (e.g. `npx depcheck`) rather than eyeballing it.
5. **Check `src/data/mockData.ts` and `src/data/localProfiles.ts`** — confirm whether either is still referenced now that live/scraped data is the real source, and delete whichever is dead weight rather than leaving mock data sitting next to real data as a maintenance trap.
6. **Rotate both previously-exposed RapidAPI keys** if that hasn't happened yet — this is still outstanding from the debug session and should close out before this cleanup is considered done.

**Clear caches after the cleanup and before the rebuild:**

- **Redis:** flush the `player:*`, `search:*`, and `bootstrap:failed:*` key patterns (not a blind `FLUSHALL` — the quota counter key `cricbuzz:quota:YYYY-MM` should survive) so nothing stale from the old poller/CricAPI/debug-endpoint era lingers:
  ```bash
  redis-cli --scan --pattern "player:*" | xargs redis-cli del
  redis-cli --scan --pattern "search:*" | xargs redis-cli del
  redis-cli --scan --pattern "bootstrap:failed:*" | xargs redis-cli del
  ```
- **Postgres:** the `bootstrap:failed:*` skip-marks living in Redis will already be cleared above; no Postgres data needs wiping — `player_career_stats` rows from the real Cricbuzz-backed bootstrap are still valid and shouldn't be discarded.
- **Local `node_modules`/build cache** on both `api-server` and the frontend after the `package.json` cleanup in step 4, so no stale compiled artifacts from removed dependencies linger:
  ```bash
  rm -rf node_modules dist .turbo && npm install
  ```

---

## 4. Execution plan (Antigravity task sequence)

```markdown
## Task 1 — Cleanup pass (do this first, before any new code)
"Search the repo for all CricketData.org/CricAPI references (env vars, client files,
package.json deps) and remove them entirely — this provider was evaluated and rejected.
Remove the `/api/debug/raw-stats` endpoint from `index.ts` and its 404-list entry.
Remove any CricSheet ETL scaffolding if present. Run `npx depcheck` in both
`api-server` and the frontend and uninstall anything flagged unused. Report the
full list of removed files/deps before committing."
Mode: Review-driven — deletions should be confirmed, not auto-applied blind.

## Task 2 — Scraper service
"Inside `ml_service/`, add a `scraper/` module adapting the `get_player_stats`
logic from tarun7r/cricket-mcp-server into a plain FastAPI endpoint:
`GET /scrape/player-stats/{cricbuzz_id}`, returning the same per-format shape
(Mat, Inn, Runs, Avg, SR, 100s, 50s, Wkts, Econ) as the existing RapidAPI parser
in `cricbuzz.ts`, so downstream code doesn't need to branch on source. Add
request delay/backoff and don't hit the same player twice within 24h (mirror
`TTL.CAREER_STATS`)."
Mode: Agent-driven — new, isolated module.

## Task 3 — Add stats_source column + refresher fallback chain
"Add a `stats_source TEXT` column to `player_career_stats` in `schema.sql`
(migration in `migrate.ts`). Update the refresher worker (replacing `poller.ts`,
per the earlier ML roadmap) so career-stat refresh calls the scraper first;
only on scraper failure/empty response does it fall back to `getPlayerStats()`
via RapidAPI. Record which source served each row."
Mode: Review-driven — touches the DB schema and the primary data-freshness path.

## Task 4 — Cache clear + verification
"Run the Redis key-pattern clears listed in Section 3 of this document. Rebuild
`node_modules` on both services after the dependency cleanup from Task 1. Then
run the refresher manually once and confirm: (a) all 30 roster players get
`stats_source = 'scraper'`, (b) zero RapidAPI credits were spent for career
stats specifically (check `GET /api/quota` before and after), (c) a live match
check still correctly falls through to RapidAPI as before."
Mode: Review-driven — this is the acceptance test for the whole revamp.
```

---

## 5. Updated credit budget (RapidAPI, post-revamp)

| Endpoint | Monthly usage | Notes |
|---|---|---|
| `matches/v1/live` | ~90 | Refresher, every 8h, unchanged |
| `mcenter/v1/{id}/hscard` | ~15 | Only when a live match exists |
| `stats/v1/player/{id}` (+ batting/bowling) | **~0–10** | Fallback only — fires solely when the scraper fails |
| `stats/v1/player/search` | ~10 | On-demand user search, cached forever |
| **Total** | **~115–125/month** | vs. ~180/month before — real headroom under the 190 self-block |

This is the actual payoff of the revamp: RapidAPI now exists purely as a live-match source and a safety net, not as the primary supplier of data that barely changes day to day.

---

# Handoff: Task 2 (Scraper Service) — In Progress

## Goal

User wants the Cricket DNA project to:
1. **Live data pop-ups on Kohli page + Hero page** as the scraper pushes fresh data
2. The full revamp: scraper as primary source for career stats, RapidAPI as fallback only

This is **Task 2** of the 4-task revamp. Task 1 (cleanup) is complete and committed. Tasks 3-4 (stats_source column + verification) come next.

## State

### Task 2 — Scraper service — ~85% done, one critical fix needed

**Files created (7):**
- `artifacts/ml/scraper/__init__.py` — module exports
- `artifacts/ml/scraper/cricbuzz_scrape.py` — adapted from `tarun7r/cricket-mcp-server`, fixed for Cricbuzz's 2026-08 HTML layout
- `artifacts/ml/scraper/router.py` — FastAPI router with 4 endpoints + 2 admin
- `artifacts/api-server/src/services/scraper.ts` — thin client for the api-server to call the scraper
- `artifacts/api-server/src/routes/scrape.ts` — `/api/scrape/*` proxy for the frontend

**Files edited (3):**
- `artifacts/ml/main.py` — wired `app.include_router(scraper_router)` after the CORS middleware
- `artifacts/ml/requirements.txt` — added `beautifulsoup4==4.12.3` and `lxml==5.3.0`
- `artifacts/api-server/src/index.ts` — imported and registered `scrapeRouter` at `/api/scrape`

### Verification status

| Check | Status |
|---|---|
| Python parses (`ast.parse`) | ✅ |
| FastAPI router registers 6 routes | ✅ (4 data + health + cache-clear) |
| api-server `pnpm build` | ✅ |
| Live test against Cricbuzz (Kohli `1413` — wrong ID but parser works) | ✅ All numbers match |
| Live test against the **real** roster IDs (`253802`, `625371`, etc.) | ❌ **NOT YET TESTED** — see Pitfalls below |
| Deploy on Render | ❌ Not yet (depends on Cricbuzz IDs being correct) |

### Decisions made during this session

1. **Scraper home = `artifacts/ml/scraper/`** (the deployed `cricket-dna-ml` service, not `ml_service/` at the project root which is a local-dev copy not on Render).
2. **Adapted from `tarun7r/cricket-mcp-server` directly**, not the MCP wrapper. The MCP framing is misleading — it's a `requests + BeautifulSoup` scraper with an MCP layer bolted on top.
3. **No Google search** — Cricbuzz serves `/profiles/{id}/anything` and ignores the slug, so we use `https://www.cricbuzz.com/profiles/{id}/player` for any id. (Earlier draft had an 800-entry `PLAYER_SLUGS` map with **wrong IDs** that I generated by guessing — that map was deleted.)
4. **Output shape matches the existing Cricbuzz RapidAPI parser at `cricbuzz.ts:347-405`** so downstream `getPlayerStats()` is source-agnostic. The shape is:
   ```json
   {
     "id": "1413", "name": "...", "country": "...", "role": "...",
     "battingStyle": "...", "bowlingStyle": "...",
     "stats": {
       "testMatches": { "Mat": 123, "Inn": 210, "Runs": 9230, "Avg": 46.85, "SR": 55.58, "HS": "254", "100": 30, "50": 31, "Wkts": 0, "Econ": 0.0, "BBI": "-" },
       "odiMatches":  { ... }, "t20Matches": { ... }, "ipl": { ... }
     },
     "source": "cricbuzz.com", "fetchedAt": "..."
   }
   ```
5. **Cricbuzz 2026-08 HTML layout is different from what the tarun7r scraper expected**:
   - Player name is in `<span class="text-xl font-bold ...">`, **not** `<div id="playerProfile"> <h1>` as tarun7r assumed
   - Career tables are bare `<table>` elements with **transposed orientation**: column headers are formats (`| Test | ODI | T20 | IPL`) in row 0, data rows are stat-name-first (`Matches | 123 | 314 | 125 | 283`)
   - **Batting table has "100s" row, bowling table has "Wickets" + "BBI" rows** — used as discriminators
   - **Batting and bowling tables share row names** ("Inn", "Runs", "Avg", "SR") with different meanings, so merging them naively corrupts the data — `_is_field_for_kind()` enforces which fields each kind owns (`batting = {Mat, Inn, Runs, Avg, SR, HS, 100, 50}`, `bowling = {Wkts, Econ, BBI}`)
6. **Thread-safe LRU+TTL cache** in the scraper (24h default for player stats, 60s for live matches, 30s for commentary), 1s inter-request delay to be polite to Cricbuzz.
7. **Endpoints exposed:**
   - `GET /scrape/player-stats/{cricbuzz_id}` — primary
   - `GET /scrape/live-matches` — for Hero ticker
   - `GET /scrape/match/{match_id}/scorecard`
   - `GET /scrape/match/{match_id}/commentary`
   - `GET /scrape/health` + `POST /scrape/cache/clear` — admin
   - api-server proxies all of these at `/api/scrape/*`

## Context — Critical data

### Real Cricbuzz IDs (from `artifacts/api-server/src/models/player.ts:140-172`)

The roster has 30 players. Examples:
- `virat-kohli` → `253802`
- `rohit-sharma` → `34102`
- `jasprit-bumrah` → `625371`
- `ms-dhoni` → `28081`
- `joe-root` → `303669`
- `kane-williamson` → `277906`
- `babar-azam` → `348144`
- `ab-de-villiers` → `44936`
- `pat-cummins` → `324418`
- `rishabh-pant` → `931581`
- `shubman-gill` → `1125619`
- `travis-head` → `434220`

(I tested with `1413` during dev — that happened to be a real Cricbuzz ID but for a different player. The actual roster IDs above must be verified to work.)

### Environment notes

- **Local Python: must use `C:/Users/Ashmit/AppData/Local/Programs/Python/Python312/python.exe`** — not the `python` alias (which is the hermes venv's 3.11) and not `C:/Python314/python.exe` (which has a different pip).
- **bs4 + lxml installed for Python 3.12** at that path. `requests` + `fastapi` + `uvicorn` also installed there for testing.
- **Shell is `sh` on Windows** — backslashes get eaten. Use forward slashes or `/d/...` paths.
- **api-server uses `pnpm`**, build with `pnpm build`.

### User constraints

- User said: *"only one thing i want live things to pop up on the frontend pages like kohli page and the hero page as it scrapes realtime data and every other change you mentioned you can go with it"*
- The "live pop-up" wiring (Socket.io push to Kohli + Hero) is in **Task 3 / a follow-up task** — Task 2 just provides the scraper that the wiring calls into.
- Two RapidAPI keys still exposed in chat history — user must rotate, but doesn't block Task 2.

## Next steps

1. **Verify the scraper works with the real roster IDs** — run a quick test fetching `253802` (Kohli), `625371` (Bumrah), `324418` (Cummins) and confirm output is well-formed. If 404s come back, the `cricbuzz.com` profiles might require a different URL pattern for some IDs.
2. **Commit Task 2** as a single reviewable commit. Suggested message:
   ```
   Add Cricbuzz scraper service (replaces RapidAPI for career stats)
   
   - Add ml/scraper/ with requests+BeautifulSoup adapted from
     tarun7r/cricket-mcp-server (MCP layer stripped)
   - 4 endpoints: player-stats, live-matches, scorecard, commentary
   - Output shape matches existing Cricbuzz RapidAPI parser
   - Thread-safe LRU+TTL cache (24h player stats, 60s live, 30s commentary)
   - 1s inter-request delay to be polite to Cricbuzz
   - Mount at /scrape on ml-service, /api/scrape on api-server (proxy)
   - Fix Cricbuzz 2026-08 HTML layout (transposed tables, span-based names)
   - Wire into ml-service main.py via app.include_router
   - Add beautifulsoup4 + lxml to ml/requirements.txt
   ```
3. **Task 3** (per the CHAT_CONTEXT.md plan): add `stats_source TEXT` column to `player_career_stats` in `schema.sql`, update `refresher.ts` to call scraper first → fall back to RapidAPI, record the source on each row.
4. **Task 4** (per the plan): cache clear + verification. Won't be possible until quota resets (currently exhausted) or until Task 3 ships and the next deploy exercises the fallback chain.
5. **Live pop-up feature** (the user's stated priority): wire Socket.io in the refresher to publish `career:updated` events; frontend subscribes on Kohli page (invalidate `["kohli","shrine"]` query) and Home page (LiveTicker from `/api/scrape/live-matches` polled every 30s).

## Pitfalls (don't repeat these)

1. **`cricbuzz.com/profiles/{id}` without a slug returns 404.** Use `/profiles/{id}/player` (any non-empty slug works — the slug is SEO metadata, not routing).
2. **The 800-entry `PLAYER_SLUGS` map was wrong.** I generated fake IDs by extrapolation and they mapped to other players (e.g. `625` is William Porterfield, not Jasprit Bumrah). Don't try to hand-curate this map — use any constant slug and trust the Cricbuzz ID passed in.
3. **Cricbuzz's HTML layout is now SPA-like for some sections.** The career tables are static (verified for 2026-08), but if a future layout change makes them client-rendered, the scraper will return empty stats and `refresher.ts` should fall back to RapidAPI. This is the right failure mode.
4. **Naive merge of batting + bowling tables corrupts data.** "Inn" in batting means batting-innings (e.g. 210 for Kohli Tests), in bowling means bowling-innings (e.g. 11). Merging both tables into the same dict per format overwrites one with the other. The fix: parse each table in isolation into a temp dict, then merge only fields the kind owns. See `_is_field_for_kind()` in `cricbuzz_scrape.py`.
5. **The `_http_get` HEADERS dict originally had `"Connection": "keep-alide"`** (typo). I left a re-assignment to `"keep-alive"` after the typo, but it's cleaner — just fix the typo in the dict literal directly.
6. **Function-block indentation bug**: when adding `_is_field_for_kind()` after the `for table, kind in summary_tables` loop, the `result = {...}` block ended up at module scope (no longer inside `get_player_stats`). Always re-verify function boundaries after structural edits — `python -c "import scraper.cricbuzz_scrape; print(scraper.cricbuzz_scrape.get_player_stats('1413'))"` returning `None` was the symptom.
7. **TypeScript `r.json()` returns `Promise<unknown>`** in strict mode. Need explicit cast: `return (await r.json()) as ScraperPlayerStats;`. I refactored to a generic `getJson<T>()` helper.
8. **`_http_get` uses a global lock** with a `_next_request_at` timestamp. This is single-process — if the ml-service runs multiple workers (it doesn't today; `--workers 1` in the Dockerfile), the throttle breaks across processes. Acceptable for now.
9. **bs4 + lxml must be installed in the SAME Python as `python`** for tests to work locally. The deployable Docker image installs from `requirements.txt` and works fine; the local test setup just needs you to use `C:/Users/Ashmit/AppData/Local/Programs/Python/Python312/python.exe` consistently.
10. **Don't add `/api/debug/raw-stats` back** — that was a one-shot for diagnosing the 429. Also, the KOHLI cache TTL is now 1h, not 24h, so refresher updates propagate quickly without manual cache-bust.
