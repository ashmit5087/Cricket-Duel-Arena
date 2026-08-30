#!/usr/bin/env python3
# ml/test_dna_vectors.py
"""
Regression guard for the DNA feature pipeline.

Background
----------
The committed raw_profiles.json once held all-zero career stats (the Cricinfo
scraper 403'd at build time). With zero inputs, features.py collapsed every
player onto just TWO distinct 20-dim vectors: all batters shared one DNA and
all bowlers shared another. K-Means / DBSCAN / KNN / cosine-similarity were
therefore meaningless — "DNA twins" were noise and every zero-stat bowler
scored as elite. See seed_real_profiles.py for the fix.

This test locks in that fix. It fails loudly if the real data source ever
regresses to a degenerate state, so the bug can't silently come back.

It exercises the EXACT input the ML service fits on at deploy time
(data/raw_profiles.json → features.build_all_vectors), so a bad data commit is
caught here rather than surfacing as garbage clusters in production.

Runs two ways, no test framework required:
    python test_dna_vectors.py        # standalone, prints report, exit 1 on fail
    pytest test_dna_vectors.py        # if pytest is installed
Only numpy + pandas are needed — both are already ML runtime deps.
"""

import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from features import FEATURE_COLS, build_all_vectors  # noqa: E402

RAW_PROFILES = os.path.join(HERE, "data", "raw_profiles.json")

# ── Thresholds ───────────────────────────────────────────────────────────────
# Healthy build: 52/52 distinct, 1 flat dim, DNA-score std ~ high single digits.
# Degenerate bug: 2 distinct, ~18 flat dims, DNA-score std split across two
# constants. Thresholds sit far from both so the test catches the regression
# without flaking on normal roster/stat edits.
MIN_DISTINCT_FRAC = 0.75   # >= 75% of players must have a unique vector
MAX_FLAT_DIMS = 3          # dims with no variance across the roster
MIN_DNASCORE_STD = 3.0     # spread of dnaScore (= mean of dim_0..dim_7)
DNA_SCORE_DIMS = FEATURE_COLS[:8]


def _feature_matrix():
    """Load the deployed raw profiles and build the 20-dim vectors.

    features.py adds tiny deterministic noise on one dim, so pin the seed to
    match the fitted pipeline exactly (pipeline.py does the same at fit time).
    """
    np.random.seed(42)
    with open(RAW_PROFILES, encoding="utf-8") as f:
        profiles = json.load(f)
    df = build_all_vectors(profiles)
    X = df[FEATURE_COLS].values.astype(np.float64)
    return df, X


def test_vectors_are_distinct():
    """The roster must not collapse onto a handful of identical vectors."""
    df, X = _feature_matrix()
    n = len(df)
    distinct = len({tuple(np.round(r, 4)) for r in X})
    floor = max(40, int(MIN_DISTINCT_FRAC * n))
    assert distinct >= floor, (
        f"Only {distinct}/{n} distinct DNA vectors (need >= {floor}). "
        "Feature pipeline has collapsed — check data/raw_profiles.json for "
        "zero/placeholder stats."
    )


def test_dimensions_have_variance():
    """Almost every DNA dimension should vary across the roster."""
    _, X = _feature_matrix()
    stds = X.std(axis=0)
    flat = [FEATURE_COLS[i] for i, s in enumerate(stds) if s < 1e-6]
    assert len(flat) <= MAX_FLAT_DIMS, (
        f"{len(flat)} flat dimensions {flat} (allowed <= {MAX_FLAT_DIMS}). "
        "Too many constant dims means inputs are degenerate."
    )


def test_dna_scores_vary():
    """dnaScore (mean of dim_0..dim_7) must span a real range, not two constants.

    This is the signature of the original bug: every batter scored 18.8 and
    every bowler 79.4. A healthy roster spreads DNA scores across the scale.
    """
    df, _ = _feature_matrix()
    dna = df[DNA_SCORE_DIMS].values.astype(np.float64).mean(axis=1)
    assert dna.std() >= MIN_DNASCORE_STD, (
        f"dnaScore std is {dna.std():.2f} (need >= {MIN_DNASCORE_STD}). "
        "Scores have collapsed toward constants."
    )


def test_bowlers_are_not_identical():
    """Specialist bowlers must not all share one vector (the other half of the bug)."""
    df, X = _feature_matrix()
    mask = (df["role"].values == "bowler")
    n_bowlers = int(mask.sum())
    if n_bowlers < 3:
        return  # not enough bowlers in the roster to assert on
    Xb = X[mask]
    distinct = len({tuple(np.round(r, 4)) for r in Xb})
    assert distinct >= n_bowlers - 1, (
        f"Only {distinct}/{n_bowlers} distinct bowler vectors. Bowlers have "
        "collapsed — economy/discipline signals are not separating them."
    )


_CHECKS = [
    test_vectors_are_distinct,
    test_dimensions_have_variance,
    test_dna_scores_vary,
    test_bowlers_are_not_identical,
]


def _main():
    df, X = _feature_matrix()
    n = len(df)
    distinct = len({tuple(np.round(r, 4)) for r in X})
    stds = X.std(axis=0)
    flat = sum(1 for s in stds if s < 1e-6)
    dna = df[DNA_SCORE_DIMS].values.astype(np.float64).mean(axis=1)
    n_bowlers = int((df["role"].values == "bowler").sum())

    print("=" * 66)
    print("DNA feature-pipeline regression check")
    print("=" * 66)
    print(f"  players ............. {n}")
    print(f"  distinct vectors .... {distinct}/{n}")
    print(f"  flat dimensions ..... {flat}/20")
    print(f"  dnaScore range ...... {dna.min():.1f}–{dna.max():.1f} (std {dna.std():.2f})")
    print(f"  bowlers ............. {n_bowlers}")
    print("-" * 66)

    failures = []
    for check in _CHECKS:
        try:
            check()
            print(f"  PASS  {check.__name__}")
        except AssertionError as e:
            failures.append((check.__name__, str(e)))
            print(f"  FAIL  {check.__name__}")
    print("=" * 66)

    if failures:
        print(f"\n{len(failures)} check(s) FAILED:\n")
        for name, msg in failures:
            print(f"  [{name}] {msg}\n")
        return 1
    print(f"\nAll {len(_CHECKS)} checks passed — DNA pipeline is healthy.")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
