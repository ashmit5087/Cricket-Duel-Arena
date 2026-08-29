# ml/pipeline.py
"""
Full ML pipeline: clustering + KNN + t-SNE.
Called once at startup, results cached in memory.
Re-run when new player data arrives (weekly cron).
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans, DBSCAN
from sklearn.manifold import TSNE
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.decomposition import PCA
import joblib
import os
import json

from features import FEATURE_COLS, PLAYER_BASE

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

# ─── Known archetype labels (A-H) mapped from K-Means cluster IDs
# Updated after each run by reading centroids and matching to known archetypes
ARCHETYPE_LABELS = {
    "A": {"name": "The Pressure Architect",    "color": "#c0392b"},
    "B": {"name": "The Precision Missile",      "color": "#185fa5"},
    "C": {"name": "The Chaos Agent",            "color": "#d4a500"},
    "D": {"name": "The Build-Up Orchestrator",  "color": "#0f6e56"},
    "E": {"name": "The Spin Wizard",            "color": "#8b5cf6"},
    "F": {"name": "The Dual-Threat Engine",     "color": "#f97316"},
    "G": {"name": "The Powerplay Destroyer",    "color": "#ec4899"},
    "H": {"name": "The DBSCAN Wildcard",        "color": "#6b7280"},
}


class CricketDNAPipeline:
    def __init__(self):
        self.scaler        = StandardScaler()
        self.kmeans        = None
        self.dbscan        = None
        self.pca           = None
        self.tsne_coords   = None          # { cricInfoId: [x, y] }
        self.sim_matrix    = None          # cosine similarity (n × n)
        self.player_index  = []            # ordered list of cricInfoIds
        self.vectors_scaled= None          # scaled vectors (n × 20)
        self.df            = None          # full DataFrame with assignments
        self.fitted        = False

    # ─── Fit ─────────────────────────────────────────────────────────────────

    def fit(self, df: pd.DataFrame):
        """
        df: DataFrame from features.build_all_vectors()
        Must have columns: cricInfoId, name, archetype_id, dim_0 ... dim_19
        """
        df = df.copy()
        # cricInfoId must stay a string for URL-path lookups (FastAPI hands
        # us the path param as a string, but Cricinfo returns ints from the
        # scraper). Coerce once here so every downstream lookup matches.
        df["cricInfoId"] = df["cricInfoId"].astype(str)
        self.df = df
        self.player_index = list(df["cricInfoId"].values)

        X = df[FEATURE_COLS].values.astype(np.float32)

        # ── 1. Scale
        X_scaled = self.scaler.fit_transform(X)
        self.vectors_scaled = X_scaled

        # ── 2. PCA — reduce noise, keep 90% variance
        self.pca = PCA(n_components=0.90, random_state=42)
        X_pca = self.pca.fit_transform(X_scaled)
        print(f"[PCA] {X.shape[1]}d → {X_pca.shape[1]}d "
              f"({self.pca.explained_variance_ratio_.sum()*100:.1f}% variance retained)")

        # ── 3. Find optimal K with silhouette score (try 6-10)
        best_k, best_score = 8, -1
        for k in range(6, 11):
            km = KMeans(n_clusters=k, random_state=42, n_init=10)
            labels = km.fit_predict(X_pca)
            score = silhouette_score(X_pca, labels)
            print(f"[KMeans] k={k} silhouette={score:.4f}")
            if score > best_score:
                best_score, best_k = score, k

        print(f"[KMeans] Best k={best_k} (score={best_score:.4f})")

        # ── 4. Final K-Means fit
        self.kmeans = KMeans(n_clusters=best_k, random_state=42, n_init=20)
        km_labels = self.kmeans.fit_predict(X_pca)
        self.df["km_cluster"] = km_labels

        # ── 5. DBSCAN — find true outliers
        # eps tuned so ~1-3 players end up as noise (-1)
        self.dbscan = DBSCAN(eps=2.8, min_samples=2)
        db_labels = self.dbscan.fit_predict(X_pca)
        self.df["is_outlier"] = (db_labels == -1)
        n_outliers = (db_labels == -1).sum()
        print(f"[DBSCAN] {n_outliers} outlier(s) found: "
              f"{list(df[db_labels == -1]['name'].values)}")

        # ── 6. Map K-Means clusters → archetype IDs (A-H)
        # Use the known archetype_id from mockData as ground truth
        # to establish the mapping from cluster int → archetype letter
        cluster_to_arch = self._map_clusters_to_archetypes(km_labels)
        self.df["archetype_id"] = self.df.apply(
            lambda row: "H" if row["is_outlier"]
                        else cluster_to_arch.get(row["km_cluster"], "A"),
            axis=1
        )

        # ── 7. Cosine similarity matrix (on original scaled vectors)
        self.sim_matrix = cosine_similarity(X_scaled)
        print(f"[KNN] Similarity matrix: {self.sim_matrix.shape}")

        # ── 8. t-SNE — 2D coordinates for constellation map
        # Perplexity tuned for dataset size (~50 players)
        perplexity = min(15, len(df) // 3)
        tsne = TSNE(
            n_components=2,
            perplexity=perplexity,
            learning_rate="auto",
            init="pca",
            random_state=42,
            max_iter=2000,
        )
        coords_2d = tsne.fit_transform(X_scaled)
        # Normalize to [0, 600] × [0, 400] for Plotly canvas
        x_min, x_max = coords_2d[:, 0].min(), coords_2d[:, 0].max()
        y_min, y_max = coords_2d[:, 1].min(), coords_2d[:, 1].max()
        norm_x = (coords_2d[:, 0] - x_min) / (x_max - x_min) * 560 + 20
        norm_y = (coords_2d[:, 1] - y_min) / (y_max - y_min) * 360 + 20
        self.tsne_coords = {
            cid: [float(norm_x[i]), float(norm_y[i])]
            for i, cid in enumerate(self.player_index)
        }
        print(f"[t-SNE] Done for {len(self.tsne_coords)} players")

        self.fitted = True
        self._save()
        return self

    # ─── Map K-Means cluster integers → archetype letters ────────────────────

    def _map_clusters_to_archetypes(self, km_labels: np.ndarray) -> dict:
        """
        For each K-Means cluster, find which archetype_id the plurality of
        members already have (from mockData ground truth), and use that
        as the mapping. Handles the case where best_k ≠ 8.
        """
        mapping = {}
        used_archs = set()
        cluster_ids = sorted(set(km_labels))

        for cid in cluster_ids:
            mask = (np.array(km_labels) == cid)
            members = self.df[mask]
            # Count votes for each archetype_id
            votes = members["archetype_id"].value_counts()
            for arch in votes.index:
                if arch not in used_archs:
                    mapping[cid] = arch
                    used_archs.add(arch)
                    break
            if cid not in mapping:
                # Fallback: assign remaining letter
                remaining = [a for a in "ABCDEFG" if a not in used_archs]
                if remaining:
                    mapping[cid] = remaining[0]
                    used_archs.add(remaining[0])

        return mapping

    # ─── KNN query ────────────────────────────────────────────────────────────

    def get_twins(self, player_id: str, k: int = 5) -> list:
        """
        Returns top-k DNA twins for a player.
        player_id: cricInfoId string
        """
        if not self.fitted:
            raise RuntimeError("Pipeline not fitted")
        if player_id not in self.player_index:
            return []

        idx = self.player_index.index(player_id)
        scores = self.sim_matrix[idx]
        # Sort descending, exclude self (idx)
        ranked = np.argsort(scores)[::-1]
        ranked = [i for i in ranked if i != idx][:k]

        results = []
        for i in ranked:
            cid = self.player_index[i]
            row = self.df[self.df["cricInfoId"] == cid].iloc[0]
            results.append({
                "cricInfoId":  cid,
                "id":          row.get("id", cid),
                "name":        row["name"],
                "similarity":  round(float(scores[i]) * 100, 1),
                "archetypeId": row["archetype_id"],
                "archetype":   ARCHETYPE_LABELS.get(row["archetype_id"], {}).get("name", ""),
            })
        return results

    def get_similarity(self, id1: str, id2: str) -> float:
        """Direct similarity score between two players (0-100)."""
        if id1 not in self.player_index or id2 not in self.player_index:
            return -1.0
        i1 = self.player_index.index(id1)
        i2 = self.player_index.index(id2)
        return round(float(self.sim_matrix[i1, i2]) * 100, 1)

    # ─── Constellation export ─────────────────────────────────────────────────

    def get_constellation(self) -> list:
        if not self.fitted:
            return []
        result = []
        for _, row in self.df.iterrows():
            cid = row["cricInfoId"]
            coords = self.tsne_coords.get(cid, [300, 200])
            result.append({
                "id":          row.get("id", cid),
                "cricInfoId":  cid,
                "name":        row["name"],
                "archetypeId": row["archetype_id"],
                "x":           coords[0],
                "y":           coords[1],
                "dnaScore":    round(float(row["dim_19"]), 1),
                "isOutlier":   bool(row.get("is_outlier", False)),
            })
        return result

    # ─── Cluster definitions export ───────────────────────────────────────────

    def get_clusters(self) -> list:
        if not self.fitted:
            return []
        clusters = []
        for arch_id, arch_meta in ARCHETYPE_LABELS.items():
            members = self.df[self.df["archetype_id"] == arch_id]
            if members.empty:
                continue
            centroid = members[FEATURE_COLS[:8]].mean().tolist()
            clusters.append({
                "id":              arch_id,
                "name":            arch_meta["name"],
                "color":           arch_meta["color"],
                "memberCount":     len(members),
                "centroidValues":  [round(v, 1) for v in centroid],
                "examplePlayers":  list(members["name"].head(3).values),
            })
        return clusters

    # ─── 6-Model Battle Prediction ────────────────────────────────────────────

    def predict_battle(
        self,
        id1: str,
        id2: str,
        career1: list | None = None,   # [{format, matches, runs, avg, sr, hundreds, fifties}]
        career2: list | None = None,
        name1: str = "",
        name2: str = "",
    ) -> dict:
        """
        Run 6 independent ML models and return per-model verdicts + judge summary.

        Models:
          1. kmeans_archetype  — centroid distance in K-Means cluster space
          2. cosine_dna        — cosine similarity on full 20-dim DNA vector
          3. dbscan_outlier    — DBSCAN outlier status (novelty bonus/penalty)
          4. pca_dominance     — PC1 projection score (principal direction)
          5. format_versatility — dim_7 cross-format consistency metric
          6. composite_batting — weighted batting stats (avg/sr/100s/50s)
        """
        if not self.fitted:
            return {"models": [], "judge": None, "error": "Pipeline not fitted"}

        id1, id2 = str(id1), str(id2)

        # Resolve rows
        row1 = self.df[self.df["cricInfoId"] == id1]
        row2 = self.df[self.df["cricInfoId"] == id2]
        missing = []
        if row1.empty: missing.append(id1)
        if row2.empty: missing.append(id2)
        if missing:
            return {"models": [], "judge": None, "error": f"Player(s) not in pipeline: {missing}"}

        row1, row2 = row1.iloc[0], row2.iloc[0]
        n1 = name1 or row1["name"]
        n2 = name2 or row2["name"]

        # Resolve index positions for similarity matrix
        def idx(cid):
            try: return self.player_index.index(cid)
            except ValueError: return None

        i1, i2 = idx(id1), idx(id2)

        models = []

        # ── MODEL 1: K-Means archetype centroid distance ──────────────────────
        # Winner = player whose scaled vector is closer to their cluster centroid
        try:
            if i1 is not None and i2 is not None and self.kmeans is not None:
                v1 = self.vectors_scaled[i1]
                v2 = self.vectors_scaled[i2]
                c1_center = self.kmeans.cluster_centers_[self.kmeans.labels_[i1]]
                c2_center = self.kmeans.cluster_centers_[self.kmeans.labels_[i2]]
                d1 = float(np.linalg.norm(v1 - c1_center))
                d2 = float(np.linalg.norm(v2 - c2_center))
                arch1 = ARCHETYPE_LABELS.get(row1["archetype_id"], {}).get("name", row1["archetype_id"])
                arch2 = ARCHETYPE_LABELS.get(row2["archetype_id"], {}).get("name", row2["archetype_id"])
                # Lower distance = more archetypally pure = better
                if d1 <= d2:
                    winner_id, winner_name, conf = id1, n1, min(100, round((d2 - d1) / max(d2, 0.01) * 200, 1))
                    reason = f"{n1} is {round(d2-d1,2):.2f} units closer to the '{arch1}' centroid"
                else:
                    winner_id, winner_name, conf = id2, n2, min(100, round((d1 - d2) / max(d1, 0.01) * 200, 1))
                    reason = f"{n2} is {round(d1-d2,2):.2f} units closer to the '{arch2}' centroid"
                models.append({
                    "id": "kmeans_archetype",
                    "name": "K-Means Archetype",
                    "description": "Measures how true each player is to their playing archetype using K-Means cluster analysis. The player sitting closest to their archetype's centroid is more archetypally 'pure'.",
                    "winner": winner_id,
                    "winnerName": winner_name,
                    "confidence": max(5.0, conf),
                    "reasoning": reason,
                })
        except Exception as e:
            print(f"[predict_battle] kmeans model error: {e}")

        # ── MODEL 2: Cosine DNA similarity ────────────────────────────────────
        # Winner = player with higher composite DNA score (dim_19)
        try:
            dna1 = float(row1["dim_19"])
            dna2 = float(row2["dim_19"])
            sim = round(float(self.sim_matrix[i1, i2]) * 100, 1) if i1 is not None and i2 is not None else 50.0
            gap = abs(dna1 - dna2)
            conf = min(95, round(gap * 1.8, 1))
            if dna1 >= dna2:
                winner_id, winner_name = id1, n1
                reason = f"{n1} scores {dna1:.1f} vs {n2}'s {dna2:.1f} on the 20-dim DNA composite. DNA similarity between them: {sim}%"
            else:
                winner_id, winner_name = id2, n2
                reason = f"{n2} scores {dna2:.1f} vs {n1}'s {dna1:.1f} on the 20-dim DNA composite. DNA similarity between them: {sim}%"
            models.append({
                "id": "cosine_dna",
                "name": "Cosine DNA Match",
                "description": "Compares the 20-dimensional player DNA vector using cosine similarity. Each dimension captures a specific performance trait (pressure score, boundary %, death-over SR, etc.). The player with the higher overall DNA score wins.",
                "winner": winner_id,
                "winnerName": winner_name,
                "confidence": max(5.0, conf),
                "reasoning": reason,
                "dnaSimilarity": sim,
            })
        except Exception as e:
            print(f"[predict_battle] cosine model error: {e}")

        # ── MODEL 3: DBSCAN outlier bonus ─────────────────────────────────────
        # Outlier = sui generis player who breaks the archetype mould.
        # Outlier vs non-outlier → outlier wins (uniqueness bonus).
        # Both outlier or both non-outlier → use DNA score as tiebreak.
        try:
            out1 = bool(row1.get("is_outlier", False))
            out2 = bool(row2.get("is_outlier", False))
            dna1f, dna2f = float(row1["dim_19"]), float(row2["dim_19"])
            if out1 and not out2:
                winner_id, winner_name = id1, n1
                conf = 62.0
                reason = f"{n1} is a DBSCAN outlier — a genuinely unique player not captured by any archetype. Outliers often defy statistical expectations."
            elif out2 and not out1:
                winner_id, winner_name = id2, n2
                conf = 62.0
                reason = f"{n2} is a DBSCAN outlier — a genuinely unique player not captured by any archetype. Outliers often defy statistical expectations."
            elif dna1f >= dna2f:
                winner_id, winner_name = id1, n1
                conf = max(5.0, min(55.0, abs(dna1f - dna2f) * 1.2))
                reason = f"Both players are classified as {'outliers' if out1 else 'core cluster members'}. Tiebreak: DNA score favours {n1} ({dna1f:.1f} vs {dna2f:.1f})."
            else:
                winner_id, winner_name = id2, n2
                conf = max(5.0, min(55.0, abs(dna1f - dna2f) * 1.2))
                reason = f"Both players are classified as {'outliers' if out1 else 'core cluster members'}. Tiebreak: DNA score favours {n2} ({dna2f:.1f} vs {dna1f:.1f})."
            models.append({
                "id": "dbscan_outlier",
                "name": "DBSCAN Uniqueness",
                "description": "DBSCAN density-clustering labels players as 'core' (within a dense archetype cloud) or 'outlier' (statistically unique). Outlier players get a uniqueness bonus — their career patterns are harder to model, making them wildcards.",
                "winner": winner_id,
                "winnerName": winner_name,
                "confidence": conf,
                "reasoning": reason,
                "isOutlier1": out1,
                "isOutlier2": out2,
            })
        except Exception as e:
            print(f"[predict_battle] dbscan model error: {e}")

        # ── MODEL 4: PCA principal dominance ─────────────────────────────────
        # PC1 = direction of maximum variance in the dataset.
        # Higher PC1 projection = player dominates the principal skill axis.
        try:
            if i1 is not None and i2 is not None and self.pca is not None:
                pc_coords = self.pca.transform(self.vectors_scaled)
                pc1_1 = float(pc_coords[i1, 0])
                pc1_2 = float(pc_coords[i2, 0])
                gap = abs(pc1_1 - pc1_2)
                conf = min(90, round(gap * 15, 1))
                if pc1_1 >= pc1_2:
                    winner_id, winner_name = id1, n1
                    reason = f"{n1} projects {pc1_1:.2f} on the principal skill axis vs {n2}'s {pc1_2:.2f} — capturing {self.pca.explained_variance_ratio_[0]*100:.0f}% of all player variance."
                else:
                    winner_id, winner_name = id2, n2
                    reason = f"{n2} projects {pc1_2:.2f} on the principal skill axis vs {n1}'s {pc1_1:.2f} — capturing {self.pca.explained_variance_ratio_[0]*100:.0f}% of all player variance."
                models.append({
                    "id": "pca_dominance",
                    "name": "PCA Principal Dominance",
                    "description": "Principal Component Analysis (PCA) finds the directions of maximum variance across all players. PC1 captures the dominant skill axis. A higher PC1 score means the player exemplifies the 'platonic ideal' of cricket excellence.",
                    "winner": winner_id,
                    "winnerName": winner_name,
                    "confidence": max(5.0, conf),
                    "reasoning": reason,
                })
        except Exception as e:
            print(f"[predict_battle] pca model error: {e}")

        # ── MODEL 5: Format versatility ───────────────────────────────────────
        # dim_7 = format_versatility (0-100). Cross-format average consistency.
        try:
            v1_score = float(row1.get("dim_7", 50))
            v2_score = float(row2.get("dim_7", 50))
            gap = abs(v1_score - v2_score)
            conf = min(90, round(gap * 1.5, 1))
            if v1_score >= v2_score:
                winner_id, winner_name = id1, n1
                reason = f"{n1} scores {v1_score:.1f}/100 on format versatility vs {n2}'s {v2_score:.1f}/100. Consistent performers across TEST, ODI, and T20I earn a higher score."
            else:
                winner_id, winner_name = id2, n2
                reason = f"{n2} scores {v2_score:.1f}/100 on format versatility vs {n1}'s {v1_score:.1f}/100. Consistent performers across TEST, ODI, and T20I earn a higher score."
            models.append({
                "id": "format_versatility",
                "name": "Format Versatility",
                "description": "Measures how consistently a player performs across all three international formats (Test, ODI, T20I). A low standard deviation of batting averages across formats gives a high versatility score — true all-format greats score highest.",
                "winner": winner_id,
                "winnerName": winner_name,
                "confidence": max(5.0, conf),
                "reasoning": reason,
            })
        except Exception as e:
            print(f"[predict_battle] versatility model error: {e}")

        # ── MODEL 6: Statistical composite (career stats from api-server) ─────
        # Uses actual career stats if passed; falls back to dim_0 (pressure_score)
        try:
            def career_to_composite(career_rows):
                """Weighted batting composite across formats."""
                if not career_rows:
                    return None
                total, weight_sum = 0.0, 0.0
                weights = {"TEST": 1.5, "ODI": 1.2, "T20I": 1.0, "IPL": 0.8}
                for row in career_rows:
                    fmt = row.get("format", "")
                    w = weights.get(fmt, 1.0)
                    avg  = float(row.get("avg", 0) or 0)
                    sr   = float(row.get("sr", 0) or 0)
                    h100 = float(row.get("hundreds", 0) or 0)
                    h50  = float(row.get("fifties", 0) or 0)
                    m    = float(row.get("matches", 1) or 1)
                    # Normalize avg (0-100): 60=100, 20=0
                    avg_n  = min(100, max(0, (avg - 20) / 40 * 100))
                    # Normalize SR by format
                    sr_ref = {"TEST": 55, "ODI": 75, "T20I": 120, "IPL": 130}.get(fmt, 100)
                    sr_n   = min(100, max(0, sr / sr_ref * 70))
                    h_n    = min(100, h100 / m * 1000)
                    f_n    = min(100, h50 / m * 200)
                    composite = avg_n * 0.40 + sr_n * 0.25 + h_n * 0.25 + f_n * 0.10
                    total += composite * w
                    weight_sum += w
                return total / weight_sum if weight_sum > 0 else None

            c1_score = career_to_composite(career1)
            c2_score = career_to_composite(career2)

            # Fall back to dim_0 (pressure_score proxy) if no career data
            if c1_score is None: c1_score = float(row1.get("dim_0", 50))
            if c2_score is None: c2_score = float(row2.get("dim_0", 50))

            gap = abs(c1_score - c2_score)
            conf = min(92, round(gap * 1.6, 1))
            if c1_score >= c2_score:
                winner_id, winner_name = id1, n1
                reason = f"{n1} scores {c1_score:.1f} vs {n2}'s {c2_score:.1f} on the weighted multi-format batting composite (avg×0.4 + SR×0.25 + 100s×0.25 + 50s×0.10)."
            else:
                winner_id, winner_name = id2, n2
                reason = f"{n2} scores {c2_score:.1f} vs {n1}'s {c1_score:.1f} on the weighted multi-format batting composite (avg×0.4 + SR×0.25 + 100s×0.25 + 50s×0.10)."
            models.append({
                "id": "composite_batting",
                "name": "Statistical Composite",
                "description": "A weighted batting composite across all formats. Batting average (40%), strike rate (25%), centuries per match (25%), and fifties per match (10%) are combined with format-specific weights (Tests weighted highest, IPL lowest).",
                "winner": winner_id,
                "winnerName": winner_name,
                "confidence": max(5.0, conf),
                "reasoning": reason,
            })
        except Exception as e:
            print(f"[predict_battle] composite model error: {e}")

        # ── Judge: majority vote ──────────────────────────────────────────────
        if not models:
            return {"models": [], "judge": None}

        votes_1 = [m for m in models if m["winner"] == id1]
        votes_2 = [m for m in models if m["winner"] == id2]
        winner_id   = id1 if len(votes_1) >= len(votes_2) else id2
        winner_name = n1 if winner_id == id1 else n2
        loser_name  = n2 if winner_id == id1 else n1
        agree_count = max(len(votes_1), len(votes_2))
        total_count = len(models)
        agreement_rate = round(agree_count / total_count * 100, 1)

        # Build dissent summary
        dissenting = [m for m in models if m["winner"] != winner_id]
        if dissenting:
            dissent_str = "Dissent: " + "; ".join(f"{m['name']} favours {loser_name}" for m in dissenting)
        else:
            dissent_str = f"Unanimous — all {total_count} models agree."

        judge = {
            "winner": winner_id,
            "winnerName": winner_name,
            "agreement_rate": agreement_rate,
            "models_agreed": agree_count,
            "models_total": total_count,
            "reasoning": f"{agree_count} of {total_count} models favour {winner_name}. {dissent_str}",
        }

        return {"models": models, "judge": judge}

    # ─── Persist / load ───────────────────────────────────────────────────────

    def _save(self):
        """Save models and derived data to disk for fast startup."""
        joblib.dump(self.scaler,  os.path.join(DATA_DIR, "scaler.pkl"))
        joblib.dump(self.kmeans,  os.path.join(DATA_DIR, "kmeans.pkl"))
        joblib.dump(self.pca,     os.path.join(DATA_DIR, "pca.pkl"))
        np.save(os.path.join(DATA_DIR, "sim_matrix.npy"),  self.sim_matrix)
        np.save(os.path.join(DATA_DIR, "vectors.npy"),     self.vectors_scaled)
        self.df.to_csv(os.path.join(DATA_DIR, "players.csv"), index=False)
        with open(os.path.join(DATA_DIR, "tsne_coords.json"), "w") as f:
            json.dump(self.tsne_coords, f)
        with open(os.path.join(DATA_DIR, "player_index.json"), "w") as f:
            json.dump(self.player_index, f)
        print("[Pipeline] Saved to", DATA_DIR)

    def load(self) -> bool:
        """Load pre-fitted pipeline from disk. Returns True if successful."""
        try:
            self.scaler         = joblib.load(os.path.join(DATA_DIR, "scaler.pkl"))
            self.kmeans         = joblib.load(os.path.join(DATA_DIR, "kmeans.pkl"))
            self.pca            = joblib.load(os.path.join(DATA_DIR, "pca.pkl"))
            self.sim_matrix     = np.load(os.path.join(DATA_DIR, "sim_matrix.npy"))
            self.vectors_scaled = np.load(os.path.join(DATA_DIR, "vectors.npy"))
            self.df             = pd.read_csv(os.path.join(DATA_DIR, "players.csv"))
            # Same coercion as in fit() — pd.read_csv infers int64 when all
            # values are numeric, but URL-path lookups are strings.
            self.df["cricInfoId"] = self.df["cricInfoId"].astype(str)
            with open(os.path.join(DATA_DIR, "tsne_coords.json")) as f:
                self.tsne_coords = json.load(f)
            with open(os.path.join(DATA_DIR, "player_index.json")) as f:
                self.player_index = [str(x) for x in json.load(f)]
            self.fitted = True
            print(f"[Pipeline] Loaded from disk ({len(self.player_index)} players)")
            return True
        except Exception as e:
            print(f"[Pipeline] Load failed ({e}) — will refit from scratch")
            return False


# ─── Singleton ────────────────────────────────────────────────────────────────

pipeline = CricketDNAPipeline()
