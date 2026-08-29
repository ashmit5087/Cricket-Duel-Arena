# Cricket DNA — Handoff Document

> Project: **Cricket Duel Arena** (Cricket DNA)
> Repo: `Cricket-Duel-Arena` (pnpm workspace, monorepo)
> Owner: ashmit5087
> Live URLs:
>   • Frontend: `https://cricket-dna.vercel.app` (Vercel)
>   • API:      `https://cricket-dna-api.onrender.com` (Render, free tier)
>   • ML:       `https://cricket-dna-ml.onrender.com` (Render, free tier, Docker)
>
> This document is the source of truth for the current state of the project.
> Read it fully before touching anything. If something here disagrees with
> the code, trust the code and update this file.

---

## 1. What this is

A visually immersive cricket statistics web app. 30 legendary cricketers,
8 K-Means-derived "archetypes" (A–H), and a live Battle Arena that compares
two players using:

- Real career stats scraped from Cricbuzz (per-format Mat/Inn/Runs/Avg/SR/100s/50s/Wkts/Econ)
- A 20-dim DNA vector per player built by `features.py`
- K-Means clustering, DBSCAN outlier detection, KNN, t-SNE constellation
- LLM-generated narrative (Google Gemini) for the post-battle summary
- Elo ratings + rivalry scoring across the battle history

The pitch: a player has a "DNA" — a 20-dim vector summarizing their cricket
identity. The pipeline clusters players into archetypes, finds DNA twins,
and predicts who wins a head-to-head. Every visible number on the site
(avg, SR, archetype, similarity, winner) is supposed to come from this
pipeline. The original codebase had a lot of hardcoded numbers as
placeholders; the current state of the project is "real data via the live
API, with mock data as a flicker-free placeholder while the API loads."

---

## 2. Architecture (3 services + 2 stores)

```
┌──────────────────────────┐     ┌──────────────────────────┐     ┌────────────────────────┐
│  Vercel: cricket-dna     │     │  Render: cricket-dna-api │     │  Render: cricket-dna-ml│
│  React 19 + Vite + Tail  │────▶│  Node/Express + TypeScript│────▶│  FastAPI + scikit-learn│
│  Port 5173 (dev)         │     │  Port 10000 (prod)        │     │  Port 8000             │
└──────────────────────────┘     └──────────┬───────────────┘     └──────────┬─────────────┘
                                            │                                │
                                            ▼                                ▼
                                  ┌──────────────────┐             ┌────────────────────┐
                                  │ Postgres (free)  │             │  Cricbuzz.com       │
                                  │ Redis (free)     │             │  (HTML scrape)      │
                                  └──────────────────┘             └────────────────────┘
                                                                 (RapidAPI as fallback)
```

**Data flow rules:**

1. **User-facing routes never call external APIs.** All Cricbuzz / RapidAPI
   calls happen inside the api-server's `refresher.ts` worker, on a 12-hour
   cadence + once on boot if the DB snapshot is stale. User requests read
   from Postgres (with a Redis cache layer in front).
2. **The ML service is read-only from api-server's perspective.** The
   api-server proxies frontend requests to the ML service, never the other
   way. The only thing the ML service writes is its own on-disk model cache
   (`artifacts/ml/data/`) and a 24h LRU+TTL in-process cache for scraped
   Cricbuzz pages.
3. **The frontend never talks to the ML service directly.** Always through
   `/api/*` proxies on the api-server. The ML URL is configured via the
   `ML_URL` env var on the api-server.

**Two ID spaces exist everywhere — be careful:**

- `cricbuzzPlayerId` (e.g. `"1413"` for Kohli) — used for Cricbuzz image
  URLs and the DB's `players.cricbuzz_player_id` column. The scraper
  accepts these IDs.
- `espnId` (e.g. `"253802"` for Kohli) — the ML pipeline is keyed on these
  (ESPN Cricinfo IDs). Required for any ML-backed endpoint.
- The roster in `artifacts/api-server/src/models/player.ts` has both. **Two
  players have `espnId: null`** (Suryakumar Yadav, Travis Head) — their ML
  calls will 404, and the battle route falls back to the ODI-average verdict
  for them.
- The api-server's `resolveEspnId(internalId)` helper in `src/index.ts`
  is the canonical translator.

---

## 3. Repository layout

```
Cricket-Duel-Arena/
├── artifacts/
│   ├── api-server/                  # Node/Express backend (TS)
│   │   ├── src/
│   │   │   ├── index.ts             # App boot, CORS, route mounting, ML proxies
│   │   │   ├── db/
│   │   │   │   ├── schema.sql       # Full schema (idempotent)
│   │   │   │   ├── migrate.ts       # Auto-runs schema.sql on boot
│   │   │   │   ├── bootstrapStats.ts# One-shot career stats backfill
│   │   │   │   ├── postgres.ts      # pg pool + helpers
│   │   │   │   └── redis.ts         # ioredis + cacheGet/Set + TTLs
│   │   │   ├── routes/
│   │   │   │   ├── battle.ts        # /api/battle — the main verdict
│   │   │   │   ├── players.ts       # /api/players/* — normalized profile
│   │   │   │   ├── kohli.ts         # /api/kohli — live shrine data
│   │   │   │   ├── live.ts          # /api/live/* — match data
│   │   │   │   ├── engagement.ts    # /api/engagement/* — aura, rivalry
│   │   │   │   ├── quiz.ts          # /api/quiz — Gemini-backed quiz
│   │   │   │   └── scrape.ts        # /api/scrape/* — proxy to ml scraper
│   │   │   ├── services/
│   │   │   │   ├── cricbuzz.ts      # RapidAPI client + quota guard
│   │   │   │   ├── scraper.ts       # ML-scraper proxy
│   │   │   │   └── socket.ts        # Socket.io init
│   │   │   ├── workers/
│   │   │   │   ├── poller.ts        # LEGACY 10s poller (kept for compat)
│   │   │   │   ├── refresher.ts     # 12h snapshot refresher — main worker
│   │   │   │   └── keepAlive.ts     # Self-ping every 10 min
│   │   │   ├── models/player.ts     # Roster + NormalisedPlayer type
│   │   │   ├── lib/
│   │   │   │   ├── snapshot.ts      # Postgres read/write helpers
│   │   │   │   └── features.ts      # (vestigial) feature vector helpers
│   │   │   └── utils/logger.ts      # Winston
│   │   └── package.json
│   │
│   ├── ml/                          # Python FastAPI ML service
│   │   ├── main.py                  # All FastAPI routes, lifespan, keep-alive
│   │   ├── pipeline.py              # CricketDNAPipeline (cluster/KNN/t-SNE)
│   │   ├── features.py              # PLAYER_BASE + 20-dim vector builder
│   │   ├── keep_alive.py            # Self-ping (env-gated)
│   │   ├── scraper/
│   │   │   ├── cricinfo_loader.py   # ESPN Cricinfo → raw_profiles.json
│   │   │   ├── cricbuzz_scrape.py   # Cricbuzz HTML/JSON scraper
│   │   │   ├── router.py            # /scrape/* FastAPI router
│   │   │   └── __init__.py          # Re-exports load_or_fetch_all
│   │   ├── data/                    # joblib-saved models + players.csv
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── cricket-dna/                 # React frontend (Vite)
│       ├── src/
│       │   ├── App.tsx              # Router + QueryClient + Layout
│       │   ├── main.tsx
│       │   ├── index.css
│       │   ├── lib/api.ts           # ALL fetch wrappers (apiFetch<T>)
│       │   ├── hooks/usePlayerData.ts # All React Query hooks
│       │   ├── data/mockData.ts     # Player roster (mirror) + archetypes
│       │   ├── pages/               # Home, BattleArena, KohliShrine, ...
│       │   ├── components/ui/       # shadcn/ui + custom (DriftWall, etc.)
│       │   └── components/layout/   # Navbar, Footer, ScrollToTop
│       └── package.json
│
├── lib/                             # (legacy from prior monorepo structure)
├── mockup-sandbox/                  # Throwaway design sandbox (ignore)
├── scripts/                         # Misc shell scripts
├── kohli-s-scroll-canvas-main/      # ⚠️ UNTRACKED template project, do not commit
├── docker-compose.yml               # Postgres + Redis + ml-service for local
├── render.yaml                      # Render Blueprint (Postgres + Redis + 2 web svcs)
├── env.example                      # All env vars documented
├── pnpm-workspace.yaml
├── package.json                     # Workspace root
├── CHAT_CONTEXT.md                  # Prior-session context
├── DEBUG_SESSION_2026-08-26.md      # Prior debug notes
├── DEPLOYMENT_GUIDE.md              # Manual Render setup steps
└── README.md
```

---

## 4. What runs where (deployment)

| Service       | Platform | Plan  | URL                                                          | Notes                                            |
|---------------|----------|-------|--------------------------------------------------------------|--------------------------------------------------|
| `cricket-dna-postgres` | Render  | free  | internal                                                     | DB: `cricket_dna`                                |
| `cricket-dna-redis`    | Render  | free  | internal                                                     | Key Value store, **often shows disconnected**     |
| `cricket-dna-ml`       | Render  | free  | `https://cricket-dna-ml.onrender.com`                        | Docker, `artifacts/ml/Dockerfile`                |
| `cricket-dna-api`      | Render  | free  | `https://cricket-dna-api.onrender.com`                       | Node, `artifacts/api-server/`                    |
| Frontend               | Vercel  | free  | `https://cricket-dna.vercel.app`                             | `artifacts/cricket-dna/`, `VITE_API_URL`         |

**Cold-start behaviour:** Render free tier sleeps services after 15 min of
inactivity. The api-server has a 10-min self-ping (`workers/keepAlive.ts`).
The ML service has a Python equivalent (`ml/keep_alive.py`), gated on
`KEEP_ALIVE_ENABLED=true` — set this in the Render dashboard for the
ml-service. First request after sleep takes 30–50s.

**Build commands:**

- api-server: `pnpm install && pnpm build` → `tsc && cp schema.sql dist/db/`
  Start: `node dist/db/migrate.js && node dist/db/bootstrapStats.js && node dist/index.js`
- ml-service: Docker build from `artifacts/ml/Dockerfile`, runs `uvicorn main:app`
- frontend: `pnpm install && pnpm build` → `tsc --noEmit && vite build`, output in `dist/`

**Required env vars on Render (api-server):**

- `GEMINI_API_KEY` — Google Gemini for battle narratives
- `QUIZ_SIGNING_SECRET` — any long random string
- `FRONTEND_URL` — Vercel URL, for CORS
- `ML_URL` — `https://cricket-dna-ml.onrender.com` (must be set manually
  on existing services; Render auto-fills `fromService` only for new
  Blueprint services)
- `KEEP_ALIVE_ENABLED` — `"true"`
- Postgres / Redis wiring via `fromDatabase` / `fromService` in `render.yaml`

**Required env vars on Render (ml-service):**

- `KEEP_ALIVE_ENABLED` — `"true"` (optional but recommended)

**Required env vars on Vercel (frontend):**

- `VITE_API_URL` — `https://cricket-dna-api.onrender.com`

**Local dev:**

```bash
docker compose up -d postgres redis        # local infra
# Terminal 1
cd artifacts/ml && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Terminal 2
cd artifacts/api-server && pnpm dev         # tsx watch on port 3001
# Terminal 3
cd artifacts/cricket-dna && pnpm dev        # Vite on port 5173
```

---

## 5. The data pipeline (the most important thing to understand)

### 5.1 ML pipeline (Python)

`artifacts/ml/features.py` defines 52 players in `PLAYER_BASE` (cricInfoId →
name/role/archetype). For each, `build_vector(profile)` produces a 20-dim
DNA vector where dims 0–7 are the radar chart axes (pressure, chase avg,
control, boundary %, consistency, big match, phase-3 SR, format
versatility) and dims 8–19 are deeper metrics (bowling, all-round, fielding,
IPL, era, win-corr, composite).

`artifacts/ml/pipeline.py` (singleton `pipeline`):
- `pipeline.fit(df)` — StandardScaler → PCA(0.9) → KMeans (k=6–10 swept by
  silhouette) → DBSCAN(eps=2.8) for outliers → maps KMeans clusters to
  archetype letters (A–H) via vote against `PLAYER_BASE.archetype_id` →
  cosine-similarity matrix on the original scaled 20-dim vectors → t-SNE
  for 2D constellation coords.
- `pipeline.get_twins(cricInfoId, k)` — KNN via the precomputed sim matrix
- `pipeline.get_similarity(c1, c2)` — direct lookup, returns 0–100 or -1
- `pipeline.get_constellation()` — all players with x,y for the map
- `pipeline.get_clusters()` — archetype definitions with real centroids
- `pipeline.load()` / `pipeline._save()` — joblib-pickle all artifacts to
  `artifacts/ml/data/` for fast cold-start

**Critical:** `cricInfoId` is coerced to `str` in both `fit()` and `load()`
because `pd.read_csv` infers int64 otherwise, and FastAPI path params are
strings. **Do not remove these coercions.** Previous bug history in
CHAT_CONTEXT.md and DEBUG_SESSION_2026-08-26.md.

### 5.2 ML service endpoints (`artifacts/ml/main.py`)

| Method | Path                          | What                                                                |
|--------|-------------------------------|---------------------------------------------------------------------|
| GET    | `/health`                     | `{status, players, fitted}` — used by api-server /health            |
| GET    | `/scrape/player-stats/{cb}`   | Career stats from Cricbuzz HTML (free, cached)                      |
| GET    | `/scrape/live-matches`        | Currently live matches (cached 60s)                                 |
| GET    | `/scrape/match/{id}/scorecard`| Full scorecard                                                      |
| GET    | `/scrape/match/{id}/commentary`| Recent commentary events                                            |
| GET    | `/scrape/health`              | Scraper liveness + cache stats                                      |
| POST   | `/scrape/cache/clear`         | Force-clear the in-process cache                                    |
| GET    | `/knn/{player_id}`            | Top-k DNA twins (cricInfoId, returns 0-20, default 5)                |
| GET    | `/similarity?p1=&p2=`         | 20-dim cosine similarity, 0-100 or -1                               |
| GET    | `/cluster/{player_id}`        | `{archetypeId, archetype, color, isOutlier, centroid, playerVector, dnaScore}` |
| GET    | `/clusters`                   | All 8 archetype definitions                                         |
| GET    | `/constellation`              | All players with t-SNE x,y                                         |
| GET    | `/players`                    | Debug: all players in pipeline                                      |
| POST   | `/refit?force_scrape=bool`    | Trigger a refit (used by weekly cron)                               |

### 5.3 API server ML proxies (`artifacts/api-server/src/index.ts`)

The api-server resolves `internalId` → `espnId` and proxies:

| API path                          | ML endpoint               | Returns                                   |
|-----------------------------------|---------------------------|-------------------------------------------|
| `GET /api/cluster/:internalId`    | `/cluster/{espnId}`       | Archetype + dnaScore + playerVector       |
| `GET /api/knn?player=&k=`         | `/knn/{espnId}?k=N`       | Top-k twins                               |
| `GET /api/similarity?p1=&p2=`     | `/similarity?p1=&p2=`     | 0-100 score                               |
| `GET /api/scrape/player-stats/:cricbuzzId` | `/scrape/player-stats/{cricbuzzId}` | Career stats                |
| `GET /api/scrape/live-matches`    | `/scrape/live-matches`    | Hero ticker                               |

`proxyToML()` uses a **60s timeout** to survive the 30–50s cold-start on
Render free tier.

### 5.4 Career stats flow

```
                  ┌──────────────────────────────────────────┐
                  │  workers/refresher.ts (12h + on boot)    │
                  └──────────────┬───────────────────────────┘
                                 │ (only place external calls happen)
              ┌──────────────────┼──────────────────┐
              ▼                                     ▼
   ┌────────────────────┐                ┌───────────────────────┐
   │ services/scraper.ts│                │ services/cricbuzz.ts  │
   │ → ML /scrape/*     │                │ → RapidAPI (fallback) │
   │ FREE, unlimited    │                │ 3 credits per player  │
   └─────────┬──────────┘                └───────────┬───────────┘
             │                                       │
             └──────────────┬────────────────────────┘
                            ▼
              ┌────────────────────────────┐
              │  player_career_stats table │
              │  + stats_source column     │
              │  ('scraper' | 'rapidapi')  │
              └────────────┬───────────────┘
                           │  read-only on user path
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
      routes/players   routes/kohli   routes/battle
```

**Quota guard:** `services/cricbuzz.ts` tracks monthly spend in Redis
(`cricbuzz:quota:YYYY-MM`) and self-blocks once ~190 credits are used
(plan is 200, the guard keeps 10 in reserve).

**Free-tier RapidAPI keys are exposed in the chat history — rotate them.**

---

## 6. Frontend

### 6.1 Routing

`App.tsx` (wouter) defines:
- `/`            → `Home` (Hero, live ticker, archetype grid)
- `/kohli`       → `KohliShrine` (Kohli-specific deep dive)
- `/battle`      → `BattleArena` (the head-to-head page)
- `/constellation` → `Constellation` (the t-SNE scatter)
- `/search`      → `DNASearch` (player lookup)
- `/archetypes`  → `Archetypes` (8-archetype deep dive)
- `/quiz`        → `Quiz` (Gemini-backed Kohli quiz)

### 6.2 Data hooks (`src/hooks/usePlayerData.ts`)

All React Query. **Each hook accepts a `placeholder` from `mockData.ts`
for flicker-free first render** (with one exception: `useBattle` has no
placeholder — it shows a loading state).

Key hooks:
- `usePlayerStats(cricInfoId, mockPlayer)` — full career stats
- `usePlayerList(params)` — filtered list
- `usePlayerSearch(query)` — debounced search
- `useKohliShrine()` — Kohli's live stats + lastUpdated timestamp
- `useLiveTicker()` — currently live matches (polls every 30s)
- `useConstellation()` — t-SNE coords
- `useClusters()` — archetype definitions
- `useArchetype(internalId)` — wraps `/api/cluster/:internalId` for the
  live dnaScore
- `useBattle(p1, p2, algorithms)` — the battle result
- `useStatementMoments(cricInfoId1, cricInfoId2)` — rivalry history
- `useQuiz()`, `useSubmitQuiz()`, `useQuizLeaderboard()`
- `useAlgorithms()` — what algorithms are enabled

Stale times in the same file (`STALE` const): 24h for career stats / ML
output, 1h for recent form / battle, 5m for search.

### 6.3 mockData.ts

**This is the source of placeholder data, NOT the source of truth.**
- `PLAYERS` — 30 players, mirrors the api-server roster
- `ARCHETYPES` — 8 archetype definitions (A–H) with hand-written
  descriptions
- `RADAR_AXES` — the 8 axis labels (must match `features.py` dim 0–7)
- `KOHLI_CAREER` — Kohli-specific stat block for the shrine

The `BATTLE_RESULTS` map was **deleted** in the latest commit. It had
hardcoded winner / dnaSimilarity values that never matched the live ML
output. The BattleArena now consumes the live API exclusively.

---

## 7. Key files to read before changing anything

| Want to change...                | Read first                                                                  |
|----------------------------------|-----------------------------------------------------------------------------|
| Battle verdict / DNA math        | `api-server/src/routes/battle.ts` (computeBattle), `ml/pipeline.py` (similarity/cluster) |
| Career stats source              | `api-server/src/services/scraper.ts`, `api-server/src/services/cricbuzz.ts`, `ml/scraper/cricbuzz_scrape.py` |
| Player profile (normalized)      | `api-server/src/routes/players.ts`, `api-server/src/models/player.ts`       |
| Roster (30 players)              | `api-server/src/models/player.ts` (the source), then `cricket-dna/src/data/mockData.ts` (mirrored) |
| Archetype definitions            | `ml/features.py` (PLAYER_BASE), `ml/pipeline.py` (ARCHETYPE_LABELS), `cricket-dna/src/data/mockData.ts` (UI copy) |
| Refresher / live data pipeline   | `api-server/src/workers/refresher.ts`                                       |
| Frontend data flow               | `cricket-dna/src/lib/api.ts`, `cricket-dna/src/hooks/usePlayerData.ts`       |
| ML model (clustering/KNN/t-SNE)  | `ml/pipeline.py`, `ml/features.py`                                          |
| Quiz (Gemini)                    | `api-server/src/routes/quiz.ts`, `cricket-dna/src/pages/Quiz.tsx`            |
| Engagement (aura/rivalry/streaks)| `api-server/src/routes/engagement.ts`, `api-server/src/db/schema.sql`        |
| Schema / migrations              | `api-server/src/db/schema.sql`, `api-server/src/db/migrate.ts`               |
| Deployment / env vars            | `render.yaml`, `env.example`, `DEPLOYMENT_GUIDE.md`                         |

---

## 8. Most recent changes (the agent should know about these)

1. **`stats_source` column added to `player_career_stats`** — migration
   added; tracks whether stats came from the scraper or RapidAPI.
2. **Battle route wired to live ML** — was previously calling a
   non-existent `/battle/predict`. Now it uses `/api/cluster/{id}` +
   `/api/similarity` proxies (with `espnId` resolution). BATTLE_RESULTS
   hardcoded map removed from frontend.
3. **`useArchetype` hook added** — wraps the cluster proxy; the Kohli
   hero DNA score and the `VIRAL_PAIRS` similarity numbers on the
   Archetypes page now bind to live KNN.
4. **Player profile cache key bumped to `player:full:v2:`** — forces a
   one-time re-fetch after the int/string id fix.
5. **`keep_alive.py` added to the ML service** — env-gated, pings every
   10 min. Set `KEEP_ALIVE_ENABLED=true` on the ml-service in Render.
6. **The two `cricInfoId`-as-int bugs are fixed** — coercions in
   `pipeline.py:fit()` and `pipeline.py:load()`, plus `str()` casts in ML
   endpoints. Don't remove them.

---

## 9. Known gotchas (read these before debugging)

1. **Two ID spaces.** `cricbuzzPlayerId` (Cricbuzz legacy, e.g. "1413")
   and `espnId` (ESPN Cricinfo, e.g. "253802"). The api-server's
   `resolveEspnId()` is the canonical translator. Frontend image URLs
   and Postgres snapshots use the Cricbuzz ID; the ML pipeline uses the
   ESPN ID.
2. **`Suryakumar Yadav` and `Travis Head` have `espnId: null`.** Their
   ML calls will 404, and the battle route falls back to the
   ODI-average verdict. Don't try to scrape their ESPN IDs.
3. **Redis is often "disconnected" in `/health`.** The free Render Key
   Value store is flaky. The api-server falls back to an in-memory
   `node-cache` instance, which is fine — only the daily quota counter
   cares, and that resets to 0 on restart anyway.
4. **Render cold-starts take 30–50s.** Keep-alive mitigates this for
   steady traffic, but the first hit after a sleep will be slow. The
   frontend placeholders cover the Kohli page; the Battle page shows a
   loading state via `useBattle` (no `placeholderData`).
5. **`useBattle` has no `placeholderData`.** This is intentional — the
   `BATTLE_RESULTS` mock map was removed because the numbers never
   matched the live API. While the API is in flight, the user sees the
   picker page (the `phase === "intro"` UI) and the result UI updates
   when `liveResult` arrives.
6. **Frontend `import.meta.env.VITE_API_URL`** is the only way the
   frontend knows the API URL. Default is `http://localhost:3001` for
   dev. Vercel env var must be set in the project settings.
7. **The Cricbuzz scraper is polite (delays) but not undetectable.**
   It's fine for 30 players, but if you fan it out across the full
   cricinfo roster, expect some 502s and back off.
8. **`mapStatsToFeatures` import in `routes/battle.ts` is unused**
   since the last edit (battle.ts now calls ML directly). Don't
   re-add it. The export still exists in `lib/features.ts` for any
   future caller.
9. **`kohli-s-scroll-canvas-main/` at the repo root is the user's
   untracked template project. Do not commit it.** When asked to push,
   only stage files under `artifacts/`.
10. **Two RapidAPI keys were exposed in the chat history
    (`...9f8` and `...d839`). Still need to be rotated.** Not blocking,
    but outstanding.

---

## 10. Verification checklist (post-deploy smoke test)

```bash
# ML service health
curl https://cricket-dna-ml.onrender.com/health
# → {"status":"ok","players":52,"fitted":true}

# ML cluster (Kohli = 253802)
curl https://cricket-dna-ml.onrender.com/cluster/253802
# → {archetypeId, archetype, color, isOutlier, centroid, playerVector, dnaScore}

# ML similarity
curl "https://cricket-dna-ml.onrender.com/similarity?p1=253802&p2=625371"
# → {p1, p2, similarity: <number 0-100>}

# api-server health (should show ml: ✅ connected)
curl https://cricket-dna-api.onrender.com/health
# → {"status":"ok"|"degraded", services: {ml: "✅ connected" or "⚠️ unavailable", ...}}

# API cluster proxy (internalId → espnId resolution)
curl https://cricket-dna-api.onrender.com/api/cluster/virat-kohli

# API knn proxy
curl "https://cricket-dna-api.onrender.com/api/knn?player=jasprit-bumrah&k=5"

# Battle route — the headline check
curl "https://cricket-dna-api.onrender.com/api/battle?p1=virat-kohli&p2=jasprit-bumrah&algorithms=xgboost,random_forest"
# → ml: {available: true, dnaSimilarity: <number>, winnerPredicted: "...", confidence: <number>, ...}

# Battle route for an espnId:null player (should still return, with ml.available=false)
curl "https://cricket-dna-api.onrender.com/api/battle?p1=virat-kohli&p2=surya-kumar-yadav&algorithms=xgboost,random_forest"

# Kohli shrine
curl https://cricket-dna-api.onrender.com/api/kohli
# → 200 with {currentStats, records, lastUpdated, statsSource: "scraper"}

# Live ticker data (scraper proxy)
curl https://cricket-dna-api.onrender.com/api/scrape/live-matches
```

**Acceptance:** Battle verdict should show non-null `ml.dnaSimilarity`,
non-null `ml.winnerPredicted`, and `ml.available: true` for any pair where
both players have an `espnId`. The Kohli shrine should return 200 with
`statsSource: "scraper"` and a recent `lastUpdated` timestamp.

---

## 11. Open work / not-yet-done (in priority order)

1. **Rotate the two exposed RapidAPI keys.** Free tier; just go to the
   RapidAPI dashboard and generate new ones, update Render env vars.
2. **Battle result caching** — currently cached for 1h, but the cache
   key doesn't include the algorithm list. If a user re-battles the same
   pair with different algorithms, they get the same cached result.
   Minor.
3. **Quiz signing secret rotation policy** — `QUIZ_SIGNING_SECRET` is
   read at boot, so changing it invalidates all outstanding quiz tokens
   (forces re-start of any in-flight quiz). Acceptable; just be aware.
4. **Redis quota counter is per-instance** — falls back to in-memory
   when Redis is down, so on restart the monthly counter resets to 0.
   The guard is best-effort. Acceptable given the 200-credit ceiling is
   rarely approached.
5. **Frontend mock data is large (~700 lines).** Once all the live
   hooks are stable, `mockData.ts` could be slimmed down to just
   `PLAYERS` and `ARCHETYPES` (the placeholders the hooks need). Not
   urgent.
6. **The 30-player roster is hardcoded in two places** (api-server
   `models/player.ts` and frontend `data/mockData.ts`). Single source
   of truth would be cleaner — but the current duplication lets the
   frontend ship without an API call for first render.

---

## 12. Quick reference: common commands

```bash
# Local dev (3 terminals)
docker compose up -d postgres redis
cd artifacts/ml && uvicorn main:app --reload --port 8000
cd artifacts/api-server && pnpm dev
cd artifacts/cricket-dna && pnpm dev

# Type-check everything
cd artifacts/api-server && pnpm exec tsc --noEmit
cd artifacts/cricket-dna && pnpm exec tsc --noEmit

# Build everything
cd artifacts/api-server && pnpm build
cd artifacts/cricket-dna && pnpm build

# Force a refresher cycle (clears stale DB row, re-fetches)
curl -X POST https://cricket-dna-api.onrender.com/api/refresh

# Check RapidAPI spend
curl https://cricket-dna-api.onrender.com/api/quota

# Manually flush Redis cache for player profiles (after big changes)
# Render dashboard → cricket-dna-redis → shell: redis-cli
#   redis-cli --scan --pattern "player:full:*" | xargs redis-cli del
#   (be careful — also kills the quota counter if you wildcard too wide)

# Force a full ML refit
curl -X POST "https://cricket-dna-ml.onrender.com/refit?force_scrape=true"
# (WARNING: takes 2-3 min, scrapes all 52 players; cold-starts everyone)

# Deploy: just push to main on the GitHub repo
git push origin main
# Render auto-rebuilds api-server and ml-service; Vercel auto-rebuilds frontend
```

---

## 13. What to read in what order (suggested for a new agent)

1. This document (you're reading it)
2. `DEPLOYMENT_GUIDE.md` — manual Render setup steps
3. `artifacts/api-server/src/index.ts` — the boot sequence, route mounting, ML proxies
4. `artifacts/api-server/src/models/player.ts` — the 30-player roster
5. `artifacts/api-server/src/routes/battle.ts` — the headline feature
6. `artifacts/ml/main.py` — the ML API surface
7. `artifacts/ml/pipeline.py` — the clustering/KNN/similarity math
8. `artifacts/cricket-dna/src/App.tsx` — frontend routing
9. `artifacts/cricket-dna/src/hooks/usePlayerData.ts` — the data hooks
10. `artifacts/cricket-dna/src/pages/BattleArena.tsx` — the most-touched page
11. `artifacts/cricket-dna/src/data/mockData.ts` — what placeholders look like
12. `CHAT_CONTEXT.md` and `DEBUG_SESSION_2026-08-26.md` — historical context (some of it's now stale but useful for understanding the why)
