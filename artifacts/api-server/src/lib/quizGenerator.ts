// src/lib/quizGenerator.ts
// ─────────────────────────────────────────────────────────────────────────────
// LLM-based quiz generation using the existing Gemini integration.
//
// IMPORTANT: No question bank is stored. Questions are generated fresh per
// session and exist only for the lifetime of that session. The quiz_attempts
// table stores only the result metadata, never the questions themselves.
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuizQuestion {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctIndex: number;  // 0-3
  explanation: string;
}

export interface GeneratedQuiz {
  title: string;
  difficulty: string;
  questions: QuizQuestion[];
}

// ── LLM Prompt ───────────────────────────────────────────────────────────────

const QUIZ_PROMPT = `You are the Cricket DNA Quiz Generator.

Generate exactly 10 fresh, moderate-difficulty multiple-choice questions
about Virat Kohli and cricket.

Requirements:
- Exactly 10 questions.
- Exactly 4 options per question.
- Exactly 1 objectively correct answer.
- Every question must be factually verifiable.
- Difficulty must be moderate, not beginner trivia.
- Cover a varied mix of:
  international cricket,
  IPL,
  major innings,
  records,
  milestones,
  captaincy,
  formats,
  and important cricket context.
- Do not repeat the same fact in multiple questions.
- Do not make questions dependent on another question.
- Randomize the position of the correct answer.
- Include a concise explanation for every answer.
- Do not create subjective personality questions.
- Do not create "which fan type are you?" questions.
- Do not use uncertain or disputed statistics.
- If a statistic may have changed over time, phrase the question around
  a fixed historical event or milestone.
- Return valid JSON only.

JSON shape:
{
  "title": "Kohli Fanboy Quiz",
  "difficulty": "moderate",
  "questions": [
    {
      "id": "q1",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "..."
    }
  ]
}`;

const RETRY_PROMPT = `${QUIZ_PROMPT}

CRITICAL: Your previous response was malformed. This time you MUST:
1. Return ONLY valid JSON — no markdown, no backticks, no prose.
2. Include EXACTLY 10 questions.
3. Each question MUST have exactly 4 options.
4. correctIndex MUST be 0, 1, 2, or 3.
5. Every field must be a non-empty string.
6. Question IDs must be q1 through q10.`;

// ── Validation ──────────────────────────────────────────────────────────────

function validateQuiz(data: any): GeneratedQuiz | null {
  try {
    if (!data || typeof data !== "object") return null;
    if (!data.title || !data.difficulty) return null;
    if (!Array.isArray(data.questions)) return null;
    if (data.questions.length !== 10) return null;

    const seenIds = new Set<string>();
    const seenQuestions = new Set<string>();

    for (const q of data.questions) {
      // Must have required fields
      if (!q.id || !q.question || !q.explanation) return null;
      if (typeof q.question !== "string" || q.question.trim().length === 0) return null;
      if (typeof q.explanation !== "string" || q.explanation.trim().length === 0) return null;

      // Unique ID
      if (seenIds.has(q.id)) return null;
      seenIds.add(q.id);

      // Unique question text (fuzzy)
      const normalized = q.question.toLowerCase().trim();
      if (seenQuestions.has(normalized)) return null;
      seenQuestions.add(normalized);

      // Exactly 4 non-empty options
      if (!Array.isArray(q.options) || q.options.length !== 4) return null;
      for (const opt of q.options) {
        if (typeof opt !== "string" || opt.trim().length === 0) return null;
      }

      // correctIndex in range
      if (typeof q.correctIndex !== "number" || q.correctIndex < 0 || q.correctIndex > 3) return null;
    }

    return data as GeneratedQuiz;
  } catch {
    return null;
  }
}

// ── Gemini call ──────────────────────────────────────────────────────────────

async function callGemini(prompt: string): Promise<any> {
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    throw new Error("GEMINI_API_KEY not set — cannot generate quiz");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.7,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(120000),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}: ${res.statusText}`);
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  // Parse JSON — handle cases where Gemini wraps in markdown code blocks
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates a fresh quiz using Gemini. Validates the response.
 * Retries once with a stricter prompt if validation fails.
 * Never stores questions — they exist only for this session.
 */
export async function generateKohliQuiz(): Promise<GeneratedQuiz> {
  // First attempt
  try {
    const data = await callGemini(QUIZ_PROMPT);
    logger.info("[quiz] Gemini first attempt output", { data });
    const validated = validateQuiz(data);
    if (validated) {
      logger.info("[quiz] Generated and validated quiz on first attempt");
      return validated;
    }
    logger.warn("[quiz] First attempt produced invalid quiz, retrying with stricter prompt");
  } catch (e: any) {
    logger.warn("[quiz] First generation attempt failed", { error: e.message });
  }

  // Retry with stricter prompt
  try {
    const data = await callGemini(RETRY_PROMPT);
    const validated = validateQuiz(data);
    if (validated) {
      logger.info("[quiz] Generated and validated quiz on retry");
      return validated;
    }
  } catch (e: any) {
    logger.error("[quiz] Retry generation also failed", { error: e.message });
  }

  throw new Error("Failed to generate a valid quiz after 2 attempts");
}
