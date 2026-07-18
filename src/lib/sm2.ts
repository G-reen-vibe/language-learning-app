import { WordState } from "./types";
import { sm2Mastery, cardStateFromWordState } from "./mastery";

/**
 * SM-2 spaced repetition algorithm.
 *
 * Quality q ∈ [0, 5]:
 *  0 = total blackout
 *  1 = wrong, but correct answer felt familiar after seeing it
 *  2 = wrong, but correct answer seemed easy to recall after seeing it
 *  3 = correct, but with serious difficulty
 *  4 = correct, after some hesitation
 *  5 = perfect recall
 *
 * If q < 3: reset repetitions to 0, interval = 1.
 * Else:
 *   repetitions += 1
 *   interval = 1 if rep==1, 6 if rep==2, else round(interval * ease)
 *
 * Ease update: ease = max(1.3, ease + 0.1 - (5-q)*(0.08 + (5-q)*0.02))
 *
 * Mastery is now computed from the post-update state using the Flashcards
 * app's SM-2 mastery formula (see `./mastery.ts::sm2Mastery`). This produces
 * a smooth, continuous value in [0, 1] that doesn't swing wildly on a
 * single correct/wrong answer.
 */

export function sm2Update(state: WordState, quality: number): WordState {
  // clamp quality
  const q = Math.max(0, Math.min(5, quality));
  const now = Date.now();
  let { ease, interval, repetitions } = state;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }

  // ease update only if q>=3, but per classic SM-2 we always update
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease < 1.3) ease = 1.3;

  const nextReview = now + interval * 24 * 60 * 60 * 1000;

  // Set introducedAt on first successful review
  const introducedAt = (!state.seen && q >= 3) ? now : state.introducedAt;

  const next: WordState = {
    ...state,
    ease,
    interval,
    repetitions,
    lastReviewed: now,
    nextReview,
    // Mastery recomputed from post-update state — smooth, low-volatility.
    mastery: 0, // set below
    seen: true,
    introducedAt,
    totalReviews: state.totalReviews + 1,
    totalCorrect: state.totalCorrect + (q >= 3 ? 1 : 0),
  };

  const cardState = cardStateFromWordState(next);
  next.mastery = sm2Mastery(cardState, next.interval, next.lastReviewed, next.totalReviews, now);

  // For a brand-new word seeing its first successful review, the Flashcards
  // formula returns ~0.06 (1 review, interval=1 → r≈0.9, conf=0.125, mat≈0.18
  //   → 0.9 * 0.125 * (0.5 + 0.5*0.18) ≈ 0.067).
  // This is below the 0.10 "introduced" threshold, so the word would NOT
  // satisfy a `minMasteryForNewWords = 0.10` check immediately after its
  // introduction. The introduceWord() helper in session.ts handles this by
  // flooring mastery at 0.10 on the first successful review. For subsequent
  // real reviews here, the natural formula takes over.

  return next;
}

/** Create a fresh word state (never seen). */
export function freshWordState(wordKey: string): WordState {
  const now = Date.now();
  return {
    wordKey,
    ease: 2.5,
    interval: 0,
    repetitions: 0,
    lastReviewed: null,
    nextReview: now, // due now (introduction)
    stability: 0,
    difficulty: 5, // FSRS-5 mid
    mastery: 0,
    seen: false,
    introducedAt: null,
    totalReviews: 0,
    totalCorrect: 0,
  };
}
