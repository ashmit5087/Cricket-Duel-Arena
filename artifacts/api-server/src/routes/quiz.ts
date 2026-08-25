// src/routes/quiz.ts
// ─────────────────────────────────────────────────────────────────────────────
// LLM-generated Kohli Fanboy Quiz.
//
// No predefined question bank. No stored questions in Postgres.
// Gemini generates 10 fresh questions per session. Backend validates,
// signs, scores, and persists only the attempt result.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { query } from "../db/postgres";
import { generateKohliQuiz } from "../lib/quizGenerator";
import { createQuizToken, verifyQuizToken } from "../lib/quizToken";
import { logger } from "../utils/logger";

export const quizRouter: Router = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuizSubmission {
  quizToken: string;
  answers: {
    questionId: string;
    selectedIndex: number;
  }[];
}

// ── Tier calculation ──────────────────────────────────────────────────────────

function calculateTier(percentage: number): string {
  if (percentage >= 90) return "True Chikoo — Front Row, Every Match";
  if (percentage >= 65) return "Genuine Fan";
  if (percentage >= 35) return "Casual Follower";
  return "Just Here for the Vibes";
}

function getTierEmoji(tier: string): string {
  if (tier.includes("True Chikoo")) return "👑";
  if (tier.includes("Genuine")) return "🏏";
  if (tier.includes("Casual")) return "📺";
  return "🎵";
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/quiz/kohli-fanboy
// Generates a fresh quiz through the LLM.
quizRouter.get("/kohli-fanboy", async (_req: Request, res: Response) => {
  try {
    const quiz = await generateKohliQuiz();

    // Create signed token containing correct answers — never sent to browser
    const token = createQuizToken({
      quizId: "kohli-fanboy",
      questions: quiz.questions.map((q) => ({
        id: q.id,
        correctIndex: q.correctIndex,
        points: 10,
      })),
    });

    // Public questions — correctIndex and explanation stripped
    const publicQuestions = quiz.questions.map(({ id, question, options }) => ({
      id,
      question,
      options,
    }));

    res.json({
      quizId: "kohli-fanboy",
      title: quiz.title,
      difficulty: quiz.difficulty,
      questions: publicQuestions,
      quizToken: token,
    });
  } catch (error: any) {
    logger.error("[quiz] Generation failed", { error: error.message });
    res.status(503).json({
      error: "Unable to generate the quiz right now. Please try again.",
      detail: error.message
    });
  }
});

// POST /api/quiz/kohli-fanboy/submit
quizRouter.post("/kohli-fanboy/submit", async (req: Request, res: Response) => {
  try {
    const submission = req.body as QuizSubmission;

    if (!submission.quizToken || !submission.answers) {
      return res.status(400).json({ error: "quizToken and answers are required." });
    }

    // Verify the signed token — never trust correct answers from the client
    const payload = verifyQuizToken(submission.quizToken);
    if (!payload) {
      return res.status(400).json({ error: "Quiz expired or invalid." });
    }

    if (submission.answers.length !== payload.questions.length) {
      return res.status(400).json({ error: "All quiz questions must be answered." });
    }

    // Score deterministically using the server-signed correct answers
    let totalScore = 0;
    const maxScore = payload.questions.length * 10;

    const breakdown = payload.questions.map((question) => {
      const answer = submission.answers.find(
        (item) => item.questionId === question.id
      );

      const correct = answer?.selectedIndex === question.correctIndex;

      if (correct) {
        totalScore += question.points;
      }

      return {
        questionId: question.id,
        correct,
        correctIndex: question.correctIndex,
        selectedIndex: answer?.selectedIndex ?? -1,
        pointsAwarded: correct ? question.points : 0,
      };
    });

    const percentage = Math.round((totalScore / maxScore) * 100);
    const tier = calculateTier(percentage);

    // Persist only the attempt result — NOT the questions
    await query(
      `INSERT INTO quiz_attempts
        (quiz_id, user_id, score, max_score, percentage, tier, answers)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        "kohli-fanboy",
        null, // user_id — can be added later with auth
        totalScore,
        maxScore,
        percentage,
        tier,
        JSON.stringify(submission.answers),
      ]
    ).catch((e) => {
      logger.warn("[quiz] Failed to persist attempt", { error: e.message });
      // Don't fail the response — scoring still works without persistence
    });

    res.json({
      totalScore,
      maxScore,
      percentage,
      tier,
      tierEmoji: getTierEmoji(tier),
      breakdown,
    });
  } catch (error: any) {
    logger.error("[quiz] Submission failed", { error: error.message });
    res.status(500).json({ error: "Unable to score the quiz." });
  }
});

// GET /api/quiz/kohli-fanboy/leaderboard
quizRouter.get("/kohli-fanboy/leaderboard", async (_req: Request, res: Response) => {
  try {
    const rows = await query(
      `SELECT user_id, score, max_score, percentage, tier, created_at
       FROM quiz_attempts
       WHERE quiz_id = $1
       ORDER BY score DESC, created_at ASC
       LIMIT 20`,
      ["kohli-fanboy"]
    );

    res.json(rows);
  } catch (e: any) {
    logger.error("[quiz] Leaderboard failed", { error: e.message });
    res.status(500).json({ error: "Leaderboard fetch failed" });
  }
});
