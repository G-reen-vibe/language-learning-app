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
 * N starts at 2 and increases with mastery. The exact scaling is per-format.
 *
 * Mastery → N scaling:
 *  mastery 1 → N=2
 *  mastery 2 → N=3
 *  mastery 3 → N=4
 *  mastery 4 → N=5
 *  mastery 5 → N=6
 *  (capped by `cap`)
 */
export function nForMastery(mastery: number, cap: number): number {
  const n = 1 + mastery; // 1+1=2, 1+2=3, ...
  return Math.min(Math.max(2, n), cap);
}

/**
 * Determine number of "irrelevant" pieces / distractors for scramble/fill modes.
 * Scales with mastery: more mastery → more distractors.
 */
export function distractorCount(mastery: number): number {
  return Math.min(2 + Math.floor(mastery / 2), 6);
}

/**
 * Determine number of "hint" characters to pre-fill.
 * Only applies to longer sequences (>= 5 chars). Higher mastery → fewer hints (min 0).
 */
export function hintCount(answerLength: number, mastery: number): number {
  if (answerLength < 5) return 0; // no hints for short answers
  const ratio = Math.max(0, 0.6 - mastery * 0.1);
  return Math.floor(answerLength * ratio);
}
