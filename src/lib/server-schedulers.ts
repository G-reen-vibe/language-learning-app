import { WordState } from "./types";
import { sm2Update } from "./sm2";
import { fsrs5Update } from "./fsrs5";
import type { Prisma } from "@prisma/client";

/**
 * Server-side scheduler adapters.
 *
 * The existing sm2.ts / fsrs5.ts modules work on the client-facing `WordState`
 * type (with epoch-ms timestamps). The Prisma `WordState` model stores
 * `lastReviewed` and `introducedAt` as DateTime fields. These adapters bridge
 * the two representations so we can reuse the existing, tested scheduler code
 * without modification.
 *
 * Conversions:
 *   - Prisma row → client WordState: DateTime → epoch ms (null → null)
 *   - client WordState → Prisma update: epoch ms → DateTime
 */

/** Convert a Prisma WordState row to the client-facing WordState type. */
export function prismaWordStateToClient(row: {
  wordKey: string;
  ease: number;
  interval: number;
  repetitions: number;
  lastReviewed: Date | null;
  stability: number;
  difficulty: number;
  mastery: number;
  seen: boolean;
  introducedAt: Date | null;
  totalReviews: number;
  totalCorrect: number;
}): WordState {
  return {
    wordKey: row.wordKey,
    ease: row.ease,
    interval: row.interval,
    repetitions: row.repetitions,
    lastReviewed: row.lastReviewed ? row.lastReviewed.getTime() : null,
    // nextReview is computed by the schedulers but never read by the app
    // (mastery-tier gating is used instead). Default to now() — it's ignored.
    nextReview: Date.now(),
    stability: row.stability,
    difficulty: row.difficulty,
    mastery: row.mastery,
    seen: row.seen,
    introducedAt: row.introducedAt ? row.introducedAt.getTime() : null,
    totalReviews: row.totalReviews,
    totalCorrect: row.totalCorrect,
  };
}

/** Convert a client-facing WordState back to a Prisma update payload. */
export function clientWordStateToPrismaUpdate(
  state: WordState
): Prisma.WordStateUpdateInput {
  return {
    ease: state.ease,
    interval: state.interval,
    repetitions: state.repetitions,
    lastReviewed: state.lastReviewed ? new Date(state.lastReviewed) : null,
    stability: state.stability,
    difficulty: state.difficulty,
    mastery: state.mastery,
    seen: state.seen,
    introducedAt: state.introducedAt ? new Date(state.introducedAt) : null,
    totalReviews: state.totalReviews,
    totalCorrect: state.totalCorrect,
  };
}

/** Apply the "introduction" pseudo-review (just marks the word as seen). */
export function introduceWordServer(state: WordState): WordState {
  const now = Date.now();
  return {
    ...state,
    seen: true,
    mastery: 1,
    introducedAt: now,
    lastReviewed: now,
  };
}

/**
 * Apply a review result via the lesson's configured algorithm.
 *
 * Mirrors `applyAlgorithmResult` from session.ts, but intended for server-side
 * use where we already have the algorithm string and the WordState object.
 */
export function applyReview(
  state: WordState,
  quality: number,
  algorithm: string
): WordState {
  if (algorithm === "FSRS-5") return fsrs5Update(state, quality);
  return sm2Update(state, quality);
}
