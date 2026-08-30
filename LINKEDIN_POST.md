# Cricket Duel Arena — LinkedIn Launch Kit

**Verdict: Yes — this is worth posting.** It's a genuinely full-stack project (React + Express + a Python ML microservice), it's deployed and live, and it now runs on real data with meaningful ML output. That combination stands out.

Read the "Before you post" section first — the ML claims below only become true once you redeploy the ML service.

---

## The post (primary — polished, ~200 words)

> 🏏 I built **Cricket Duel Arena** — a full-stack app that gives every cricketer a statistical "DNA."
>
> Ever wondered who Virat Kohli's closest statistical twin is? Or whether Bumrah and Dale Steyn are really the same bowler in different shirts? I built an app to find out.
>
> Every player is turned into a 20-dimensional feature vector from their Test / ODI / T20 career stats. Real ML takes it from there:
>
> • K-Means clusters ~50 all-time greats into playing "archetypes"
> • Cosine similarity surfaces each player's closest "DNA twins"
> • t-SNE projects everyone onto an interactive 2D "constellation"
> • A 6-model ensemble weighs in on hypothetical head-to-head duels
>
> The stack: React 19 + Vite + TypeScript on the front, an Express 5 API in the middle, and a Python (FastAPI + scikit-learn) microservice for the ML — deployed across Vercel and Render.
>
> Biggest lesson? It wasn't the modelling — it was data integrity. The clustering was noise until I fixed the pipeline feeding it. Garbage in, garbage out is very real.
>
> Live demo 👇
> https://cricket-dna.vercel.app
>
> Which two players' "DNA match" would you want to see? 👇
>
> #MachineLearning #FullStack #React #Python #DataScience #Cricket

---

## The post (shorter alternative — ~120 words, punchier)

> 🏏 Who is Virat Kohli's statistical "twin"?
>
> I built **Cricket Duel Arena** to answer questions like that. Every cricketer becomes a 20-dimensional "DNA" vector from their career stats, then real ML does the rest:
>
> • K-Means groups ~50 greats into playing archetypes
> • Cosine similarity finds each player's closest "DNA twins"
> • t-SNE maps everyone onto an interactive constellation
>
> Full stack: React 19 + TypeScript, an Express API, and a Python / scikit-learn ML microservice — live on Vercel + Render.
>
> Try it 👇 https://cricket-dna.vercel.app
>
> #MachineLearning #FullStack #React #Python #DataScience #Cricket

---

## Before you post (important — do this first)

The live site is currently still serving the **old degenerate ML model**. The fix I made (real stats + a corrected feature pipeline) only goes live after you redeploy the ML service. Post *after* you've verified the steps below, so the claims in the post are actually true when people click through.

### 1. Commit the ML fix

These are the only files that changed for this fix (your other uncommitted changes are unrelated prior work — review those separately):

```bash
git add artifacts/ml/features.py \
        artifacts/ml/seed_real_profiles.py \
        artifacts/ml/data/raw_profiles.json

# The 8 stale model artifacts were committed to the repo. They MUST be
# removed so Render doesn't just redeploy the old broken model:
git rm artifacts/ml/data/kmeans.pkl \
       artifacts/ml/data/pca.pkl \
       artifacts/ml/data/scaler.pkl \
       artifacts/ml/data/sim_matrix.npy \
       artifacts/ml/data/vectors.npy \
       artifacts/ml/data/players.csv \
       artifacts/ml/data/player_index.json \
       artifacts/ml/data/tsne_coords.json

git commit -m "fix(ml): rebuild DNA pipeline on real career stats; force refit on deploy"
git push
```

### 2. Let Render redeploy the ML service

On startup the pipeline calls `load()`, finds no model files, and refits from the new `raw_profiles.json` (StandardScaler → PCA → K-Means → DBSCAN → cosine similarity → t-SNE), then saves fresh artifacts. No code change needed — deleting the artifacts is what triggers the refit.

### 3. Verify the model is real (not degenerate)

Wait for the Render cold start, then check that DNA twins look sensible:

```bash
# Kohli's twins should be top-order batters (Babar, Amla, Gill…), not a random mix
curl https://cricket-dna-ml.onrender.com/knn/253802
```

Or just open the site and try the DNA-twin feature on a few players. Expected results after the refit (verified locally, replicating the deployed cosine-on-scaled-vectors exactly):

| Player | Top DNA twins |
|---|---|
| Virat Kohli (bat) | Babar Azam 91%, Hashim Amla 86%, Shubman Gill 84% |
| Shane Warne (spin) | Muralitharan 96%, then pace bowlers drop to ~84% |
| Jasprit Bumrah (pace) | Dale Steyn 98%, Shoaib Akhtar 95%, McGrath 93% |
| Kumar Sangakkara (keeper) | Williamson 76%, Dravid 69%, Lara 67% |
| Jacques Kallis (all-rounder) | Ben Stokes 60%, Imran Khan 50% |

If those look right, the ML claims in the post are true. **Then post.**

### 4. Rotate exposed API keys (if the repo is or will be public)

The post links to the live site, not the repo — but your `HANDOFF.md` notes two RapidAPI keys were committed to the codebase. If you plan to share the GitHub repo (recruiters often ask), **rotate those keys first** and move them to server-side env vars only. Not a blocker for posting the live link, but do it before making the repo public.

---

## What I fixed (so you can speak to it)

Your committed `raw_profiles.json` had **every player at zero stats** (the Cricinfo scraper returned empties at build time). With all-zero inputs the feature builder produced only **two distinct vectors**, so K-Means / DBSCAN / KNN were degenerate — "DNA twins" were meaningless and every zero-stat bowler scored as elite (a `normalize_avg(0)` → 100 bug).

The fix, in three parts:

1. **Real inputs.** A new `seed_real_profiles.py` rebuilds `raw_profiles.json` from real career numbers — batting lines parsed from your own `mockData.ts`, plus curated public career **bowling averages and ODI economy** for the 19 specialist bowlers (their batting averages are meaningless as a bowling-DNA signal, which is what made every bowler look elite).
2. **Bug fixes in `features.py`.** Guarded the zero-average trap, widened the bowler-average scale (the old one saturated every sub-25 average to a flat 100, collapsing all elite bowlers together), and gave each bowler dimension a *different* real signal — Test discipline, T20 death skill, ODI wicket-taking, economy, and a pace/spin split — so bowler vectors stopped being collinear.
3. **Forced a clean refit** by removing the stale model artifacts.

Result: **52/52 distinct vectors**, variance on 19 of 20 dimensions, and twins that make cricketing sense — spinners pair with spinners, express quicks with express quicks, keepers with keepers, all-rounders with all-rounders.

---

## Constructive criticism (worth doing, not blockers)

1. **Cold starts hurt first impressions.** Render's free tier sleeps the API and ML services; the first DNA lookup after idle can hang for 30–60s. Recruiters clicking your link are exactly the cold-start visitors. Add a visible "warming up the ML engine…" state (or a lightweight skeleton) so the first load feels intentional, not broken.

2. **Label the battle predictor honestly.** The 6-model "duel" ensemble is a fun heuristic, not validated against real match outcomes. A small "for fun — not a real forecast" tag keeps the ML credible to the engineers who'll scrutinise it.

3. **Show data provenance.** Add a quiet "career stats as of <date> · sources: public records" line. It signals rigor and pre-empts "these numbers look slightly off" comments, since some figures are curated rather than live.

4. **Two players have `espnId: null`** (Suryakumar Yadav, Travis Head per your notes). Either complete their data or hide them so they don't render broken in the DNA views.

5. **Add one regression test around the feature pipeline.** The exact thing that broke (silent all-zero data → degenerate clusters) is invisible until someone inspects the twins. A tiny test asserting "≥ N distinct vectors and variance on most dims" would have caught it and would impress anyone reading the repo.
