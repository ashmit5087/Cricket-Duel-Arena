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
        Must have columns: cricInfoId, name, archetype_id, dim_0 … dim_19
        """
        self.df = df.copy()
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
            with open(os.path.join(DATA_DIR, "tsne_coords.json")) as f:
                self.tsne_coords = json.load(f)
            with open(os.path.join(DATA_DIR, "player_index.json")) as f:
                self.player_index = json.load(f)
            self.fitted = True
            print(f"[Pipeline] Loaded from disk ({len(self.player_index)} players)")
            return True
        except Exception as e:
            print(f"[Pipeline] Load failed ({e}) — will refit from scratch")
            return False


# ─── Singleton ────────────────────────────────────────────────────────────────

pipeline = CricketDNAPipeline()
