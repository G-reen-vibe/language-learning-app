import { WordState } from "./types";

/**
 * FSRS-5 (Free Spaced Repetition Scheduler) — simplified standalone implementation.
 *
 * Core state: stability (S, in days), difficulty (D, 1..10).
 *
 * On a review with grade g ∈ {1=Again, 2=Hard, 3=Good, 4=Easy}:
 *   retrievability R = (1 + t/(9*S))^(-1) where t is days since last review.
 *
 *   Difficulty update:
 *     D' = D - 0.8*(g-3) + 0.1   (clamped 1..10)
 *     D = mean_reversion(D', D0=5)  // pull toward 5 by 0.1
 *
 *   Stability update (positive review, g>=3):
 *     S' = S * (1 + exp(-w) * (11 - D) * S^(-0.5) * (exp((1-R)*8) - 1) * (g==4 ? 1.3 : 1))
 *   Lapse (g==1):
 *     S' = S * 0.5 * exp(-0.2*(D-1))   // new stability after lapse
 *
 *   For new cards (S=0): initialize S based on first grade:
 *     Again: 0.4, Hard: 1.2, Good: 2.5, Easy: 5.0
 *
 *   Next interval = round(S * request_retention) → here we use S directly as days.
 *
 * Mastery mapping:
 *   0 = never seen
 *   1 = S >= 0.4 (introduced)
 *   2 = S >= 2
 *   3 = S >= 6
 *   4 = S >= 21
 *   5 = S >= 60
 *
 * Quality → grade mapping (we receive a 0..5 quality):
 *   q<3 → 1 (Again)  — also covers blackout
 *   q==3 → 2 (Hard)
 *   q==4 → 3 (Good)
 *   q==5 → 4 (Easy)
 */

type FSRSGrade = 1 | 2 | 3 | 4;

function qualityToGrade(q: number): FSRSGrade {
  if (q < 3) return 1;
  if (q === 3) return 2;
  if (q === 4) return 3;
  return 4;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function meanReversion(d: number, target: number, weight = 0.1): number {
  return d + (target - d) * weight;
}

function retrievability(stability: number, daysSinceLast: number): number {
  if (stability <= 0) return 0;
  // R(t) = (1 + t/(9*S))^(-1)
  return Math.pow(1 + daysSinceLast / (9 * stability), -1);
}

const INIT_STABILITY: Record<FSRSGrade, number> = {
  1: 0.4,
  2: 1.2,
  3: 2.5,
  4: 5.0,
};

export function fsrs5Update(state: WordState, quality: number): WordState {
  const g = qualityToGrade(quality);
  const now = Date.now();
  const daysSinceLast =
    state.lastReviewed != null
      ? Math.max(0, (now - state.lastReviewed) / (24 * 60 * 60 * 1000))
      : 0;

  let { stability, difficulty } = state;

  // Stability update (uses pre-update difficulty, per FSRS-5 spec:
  // the difficulty update represents the new state AFTER the review,
  // so the stability formula should use the difficulty BEFORE the update)
  if (stability <= 0) {
    // first review
    stability = INIT_STABILITY[g];
  } else {
    const R = retrievability(stability, daysSinceLast);
    if (g === 1) {
      // lapse — uses pre-update difficulty
      stability = Math.max(
        0.1,
        stability * 0.5 * Math.exp(-0.2 * (difficulty - 1))
      );
    } else {
      // positive — uses pre-update difficulty
      const easyBonus = g === 4 ? 1.3 : 1.0;
      const w = -0.5; // constant; in real FSRS this is a fitted parameter
      const factor =
        1 +
        Math.exp(-w) * (11 - difficulty) * Math.pow(stability, -0.5) *
        (Math.exp((1 - R) * 8) - 1) * easyBonus;
      stability = stability * factor;
    }
  }

  // Difficulty update (after stability, so stability uses pre-update difficulty)
  const newD = clamp(
    difficulty - 0.8 * (g - 3) + 0.1,
    1,
    10
  );
  difficulty = clamp(meanReversion(newD, 5, 0.1), 1, 10);

  // Next interval = stability in days
  const interval = Math.max(1, Math.round(stability));
  const nextReview = now + interval * 24 * 60 * 60 * 1000;

  // Mastery — same stability-oriented mapping as SM-2:
  //  - Each positive review bumps mastery by 1 (steady visible progress).
  //  - Stability tier acts as a floor.
  //  - Lapse drops mastery by 1 (not collapse to 1).
  let mastery = state.mastery;
  if (g >= 2) {
    const stabilityTier =
      stability >= 60 ? 5
      : stability >= 21 ? 4
      : stability >= 6 ? 3
      : stability >= 2 ? 2
      : 1;
    mastery = Math.max(state.mastery + 1, stabilityTier);
    if (!state.seen) mastery = Math.max(mastery, 1);
    mastery = Math.min(5, mastery);
  } else {
    // lapse — drop by 1, not collapse to 1.
    if (!state.seen) mastery = 1;
    else mastery = Math.max(1, state.mastery - 1);
  }

  // Set introducedAt on first successful review
  const introducedAt = (!state.seen && g >= 2) ? now : state.introducedAt;

  return {
    ...state,
    stability,
    difficulty,
    lastReviewed: now,
    nextReview,
    mastery,
    seen: true,
    introducedAt,
    totalReviews: state.totalReviews + 1,
    totalCorrect: state.totalCorrect + (g >= 2 ? 1 : 0),
    // keep SM-2 fields in sync for compatibility (interval/repetitions used for display)
    interval,
    repetitions: g >= 2 ? state.repetitions + 1 : 0,
  };
}
