# ml/features.py
"""
Builds a 20-dimensional DNA vector for every player.

Dimensions (in order — index matters, must match RADAR_AXES in mockData.ts):
  0  pressure_score       — performance in knockout matches vs regular (0-100)
  1  chase_avg            — batting average when team is chasing (normalized 0-100)
  2  control_pct          — % of deliveries played along the ground (0-100)
  3  boundary_pct         — % of runs scored in boundaries (0-100)
  4  consistency_index    — StdDev of scores inverted — low variance = high score (0-100)
  5  big_match_diff       — avg uplift in ICC tournaments vs bilateral (0-100)
  6  phase3_sr            — strike rate in overs 16-20 / death overs economy (0-100)
  7  format_versatility   — similarity of performance across Test/ODI/T20 (0-100)

  8  dot_ball_pct         — bowlers: dot ball % (0-100)
  9  death_economy        — bowlers: economy in overs 16-20 inverted (0-100)
  10 yorker_freq          — bowlers: estimated yorker frequency (0-100)
  11 wicket_diversity     — bowlers: variety of dismissal types (0-100)
  12 pp_efficiency        — powerplay economy inverted for bowlers / SR for batters (0-100)
  13 knockout_wickets     — bowlers: wickets in knockout matches (0-100)

  14 dual_threat          — all-rounders: combined bat+bowl contribution index (0-100)
  15 fielding_impact      — estimated from run-outs + catches (0-100)
  16 ipl_consistency      — IPL avg normalized (0-100)
  17 era_adjustment       — adjusts for pitch conditions and era difficulty (0-100)
  18 team_win_corr        — correlation between player performance and team wins (0-100)
  19 raw_dna_score        — composite of all above (0-100)
"""

import numpy as np
import pandas as pd
from typing import Dict, Any

# ─── Known player metadata ────────────────────────────────────────────────────
# cricInfoId → base features we know are reliable without scraping
# These are pre-calibrated from Cricinfo stats. The live pipeline
# calls fetchPlayerProfile() and builds on top of these.

PLAYER_BASE = {
    "253802": {"name": "Virat Kohli",          "role": "batter",   "archetype_id": "A"},
    "34102":  {"name": "Rohit Sharma",          "role": "batter",   "archetype_id": "G"},
    "625371": {"name": "Jasprit Bumrah",         "role": "bowler",   "archetype_id": "B"},
    "28081":  {"name": "MS Dhoni",              "role": "keeper",   "archetype_id": "H"},
    "35320":  {"name": "Sachin Tendulkar",       "role": "batter",   "archetype_id": "A"},
    "28114":  {"name": "Rahul Dravid",           "role": "batter",   "archetype_id": "D"},
    "30176":  {"name": "Anil Kumble",            "role": "bowler",   "archetype_id": "E"},
    "303669": {"name": "Joe Root",              "role": "batter",   "archetype_id": "A"},
    "277906": {"name": "Kane Williamson",        "role": "batter",   "archetype_id": "A"},
    "348144": {"name": "Babar Azam",            "role": "batter",   "archetype_id": "A"},
    "44936":  {"name": "AB de Villiers",         "role": "batter",   "archetype_id": "C"},
    "219889": {"name": "David Warner",           "role": "batter",   "archetype_id": "G"},
    "7133":   {"name": "Ricky Ponting",          "role": "batter",   "archetype_id": "A"},
    "4188":   {"name": "Glenn McGrath",          "role": "bowler",   "archetype_id": "B"},
    "13552":  {"name": "Shane Warne",            "role": "bowler",   "archetype_id": "E"},
    "31905":  {"name": "Adam Gilchrist",         "role": "keeper",   "archetype_id": "G"},
    "19296":  {"name": "James Anderson",         "role": "bowler",   "archetype_id": "B"},
    "311158": {"name": "Ben Stokes",             "role": "allround", "archetype_id": "F"},
    "50710":  {"name": "Kumar Sangakkara",       "role": "keeper",   "archetype_id": "D"},
    "49636":  {"name": "Muttiah Muralitharan",   "role": "bowler",   "archetype_id": "E"},
    "49536":  {"name": "Lasith Malinga",         "role": "bowler",   "archetype_id": "B"},
    "52337":  {"name": "Brian Lara",             "role": "batter",   "archetype_id": "C"},
    "51880":  {"name": "Chris Gayle",            "role": "batter",   "archetype_id": "G"},
    "324418": {"name": "Pat Cummins",            "role": "bowler",   "archetype_id": "B"},
    "311631": {"name": "Mitchell Starc",         "role": "bowler",   "archetype_id": "B"},
    "45789":  {"name": "Jacques Kallis",         "role": "allround", "archetype_id": "F"},
    "28779":  {"name": "Sourav Ganguly",         "role": "batter",   "archetype_id": "G"},
    "35263":  {"name": "Virender Sehwag",        "role": "batter",   "archetype_id": "G"},
    "43209":  {"name": "Harbhajan Singh",        "role": "bowler",   "archetype_id": "E"},
    "43429":  {"name": "Imran Khan",             "role": "allround", "archetype_id": "F"},
    "44828":  {"name": "Dale Steyn",             "role": "bowler",   "archetype_id": "B"},
    "8917":   {"name": "Wasim Akram",            "role": "bowler",   "archetype_id": "B"},
    "40439":  {"name": "Younis Khan",            "role": "batter",   "archetype_id": "D"},
    "43290":  {"name": "Shahid Afridi",          "role": "allround", "archetype_id": "C"},
    "43263":  {"name": "Shoaib Akhtar",          "role": "bowler",   "archetype_id": "B"},
    "8166":   {"name": "Brett Lee",              "role": "bowler",   "archetype_id": "B"},
    "48749":  {"name": "Mahela Jayawardene",     "role": "batter",   "archetype_id": "D"},
    "42656":  {"name": "Hashim Amla",            "role": "batter",   "archetype_id": "D"},
    "84985":  {"name": "Brendon McCullum",       "role": "keeper",   "archetype_id": "G"},
    "374919": {"name": "Trent Boult",            "role": "bowler",   "archetype_id": "B"},
    "420889": {"name": "Glenn Maxwell",          "role": "allround", "archetype_id": "C"},
    "272401": {"name": "Aaron Finch",            "role": "batter",   "archetype_id": "G"},
    "369077": {"name": "Jonny Bairstow",         "role": "keeper",   "archetype_id": "G"},
    "49428":  {"name": "R. Ashwin",              "role": "bowler",   "archetype_id": "E"},
    "234675": {"name": "Ravindra Jadeja",        "role": "allround", "archetype_id": "F"},
    "481896": {"name": "Mohammed Shami",         "role": "bowler",   "archetype_id": "B"},
    "931581": {"name": "Rishabh Pant",           "role": "keeper",   "archetype_id": "C"},
    "1125619":{"name": "Shubman Gill",           "role": "batter",   "archetype_id": "D"},
    "422108": {"name": "KL Rahul",               "role": "batter",   "archetype_id": "D"},
    "832172": {"name": "Marnus Labuschagne",     "role": "batter",   "archetype_id": "D"},
    "1175515":{"name": "Haris Rauf",             "role": "bowler",   "archetype_id": "B"},
    "1233557":{"name": "Naseem Shah",            "role": "bowler",   "archetype_id": "B"},
}


def clamp(val: float, lo=0.0, hi=100.0) -> float:
    return float(max(lo, min(hi, val)))


def normalize_avg(avg: float, role: str) -> float:
    """Normalize batting avg to 0-100 scale based on role context."""
    if role == "bowler":
        # Lower bowling avg is better (25 = elite, 40 = average)
        return clamp((45 - avg) / 20 * 100)
    # Batter: 60+ is god-tier, 20 is replacement level
    return clamp((avg - 20) / 45 * 100)


def normalize_sr(sr: float, format_type: str) -> float:
    """Normalize strike rate by format."""
    if format_type == "test":
        return clamp((sr - 35) / 55 * 100)
    if format_type == "odi":
        return clamp((sr - 55) / 55 * 100)
    return clamp((sr - 100) / 70 * 100)  # T20


def build_vector(profile: Dict[str, Any]) -> np.ndarray:
    """
    Build a 20-dimensional DNA vector from a player profile dict.
    profile must have: odiStats, testStats, t20Stats, iplStats, role, name
    """
    role = profile.get("role", "batter").lower()
    is_bowler   = role == "bowler"
    is_allround = role in ("allround", "all-rounder")
    is_keeper   = role in ("keeper", "wicket-keeper")

    odi  = profile.get("odiStats",  {})
    test = profile.get("testStats", {})
    t20  = profile.get("t20Stats",  {})
    ipl  = profile.get("iplStats",  {})

    def g(d, k, default=0):
        return float(d.get(k, default) or default)

    odi_avg  = g(odi,  "avg")
    test_avg = g(test, "avg")
    t20_avg  = g(t20,  "avg")
    odi_sr   = g(odi,  "sr")
    t20_sr   = g(t20,  "sr")
    odi_100s = g(odi,  "hundreds")
    odi_m    = max(g(odi, "matches"), 1)
    ipl_avg  = g(ipl,  "avg")
    ipl_sr   = g(ipl,  "sr")

    # ── Dim 0: Pressure score
    # Proxy: hundreds per match × avg (batters) or wickets in big games (bowlers)
    if is_bowler:
        pressure = clamp(normalize_avg(odi_avg, "bowler") * 0.8 + 20)
    else:
        pressure = clamp((odi_100s / odi_m * 100) * 5 + normalize_avg(odi_avg, "batter") * 0.5)

    # ── Dim 1: Chase avg (proxy from ODI avg — real chase data requires innings-level)
    chase_proxy = clamp(normalize_avg(odi_avg * 1.12, "batter") if not is_bowler else 40)

    # ── Dim 2: Control % (proxy: inverse of SR for batters means they play more dots)
    control = clamp(100 - normalize_sr(odi_sr, "odi") * 0.4) if not is_bowler else clamp(70 + normalize_avg(odi_avg, "bowler") * 0.3)

    # ── Dim 3: Boundary %
    # Proxy: high SR = high boundary %, T20 SR is the best signal
    boundary = clamp(normalize_sr(t20_sr, "t20") * 0.8 + 20) if not is_bowler else clamp(30.0)

    # ── Dim 4: Consistency index (Test avg most reliable signal)
    consistency = clamp(normalize_avg(test_avg, role))

    # ── Dim 5: Big match differential
    # Proxy: hundreds / matches ratio — consistent scorers perform in big games
    big_match = clamp((odi_100s / odi_m * 100) * 4.5 + 30) if not is_bowler else clamp(60 + normalize_avg(odi_avg, "bowler") * 0.4)

    # ── Dim 6: Phase 3 SR (death overs) — T20 SR is best available proxy
    phase3 = clamp(normalize_sr(t20_sr, "t20")) if not is_bowler else clamp(normalize_avg(odi_avg, "bowler") * 0.9 + 5)

    # ── Dim 7: Format versatility — all 3 avgs being similar = versatile
    if not is_bowler:
        avgs = [a for a in [odi_avg, test_avg, t20_avg] if a > 10]
        if len(avgs) >= 2:
            mean_a = np.mean(avgs)
            std_a  = np.std(avgs)
            versatility = clamp(100 - (std_a / max(mean_a, 1)) * 100)
        else:
            versatility = clamp(normalize_avg(odi_avg, "batter") * 0.7)
    else:
        versatility = clamp(70.0)

    # ── Dim 8-13: Bowler-specific (batters get neutral values)
    if is_bowler or is_allround:
        dot_ball   = clamp(normalize_avg(odi_avg, "bowler") * 0.85 + 10)
        death_econ = clamp(normalize_avg(odi_avg, "bowler") * 0.9 + 5)
        yorker_f   = clamp(50 + (normalize_avg(odi_avg, "bowler") - 50) * 0.6)
        wicket_div = clamp(55 + np.random.normal(0, 5))  # seeded per player in main
        pp_eff     = clamp(normalize_avg(odi_avg, "bowler") * 0.8 + 15)
        ko_wkts    = clamp(normalize_avg(odi_avg, "bowler") * 0.7 + 20)
    else:
        # Batters: PP efficiency = how well they handle powerplay (SR proxy)
        dot_ball   = clamp(100 - normalize_sr(odi_sr, "odi") * 0.5)
        death_econ = clamp(normalize_sr(t20_sr, "t20") * 0.8)
        yorker_f   = 30.0
        wicket_div = 30.0
        pp_eff     = clamp(normalize_sr(odi_sr, "odi") * 0.9)
        ko_wkts    = 30.0

    # ── Dim 14: Dual threat (all-rounders)
    if is_allround:
        dual = clamp((normalize_avg(odi_avg, "batter") + normalize_avg(odi_avg, "bowler")) / 2 * 1.1)
    else:
        dual = clamp(normalize_avg(odi_avg, role) * 0.3)

    # ── Dim 15: Fielding impact (proxy: keepers get higher score)
    fielding = clamp(70.0 if is_keeper else 50.0 + normalize_avg(odi_avg, role) * 0.2)

    # ── Dim 16: IPL consistency
    ipl_cons = clamp(normalize_avg(ipl_avg, "batter") if not is_bowler else normalize_avg(ipl_avg, "bowler"))

    # ── Dim 17: Era adjustment (modern players face harder conditions)
    era_adj = clamp(60.0)  # flat without historical data — ML learns this from clustering

    # ── Dim 18: Team win correlation (proxy: hundreds correlate with wins)
    win_corr = clamp(pressure * 0.7 + consistency * 0.3)

    # ── Dim 19: Raw DNA score (composite)
    raw = clamp(np.mean([pressure, chase_proxy, control, boundary, consistency,
                          big_match, phase3, versatility]))

    return np.array([
        pressure, chase_proxy, control, boundary, consistency,
        big_match, phase3, versatility,
        dot_ball, death_econ, yorker_f, wicket_div, pp_eff, ko_wkts,
        dual, fielding, ipl_cons, era_adj, win_corr, raw
    ], dtype=np.float32)


def build_all_vectors(profiles: Dict[str, Dict]) -> pd.DataFrame:
    """
    Build DNA vectors for all players and return as a DataFrame.
    profiles: { cricInfoId: profile_dict }
    """
    rows = []
    for cric_id, profile in profiles.items():
        meta = PLAYER_BASE.get(cric_id, {})
        vec = build_vector(profile)
        row = {
            "cricInfoId":   cric_id,
            "id":           profile.get("id", cric_id),
            "name":         profile.get("name", meta.get("name", "Unknown")),
            "role":         profile.get("role", meta.get("role", "batter")),
            "archetype_id": meta.get("archetype_id", "A"),
        }
        for i, val in enumerate(vec):
            row[f"dim_{i}"] = val
        rows.append(row)

    df = pd.DataFrame(rows)
    return df


FEATURE_COLS = [f"dim_{i}" for i in range(20)]
