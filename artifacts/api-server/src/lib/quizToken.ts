// src/lib/quizToken.ts
// ─────────────────────────────────────────────────────────────────────────────
// HMAC-SHA256 signed quiz tokens.
//
// The correct answers MUST NOT be trusted from the browser. This module
// creates a short-lived signed payload containing only the information
// needed to verify answers server-side.
//
// The frontend receives the public question data separately.
// The signed payload is returned as a `quizToken` string.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

const SECRET = process.env.QUIZ_SIGNING_SECRET ?? "cricket-dna-quiz-default-secret-change-me";
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Types ─────────────────────────────────────────────────────────────────────

export interface QuizTokenPayload {
  quizId: string;
  questions: {
    id: string;
    correctIndex: number;
    points: number;
  }[];
  expiresAt: number; // Unix timestamp ms
}

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * Creates an HMAC-SHA256 signed token containing the correct answers
 * and expiration time. The token is base64url-encoded.
 */
export function createQuizToken(payload: Omit<QuizTokenPayload, "expiresAt">): string {
  const full: QuizTokenPayload = {
    ...payload,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };

  const json = JSON.stringify(full);
  const data = Buffer.from(json, "utf-8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", SECRET)
    .update(data)
    .digest("base64url");

  return `${data}.${sig}`;
}

// ── Verify ──────────────────────────────────────────────────────────────────

/**
 * Verifies the HMAC signature and checks expiration.
 * Returns the payload if valid, null otherwise.
 * Never trusts correct answers, scoring, or tier from the client.
 */
export function verifyQuizToken(token: string): QuizTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [data, sig] = parts;

    // Verify signature
    const expectedSig = crypto
      .createHmac("sha256", SECRET)
      .update(data)
      .digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }

    // Decode payload
    const json = Buffer.from(data, "base64url").toString("utf-8");
    const payload: QuizTokenPayload = JSON.parse(json);

    // Check expiration
    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
