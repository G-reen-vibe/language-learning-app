/**
 * Shared mastery computation — ported verbatim from the Flashcards app's
 * `src/lib/schedulers/sm2.ts` and `src/lib/schedulers/fsrs.ts` so that
 * both apps share the same smooth, low-volatility mastery formula.
 *
 * The mastery value is a continuous float in [0, 1] derived from a card's
 * current scheduling state. It is NOT stored on the scheduler side (it's
 * recomputed on every review from the post-update state), which keeps
 * mastery changes bounded by the per-review change in stability / difficulty
 * / interval — no large swings, no cliff edges between tiers.
 *
 * Formula (FSRS variant — uses `stability` directly):
 *   r = retrievability(elapsedDays, max(stability, 0.1))
 *       = (1 + FACTOR * elapsedDays / stability) ^ DECAY
 *   stabilityMaturity = tanh(log1p(stabilityDays) / 3.5)
 *   confidence = min(1, totalReviews / 8)
 *   mastery = clamp(r * confidence * (0.5 + 0.5 * stabilityMaturity), 0, 1)
 *
 * Formula (SM-2 variant — uses `interval` as a stability proxy):
 *   Same as above, but:
 *     - elapsedDays uses the same `daysBetween(lastReview, now)` helper
 *     - stabilityMaturity uses `log1p(intervalDays)` instead of `log1p(stability)`
 *     - retrievability falls back to a linear decay:
 *         r = max(0, 1 - max(0, elapsed - interval) / max(interval * 2, 1))
 *       because SM-2 has no native retrievability concept.
 *     - For LEARNING/RELEARNING cards (interval == 0), mastery is capped at
 *       0.2 * confidence so newly-introduced cards don't immediately jump
 *       to a high tier.
 *
 * `NEW` cards always return 0 (never seen).
 *
 * The constants DECAY, FACTOR, and the maturity divisor (3.5) match the
 * Flashcards app exactly so the per-tier boundaries land at the same
 * mastery values in both apps.
 */

const DECAY = -0.5;
// FACTOR such that retention R=0.9 when elapsed = stability
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // ≈ 0.2346
const MATURITY_DIVISOR = 3.5;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * FSRS retrievability: probability of recall after `elapsedDays` since last
 * review for a card with stability `s` (in days).
 *   R = (1 + FACTOR * t / s) ^ DECAY
 */
export function fsrsRetrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

/**
 * FSRS-5 mastery — ported verbatim from Flashcards `fsrs.ts::mastery`.
 *
 * @param state    Card state: 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING'
 * @param stability  FSRS stability in days (>= 0)
 * @param lastReviewed  epoch ms of last review (or null if never reviewed)
 * @param totalReviews  total review count (used for confidence ramp)
 * @param now       current time (epoch ms); defaults to Date.now()
 */
export function fsrsMastery(
  state: string,
  stability: number,
  lastReviewed: number | null,
  totalReviews: number,
  now: number = Date.now()
): number {
  if (state === "NEW") return 0;
  const stabilityDays = stability || 0;
  const elapsed = lastReviewed != null
    ? Math.max(0, (now - lastReviewed) / 86_400_000)
    : 0;
  const r = fsrsRetrievability(elapsed, Math.max(stabilityDays, 0.1));
  const stabilityMaturity = Math.tanh(Math.log1p(stabilityDays) / MATURITY_DIVISOR);
  const confidence = Math.min(1, totalReviews / 8);
  const m = r * confidence * (0.5 + 0.5 * stabilityMaturity);
  return clamp(m, 0, 1);
}

/**
 * SM-2 mastery — ported verbatim from Flashcards `sm2.ts::mastery`.
 *
 * SM-2 has no native retrievability, so we use a linear decay proxy:
 *   r = max(0, 1 - max(0, elapsed - interval) / max(interval * 2, 1))
 *
 * Cards still in LEARNING/RELEARNING steps (interval == 0) haven't graduated
 * yet, so mastery is capped low:
 *   mastery = 0.2 * confidence
 */
export function sm2Mastery(
  state: string,
  intervalDays: number,
  lastReviewed: number | null,
  totalReviews: number,
  now: number = Date.now()
): number {
  if (state === "NEW") return 0;
  const interval = Math.max(intervalDays, 0);
  const confidence = Math.min(1, totalReviews / 8);
  if (interval === 0) {
    return clamp(0.2 * confidence, 0, 1);
  }
  const stabilityMaturity = Math.tanh(Math.log1p(interval) / MATURITY_DIVISOR);
  const elapsed = lastReviewed != null
    ? Math.max(0, (now - lastReviewed) / 86_400_000)
    : 0;
  const r = Math.max(
    0,
    1 - Math.max(0, elapsed - interval) / Math.max(interval * 2, 1)
  );
  const m = r * confidence * (0.5 + 0.5 * stabilityMaturity);
  return clamp(m, 0, 1);
}

/**
 * Map a WordState's scheduling state to a string the Flashcards scheduler
 * recognises: 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING'.
 *
 * Mapping rules:
 *  - !seen → 'NEW'
 *  - seen, but interval == 0 / stability == 0 (or repetitions == 0 after a
 *    lapse) → 'LEARNING' (or 'RELEARNING' if the word has been seen before
 *    and is now in a relearning step — we approximate as LEARNING since SM-2
 *    here doesn't track a separate RELEARNING state)
 *  - otherwise → 'REVIEW'
 */
export function cardStateFromWordState(s: {
  seen: boolean;
  interval: number;
  repetitions: number;
  stability: number;
}): string {
  if (!s.seen) return "NEW";
  // Treat graduated cards (positive interval AND has stability/repetitions)
  // as REVIEW. Otherwise LEARNING.
  if (s.interval >= 1 || s.stability >= 1 || s.repetitions >= 1) return "REVIEW";
  return "LEARNING";
}
