#!/usr/bin/env python3
# ml/seed_real_profiles.py
"""
Regenerate ml/data/raw_profiles.json from REAL career statistics.

Why this exists
---------------
The committed raw_profiles.json had every player at zero stats (the Cricinfo
scraper returned empties at build time). With all-zero inputs, features.py
produced only two distinct DNA vectors, so K-Means/DBSCAN/KNN were degenerate:
"DNA twins" were meaningless and every zero-stat bowler scored as elite.

This script rebuilds real inputs from two auditable sources:

  1. Batting stats  — parsed directly from the frontend's mockData.ts, which
     already carries accurate Test/ODI/T20I/IPL batting lines for every player.
  2. Bowling averages — a curated dict of well-known public career bowling
     averages (Test/ODI/T20I/IPL) for the 19 specialist bowlers. mockData.ts
     only stores batting lines, so a bowler's "avg" there is their (tiny)
     batting average; feeding that to the bowler branch is exactly what made
     every bowler look elite. We substitute real bowling averages instead.

Batters, keepers and all-rounders keep their real batting stats (their batting
is their DNA identity in this roster). Only specialist bowlers get the bowling
-average substitution.

Run:  python3 seed_real_profiles.py [output_path]
      (default output: data/raw_profiles.json)
The script also prints a verification report replicating the pipeline's exact
DNA-twin computation (StandardScaler -> cosine similarity) so the output can be
sanity-checked without scikit-learn.
"""

import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MOCKDATA = os.path.join(HERE, "..", "cricket-dna", "src", "data", "mockData.ts")

sys.path.insert(0, HERE)
from features import PLAYER_BASE, build_all_vectors, FEATURE_COLS  # noqa: E402

# ─────────────────────────────────────────────────────────────────────────────
# Curated career BOWLING averages (public record, approximate).
# Keyed by ESPN Cricinfo id. Only specialist bowlers need these — their
# batting averages in mockData are meaningless for a bowling-DNA vector.
# Format order: (Test, ODI, T20I, IPL). Where a bowler barely played a format,
# their primary-format average is used as a reasonable proxy so no dimension
# silently falls back to the neutral prior.
# ─────────────────────────────────────────────────────────────────────────────
BOWLING_AVG = {
    "625371":  (19.6, 23.6, 17.8, 22.0),  # Jasprit Bumrah
    "30176":   (29.6, 30.9, 30.0, 27.0),  # Anil Kumble
    "4188":    (21.6, 22.0, 22.0, 20.0),  # Glenn McGrath
    "13552":   (25.4, 25.7, 25.0, 25.0),  # Shane Warne
    "19296":   (26.4, 29.2, 25.0, 27.0),  # James Anderson
    "49636":   (22.7, 23.1, 18.0, 22.0),  # Muttiah Muralitharan
    "49536":   (33.1, 28.9, 20.8, 19.8),  # Lasith Malinga
    "324418":  (22.6, 28.2, 26.0, 30.0),  # Pat Cummins
    "311631":  (27.5, 22.7, 24.5, 30.0),  # Mitchell Starc
    "43209":   (32.5, 33.3, 24.0, 26.4),  # Harbhajan Singh
    "44828":   (22.9, 25.9, 18.4, 24.0),  # Dale Steyn
    "8917":    (23.6, 23.5, 24.0, 24.0),  # Wasim Akram
    "43263":   (25.7, 24.9, 22.0, 25.0),  # Shoaib Akhtar
    "8166":    (30.8, 23.3, 20.0, 26.0),  # Brett Lee
    "374919":  (27.5, 24.4, 22.4, 27.0),  # Trent Boult
    "49428":   (24.0, 33.2, 23.2, 29.0),  # R. Ashwin
    "481896":  (27.7, 23.5, 25.0, 28.0),  # Mohammed Shami
    "1175515": (42.0, 24.8, 22.0, 30.0),  # Haris Rauf
    "1233557": (26.0, 22.0, 24.0, 28.0),  # Naseem Shah
}

# Career ODI economy rate (runs per over, public record, approximate). This is
# an axis independent of bowling average: it separates miserly accuracy bowlers
# (McGrath 3.88) from expensive strike/death bowlers (Shami 5.5, Rauf 5.6) even
# when their averages are similar, which is what breaks up the elite-pace
# cosine-similarity cluster. Written into odiStats.economy for the bowler DNA.
BOWLING_ECON = {
    "625371":  4.62,   # Jasprit Bumrah
    "30176":   4.30,   # Anil Kumble
    "4188":    3.88,   # Glenn McGrath
    "13552":   4.25,   # Shane Warne
    "19296":   4.94,   # James Anderson
    "49636":   3.93,   # Muttiah Muralitharan
    "49536":   5.28,   # Lasith Malinga
    "324418":  4.98,   # Pat Cummins
    "311631":  5.08,   # Mitchell Starc
    "43209":   4.31,   # Harbhajan Singh
    "44828":   4.77,   # Dale Steyn
    "8917":    3.89,   # Wasim Akram
    "43263":   4.76,   # Shoaib Akhtar
    "8166":    4.76,   # Brett Lee
    "374919":  4.98,   # Trent Boult
    "49428":   4.93,   # R. Ashwin
    "481896":  5.51,   # Mohammed Shami
    "1175515": 5.60,   # Haris Rauf
    "1233557": 5.20,   # Naseem Shah
}

STAT_BLOCK_RE = re.compile(r"(test|odi|t20|ipl)Stats:\s*\{([^}]*)\}")
NUM_RE = re.compile(r"(\w+):\s*(-?[\d.]+)")


def parse_mockdata(path):
    """Return { cricInfoId: {name, role, testStats, odiStats, t20Stats, iplStats} }."""
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()

    players = {}
    # Each player object lives on its own line beginning with `{ id:`
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("{ id:"):
            continue
        cid_m = re.search(r'cricInfoId:\s*"(\d+)"', line)
        name_m = re.search(r'name:\s*"([^"]+)"', line)
        role_m = re.search(r'role:\s*"([^"]+)"', line)
        if not (cid_m and name_m and role_m):
            continue
        cid = cid_m.group(1)
        rec = {"name": name_m.group(1), "role": role_m.group(1)}
        for fmt, body in STAT_BLOCK_RE.findall(line):
            vals = {k: float(v) for k, v in NUM_RE.findall(body)}
            rec[f"{fmt}Stats"] = vals
        players[cid] = rec
    return players


def _stat(vals, avg_override=None, is_bowler=False, econ=None):
    """Build the profile stat block in the schema build_vector expects."""
    block = {
        "matches":  int(vals.get("matches", 0)),
        "runs":     int(vals.get("runs", 0)),
        "avg":      float(avg_override if avg_override is not None else vals.get("avg", 0)),
        "sr":       float(vals.get("sr", 0)),
        "hundreds": 0 if is_bowler else int(vals.get("hundreds", 0)),
        "fifties":  0 if is_bowler else int(vals.get("fifties", 0)),
        "hs":       str(int(vals.get("hs", 0))),
    }
    if econ is not None:
        block["economy"] = float(econ)
    return block


def build_profiles(mock):
    profiles = {}
    fmt_idx = {"testStats": 0, "odiStats": 1, "t20Stats": 2, "iplStats": 3}
    for cid, meta in PLAYER_BASE.items():
        role = meta["role"]                       # canonical role (lowercase)
        is_bowler = role == "bowler"
        src = mock.get(cid, {})
        prof = {"cricInfoId": cid, "name": meta["name"], "role": role}
        bowl = BOWLING_AVG.get(cid) if is_bowler else None
        econ = BOWLING_ECON.get(cid) if is_bowler else None
        for block in ("testStats", "odiStats", "t20Stats", "iplStats"):
            vals = src.get(block, {})
            override = bowl[fmt_idx[block]] if bowl else None
            # Economy is an ODI-line signal; only attach it to odiStats.
            block_econ = econ if block == "odiStats" else None
            prof[block] = _stat(vals, avg_override=override,
                                is_bowler=is_bowler, econ=block_econ)
        profiles[cid] = prof
    return profiles


# ─── Verification (replicates pipeline.py twin computation, sklearn-free) ─────

def standard_scale(X):
    """Match sklearn StandardScaler: zero-mean, unit-variance (ddof=0).
    Constant columns (std==0) -> all zeros, exactly like sklearn."""
    mean = X.mean(axis=0)
    std = X.std(axis=0)          # population std (ddof=0), same as sklearn
    scale = np.where(std == 0, 1.0, std)
    return (X - mean) / scale


def cosine_matrix(X):
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    U = X / norms
    return U @ U.T


def verify(profiles):
    np.random.seed(42)  # features.py adds tiny random noise on dim_11; pin it
    df = build_all_vectors(profiles)
    X = df[FEATURE_COLS].values.astype(np.float64)

    distinct = len({tuple(np.round(r, 4)) for r in X})
    print("=" * 70)
    print(f"Players: {len(df)}   Distinct 20-dim vectors: {distinct}")
    print("=" * 70)

    # Per-dimension spread — a healthy dataset varies on most dims
    stds = X.std(axis=0)
    dead = [i for i, s in enumerate(stds) if s < 1e-6]
    print(f"Dims with variance: {sum(s >= 1e-6 for s in stds)}/20"
          f"  |  flat dims: {dead if dead else 'none'}")

    Xs = standard_scale(X)
    S = cosine_matrix(Xs)
    ids = list(df["cricInfoId"].values)
    names = dict(zip(df["cricInfoId"], df["name"]))
    roles = dict(zip(df["cricInfoId"], df["role"]))
    idx = {c: i for i, c in enumerate(ids)}

    def twins(cid, k=5):
        i = idx[cid]
        order = [j for j in np.argsort(S[i])[::-1] if j != i][:k]
        return [(names[ids[j]], roles[ids[j]], round(S[i, j] * 100, 1)) for j in order]

    checks = {
        "253802":  "Virat Kohli (batter)",
        "34102":   "Rohit Sharma (batter)",
        "625371":  "Jasprit Bumrah (bowler)",
        "4188":    "Glenn McGrath (bowler)",
        "13552":   "Shane Warne (spin)",
        "49636":   "Muralitharan (spin)",
        "28081":   "MS Dhoni (keeper)",
        "50710":   "Sangakkara (keeper)",
        "51880":   "Chris Gayle (opener)",
        "45789":   "Jacques Kallis (all-rounder)",
    }
    print("\nDNA twins (exact replica of deployed cosine-on-scaled-vectors):")
    for cid, label in checks.items():
        if cid not in idx:
            continue
        print(f"\n  {label}")
        for nm, role, sim in twins(cid):
            print(f"      {sim:5.1f}%  {nm}  ({role})")
    return df


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "data", "raw_profiles.json")
    mock = parse_mockdata(MOCKDATA)
    print(f"Parsed {len(mock)} players from mockData.ts")
    profiles = build_profiles(mock)
    missing_bowl = [c for c, m in PLAYER_BASE.items()
                    if m["role"] == "bowler" and c not in BOWLING_AVG]
    if missing_bowl:
        print(f"WARNING: bowlers without curated bowling avg: {missing_bowl}")
    verify(profiles)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(profiles, f, indent=2)
    print(f"\nWrote {len(profiles)} profiles -> {out}")


if __name__ == "__main__":
    main()
