import { Lesson, WordEntry, WordState, StudyMode, QuestionResult } from "@/lib/types";

export interface FormatComponentProps {
  lesson: Lesson;
  eligibleWords: { word: WordEntry; state: WordState }[];
  onResult: (r: QuestionResult) => void;
  /**
   * Called when the format is complete.
   * @param results word-level results (may be > questionCount for matchPairs)
   * @param questionCount how many "questions" this counted as in the session
   */
  onDone: (results: QuestionResult[], questionCount: number) => void;
  mode: StudyMode;
  remainingBudget: number;
}

/**
 * Determine N (number of choices/pairs/cards/etc.) for a format based on word mastery.
 *
 * Mastery is now a continuous value in [0, 1]. The scaling maps mastery to
 * N smoothly so that a single correct answer no longer produces a large jump
 * in N (which was the root cause of the "huge swings in mastery → large
 * spikes in difficulty" complaint).
 *
 * Mastery → N scaling (cap'd at `cap`):
 *   mastery < 0.10 → N=2 (just introduced, keep it simple)
 *   mastery < 0.25 → N=2
 *   mastery < 0.50 → N=3
 *   mastery < 0.75 → N=4
 *   mastery < 0.90 → N=5
 *   mastery >= 0.90 → N=cap
 *
 * The thresholds 0.10 / 0.25 / 0.50 / 0.75 mirror the Flashcards app's
 * `maxLevelForMastery` boundaries so N scales at the same cadence as the
 * format-tier unlock. N grows by ~1 per mastery tier crossed — no big jumps.
 */
export function nForMastery(mastery: number, cap: number): number {
  let n: number;
  if (mastery < 0.10) n = 2;
  else if (mastery < 0.25) n = 2;
  else if (mastery < 0.50) n = 3;
  else if (mastery < 0.75) n = 4;
  else if (mastery < 0.90) n = 5;
  else n = 6;
  return Math.min(Math.max(2, n), cap);
}

/**
 * Determine number of "irrelevant" pieces / distractors for scramble/fill modes.
 * Scales with mastery: more mastery → more distractors.
 *
 * Mastery → distractors:
 *   mastery < 0.25 → 2
 *   mastery < 0.50 → 3
 *   mastery < 0.75 → 4
 *   mastery >= 0.75 → 5 (capped at 6)
 */
export function distractorCount(mastery: number): number {
  let n: number;
  if (mastery < 0.25) n = 2;
  else if (mastery < 0.50) n = 3;
  else if (mastery < 0.75) n = 4;
  else n = 5;
  return Math.min(n, 6);
}

/**
 * Determine number of "hint" characters to pre-fill.
 * Only applies to longer sequences (>= 5 chars). Higher mastery → fewer hints (min 0).
 *
 * Mastery → hint ratio (of answer length):
 *   mastery < 0.10 → 0.60  (60% of chars pre-filled — heavy hints)
 *   mastery < 0.25 → 0.50
 *   mastery < 0.50 → 0.40
 *   mastery < 0.75 → 0.25
 *   mastery >= 0.75 → 0.10
 */
export function hintCount(answerLength: number, mastery: number): number {
  if (answerLength < 5) return 0; // no hints for short answers
  let ratio: number;
  if (mastery < 0.10) ratio = 0.60;
  else if (mastery < 0.25) ratio = 0.50;
  else if (mastery < 0.50) ratio = 0.40;
  else if (mastery < 0.75) ratio = 0.25;
  else ratio = 0.10;
  return Math.floor(answerLength * ratio);
}
