"""
Cricket DNA — Multi-Algorithm Battle Engine

Bias-removal: the feature vector contains ONLY numeric career stats.
Player name, internal ID, and country are never included as features —
the model architecturally cannot learn "this is Kohli," because Kohli's
identity never enters the math.

Z-score normalization is computed against the live roster distribution
(fetched from the Express backend), not a fixed baseline.
"""

from dataclasses import dataclass, asdict
from enum import Enum
from typing import Optional
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
import xgboost as xgb


class Algorithm(str, Enum):
    RANDOM_FOREST = "random_forest"
    XGBOOST = "xgboost"
    SVM = "svm"
    LOGISTIC_REGRESSION = "logistic_regression"
    KNN = "knn"
    NEURAL_NETWORK = "neural_network"


ALGORITHM_REGISTRY = {
    Algorithm.RANDOM_FOREST: lambda: RandomForestClassifier(
        n_estimators=200, max_depth=6, random_state=42
    ),
    Algorithm.XGBOOST: lambda: xgb.XGBClassifier(
        n_estimators=150, max_depth=4, learning_rate=0.1, eval_metric="logloss"
    ),
    Algorithm.SVM: lambda: SVC(kernel="rbf", probability=True, C=1.0),
    Algorithm.LOGISTIC_REGRESSION: lambda: LogisticRegression(max_iter=500),
    Algorithm.KNN: lambda: KNeighborsClassifier(n_neighbors=7, weights="distance"),
    Algorithm.NEURAL_NETWORK: lambda: MLPClassifier(
        hidden_layer_sizes=(32, 16), max_iter=1000, random_state=42
    ),
}

# Plain-language "why this algorithm" copy — shown in the Battle Configuration UI
ALGORITHM_INTUITION = {
    Algorithm.RANDOM_FOREST: (
        "Builds hundreds of decision trees on stat splits (avg, SR, hundreds) "
        "and votes on the winner. Good at catching non-obvious stat interactions "
        "without overfitting to any one number."
    ),
    Algorithm.XGBOOST: (
        "Sequentially corrects its own mistakes across boosting rounds. "
        "Typically the strongest raw predictor when there's a clear statistical "
        "edge between two players."
    ),
    Algorithm.SVM: (
        "Finds the cleanest dividing line between 'winner' and 'loser' profiles "
        "in stat-space. Performs best when the two players are stylistically "
        "distinct rather than near-identical."
    ),
    Algorithm.LOGISTIC_REGRESSION: (
        "The simplest, most transparent model — weights each stat linearly. "
        "Best read as a baseline: if the fancier models disagree with this one, "
        "that's a signal the matchup is genuinely close."
    ),
    Algorithm.KNN: (
        "Looks at the most statistically similar historical player-vs-player "
        "outcomes and goes with the crowd. Good at surfacing 'this matchup has "
        "basically happened before' verdicts."
    ),
    Algorithm.NEURAL_NETWORK: (
        "A small multi-layer network that can pick up subtler, non-linear stat "
        "combinations the tree-based models might miss. Least interpretable, "
        "often most confident."
    ),
}


@dataclass
class PlayerFeatures:
    """
    Feature vector for one player. Identity fields (name, internal_id, country)
    are intentionally excluded — only numeric performance stats are used, so the
    model has no mechanism to learn or favor a specific player's identity.
    """
    avg: float
    strike_rate: float
    hundreds: float
    fifties: float
    matches: float
    economy: float
    wickets: float
    dna_score: float
    momentum_score: float
    clutch_score: float

    def to_vector(self) -> np.ndarray:
        return np.array([
            self.avg, self.strike_rate, self.hundreds, self.fifties,
            self.matches, self.economy, self.wickets, self.dna_score,
            self.momentum_score, self.clutch_score,
        ])


class FeatureNormalizer:
    """
    Z-score normalization against the live roster distribution (mean/std computed
    from all players currently known to the Express backend, fetched per request
    or cached briefly) — not a fixed baseline, and never player-specific.
    """
    def __init__(self, roster_vectors: np.ndarray):
        self.mean = roster_vectors.mean(axis=0)
        self.std = roster_vectors.std(axis=0)
        # Guard divide-by-zero for sparse stats (e.g. bowling on a pure batter)
        self.std[self.std == 0] = 1.0

    def normalize(self, vector: np.ndarray) -> np.ndarray:
        return (vector - self.mean) / self.std


@dataclass
class AlgorithmVerdict:
    algorithm: str
    predicted_winner: str          # "p1" | "p2"
    confidence: float              # 0-100
    intuition: str


@dataclass
class JudgeVerdict:
    """
    The 'Judge' doesn't run its own model — it evaluates the algorithms the user
    selected against each other and recommends which verdict to trust most.
    """
    recommended_algorithm: str
    recommended_winner: str
    agreement_rate: float          # % of selected algorithms that agree with the majority
    reasoning: str


@dataclass
class BattleVerdict:
    dna_similarity: float
    momentum_p1: float
    momentum_p2: float
    algorithm_results: list[AlgorithmVerdict]
    judge_recommendation: JudgeVerdict

    def to_dict(self) -> dict:
        return {
            "dna_similarity": self.dna_similarity,
            "momentum_p1": self.momentum_p1,
            "momentum_p2": self.momentum_p2,
            "algorithm_results": [asdict(r) for r in self.algorithm_results],
            "judge_recommendation": asdict(self.judge_recommendation),
        }


class BattleEngine:
    def __init__(self, roster_features: dict[str, PlayerFeatures]):
        """
        roster_features: internal_id -> PlayerFeatures, for the full live roster
        (bias-normalization baseline).
        """
        if not roster_features:
            # Bootstrap with empty normalizer if roster is empty
            self.normalizer = FeatureNormalizer(np.zeros((1, 10)))
            self.roster_features = {}
            self._models = {}
            return

        vectors = np.array([f.to_vector() for f in roster_features.values()])
        self.normalizer = FeatureNormalizer(vectors)
        self.roster_features = roster_features
        self._models = {}  # lazy-trained, cached per process lifetime

    def update_roster(self, roster_features: dict[str, PlayerFeatures]):
        """Update the roster and retrain models on next request."""
        if not roster_features:
            return
        vectors = np.array([f.to_vector() for f in roster_features.values()])
        self.normalizer = FeatureNormalizer(vectors)
        self.roster_features = roster_features
        self._models = {}  # invalidate cached models

    def _get_model(self, algo: Algorithm):
        if algo not in self._models:
            model = ALGORITHM_REGISTRY[algo]()
            X, y = self._build_training_set()
            if len(X) < 2:
                raise ValueError("Not enough roster data to train models")
            model.fit(X, y)
            self._models[algo] = model
        return self._models[algo]

    def _build_training_set(self) -> tuple[np.ndarray, np.ndarray]:
        """
        Trains on pairwise stat-differentials across the live roster, labeled by
        DNA-score comparison as a proxy target until real battle_outcomes history
        accumulates. No player identity is ever part of X.

        TODO: Swap to real labels from battle_outcomes once enough rows accumulate.
        """
        ids = list(self.roster_features.keys())
        X, y = [], []
        for i in range(len(ids)):
            for j in range(len(ids)):
                if i == j:
                    continue
                a = self.roster_features[ids[i]]
                b = self.roster_features[ids[j]]
                diff = (
                    self.normalizer.normalize(a.to_vector())
                    - self.normalizer.normalize(b.to_vector())
                )
                X.append(diff)
                y.append(1 if a.dna_score >= b.dna_score else 0)
        return np.array(X), np.array(y)

    def run_battle(
        self,
        p1_id: str, p1_features: PlayerFeatures,
        p2_id: str, p2_features: PlayerFeatures,
        algorithms: list[Algorithm],
    ) -> BattleVerdict:
        if len(algorithms) < 2:
            raise ValueError("Select at least 2 algorithms to run a comparison.")

        v1 = self.normalizer.normalize(p1_features.to_vector())
        v2 = self.normalizer.normalize(p2_features.to_vector())
        diff = (v1 - v2).reshape(1, -1)

        dna_similarity = round(float(100 - min(100, np.linalg.norm(v1 - v2) * 10)), 1)

        results = []
        for algo in algorithms:
            model = self._get_model(algo)
            proba = model.predict_proba(diff)[0]
            pred = model.predict(diff)[0]
            confidence = round(float(max(proba)) * 100, 1)
            results.append(AlgorithmVerdict(
                algorithm=algo.value,
                predicted_winner="p1" if pred == 1 else "p2",
                confidence=confidence,
                intuition=ALGORITHM_INTUITION[algo],
            ))

        judge = self._judge(results)

        return BattleVerdict(
            dna_similarity=dna_similarity,
            momentum_p1=p1_features.momentum_score,
            momentum_p2=p2_features.momentum_score,
            algorithm_results=results,
            judge_recommendation=judge,
        )

    def _judge(self, results: list[AlgorithmVerdict]) -> JudgeVerdict:
        """
        Recommends whichever algorithm's verdict matches the majority AND has the
        highest confidence among majority-agreeing algorithms — a simple, explainable
        rule rather than a black-box meta-model.
        """
        p1_votes = [r for r in results if r.predicted_winner == "p1"]
        p2_votes = [r for r in results if r.predicted_winner == "p2"]

        if len(p1_votes) >= len(p2_votes):
            majority, _ = p1_votes, p2_votes
        else:
            majority, _ = p2_votes, p1_votes

        agreement_rate = round(len(majority) / len(results) * 100, 1)
        best_in_majority = max(majority, key=lambda r: r.confidence)

        reasoning = (
            f"{len(majority)} of {len(results)} selected models agree the winner is "
            f"{best_in_majority.predicted_winner}. "
            f"{best_in_majority.algorithm.replace('_', ' ').title()} "
            f"had the highest confidence ({best_in_majority.confidence}%) "
            f"among the agreeing models."
        )
        if agreement_rate < 60:
            reasoning += (
                " Note: this is a close call — the models don't strongly agree, "
                "treat the verdict as a toss-up."
            )

        return JudgeVerdict(
            recommended_algorithm=best_in_majority.algorithm,
            recommended_winner=best_in_majority.predicted_winner,
            agreement_rate=agreement_rate,
            reasoning=reasoning,
        )
