import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { playersRouter } from "./players";
import { battleRouter } from "./battle";
import { liveRouter } from "./live";
import { kohliRouter } from "./kohli";
import { quizRouter } from "./quiz";
import { engagementRouter } from "./engagement";
import { getBudgetStatus } from "../services/cricdata";
import { logger } from "../utils/logger";

const ML_URL = process.env.ML_URL ?? "http://localhost:8000";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/players", playersRouter);
router.use("/player", playersRouter);   // alias so /api/player/:id/stats also works
router.use("/battle", battleRouter);
router.use("/live", liveRouter);
router.use("/kohli", kohliRouter);
router.use("/quiz", quizRouter);
router.use("/engagement", engagementRouter);

// GET /api/budget — live budget status
router.get("/budget", async (_req, res) => {
  try {
    const status = await getBudgetStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/search?q=... — alias for player search
router.get("/search", async (req, res) => {
  const q = ((req.query.q as string) ?? "").trim();
  if (q.length < 2) return res.json([]);
  req.url = `/search?q=${encodeURIComponent(q)}`;
  playersRouter(req, res, () => res.status(404).json({ error: "Not found" }));
});

// GET /api/constellation — placeholder returning empty (ML service)
router.get("/constellation", (_req, res) => {
  res.json([]);
});

// GET /api/clusters — placeholder returning empty (ML service)
router.get("/clusters", (_req, res) => {
  res.json([]);
});

// GET /api/knn — placeholder returning empty (ML service)
router.get("/knn", (_req, res) => {
  res.json({ player: null, twins: [] });
});

// GET /api/algorithms — proxy to ML service (keeps ML_URL off the client)
router.get("/algorithms", async (_req, res) => {
  try {
    const mlRes = await fetch(`${ML_URL}/algorithms`, {
      signal: AbortSignal.timeout(5000),
    });
    if (mlRes.ok) {
      const data = await mlRes.json();
      return res.json(data);
    }
  } catch {
    logger.debug("[algorithms] ML service unavailable, returning defaults");
  }

  // Fallback: return the 6 algorithm descriptions statically
  res.json([
    { id: "random_forest", description: "Builds hundreds of decision trees on stat splits (avg, SR, hundreds) and votes on the winner. Good at catching non-obvious stat interactions without overfitting to any one number." },
    { id: "xgboost", description: "Sequentially corrects its own mistakes across boosting rounds. Typically the strongest raw predictor when there's a clear statistical edge between two players." },
    { id: "svm", description: "Finds the cleanest dividing line between 'winner' and 'loser' profiles in stat-space. Performs best when the two players are stylistically distinct rather than near-identical." },
    { id: "logistic_regression", description: "The simplest, most transparent model — weights each stat linearly. Best read as a baseline: if the fancier models disagree with this one, that's a signal the matchup is genuinely close." },
    { id: "knn", description: "Looks at the most statistically similar historical player-vs-player outcomes and goes with the crowd. Good at surfacing 'this matchup has basically happened before' verdicts." },
    { id: "neural_network", description: "A small multi-layer network that can pick up subtler, non-linear stat combinations the tree-based models might miss. Least interpretable, often most confident." },
  ]);
});

export default router;

