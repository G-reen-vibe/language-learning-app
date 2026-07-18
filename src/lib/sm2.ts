import { WordState } from "./types";

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

  // Map (repetitions, interval) → mastery tier 0..5.
  // mastery 0 = never seen (handled by caller before first review)
  // mastery 1 = introduced (1+ correct)
  // mastery 2 = 2+ correct reps
  // mastery 3 = interval >= 6 days (sustained)
  // mastery 4 = interval >= 21 days
  // mastery 5 = interval >= 60 days (truly mastered)
  let mastery = state.mastery;
  if (q >= 3) {
    if (interval >= 60) mastery = 5;
    else if (interval >= 21) mastery = 4;
    else if (interval >= 6) mastery = 3;
    else if (repetitions >= 2) mastery = 2;
    else mastery = 1;
  } else {
    // failed: if never seen, treat as introduced-but-weak (mastery 1)
    // so the word remains servable for diff-1 formats
    if (!state.seen) mastery = 1;
    else mastery = Math.min(state.mastery, 1);
  }

  // Set introducedAt on first successful review
  const introducedAt = (!state.seen && q >= 3) ? now : state.introducedAt;

  return {
    ...state,
    ease,
    interval,
    repetitions,
    lastReviewed: now,
    nextReview,
    mastery,
    seen: true,
    introducedAt,
    totalReviews: state.totalReviews + 1,
    totalCorrect: state.totalCorrect + (q >= 3 ? 1 : 0),
  };
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
