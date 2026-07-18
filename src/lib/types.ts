// Core data types for the language learning app

/** A single word entry in a lesson, as provided by the user. */
export interface WordEntry {
  word: string;
  definition?: string;
  synonym?: string; // prefixed with "=" in source, stored here WITHOUT the "=" prefix
  translation?: string;
  explanation?: string;
  alt1?: string;
  alt2?: string;
  alt3?: string;
  sentences?: SentenceEntry[];
}

export interface SentenceEntry {
  exert: string; // e.g. "El [the] gato [cat] duerme [sleeps]."
  translation: string; // e.g. "The cat sleeps."
}

/** Aspect types — every "facet" of a word we can quiz on. */
export type AspectType =
  | "word"
  | "definition"
  | "synonym"
  | "translation"
  | "explanation"
  | "alt1"
  | "alt2"
  | "alt3";

export interface Aspect {
  type: AspectType;
  value: string;
}

/** Per-word learning state. */
export interface WordState {
  wordKey: string; // stable id: word.toLowerCase()
  // SM-2 fields
  ease: number; // ease factor, starts at 2.5
  interval: number; // days
  repetitions: number; // consecutive correct
  lastReviewed: number | null; // epoch ms
  nextReview: number; // epoch ms when next due
  // FSRS-5 fields
  stability: number; // days
  difficulty: number; // 1..10
  // Common
  mastery: number; // 0..5 (0 = never seen)
  seen: boolean;
  introducedAt: number | null;
  totalReviews: number;
  totalCorrect: number;
}

export type AlgorithmType = "SM-2" | "FSRS-5";

export interface LessonSettings {
  algorithm: AlgorithmType;
  maxNewWordsPerDay: number;
  minMasteryForNewWords: number; // existing words must reach this mastery before new words are introduced
}

export interface SessionRecord {
  id: string;
  lessonId: string;
  mode: StudyMode;
  startedAt: number;
  endedAt: number;
  questionsServed: number;
  correctCount: number;
  wrongCount: number;
  livesUsed?: number;
  durationSec: number;
  wordsStudied: string[]; // wordKeys
}

export type StudyMode = "daily" | "lesson" | "rush";

export interface Lesson {
  id: string;
  name: string;
  createdAt: number;
  words: WordEntry[];
  settings: LessonSettings;
  wordStates: Record<string, WordState>;
  sessions: SessionRecord[];
  newWordsIntroducedToday: number;
  lastStudyDate: string | null; // YYYY-MM-DD
}

export interface GlobalStats {
  totalSessions: number;
  totalQuestions: number;
  totalCorrect: number;
  currentStreak: number;
  lastStudyDate: string | null;
}

/** Top-level user data — what gets exported/imported. */
export interface UserData {
  version: number;
  lessons: Lesson[];
  stats: GlobalStats;
}

// ---------- Format / Question runtime types ----------

export type FormatType =
  | "introduction"
  | "pickAnswer"
  | "spotTheLie"
  | "matchPairs"
  | "wordScramble"
  | "fillGap"
  | "sentenceComprehension"
  | "sentenceTranslation"
  | "shellGame"
  | "cardGame"
  | "marbleGame";

export const FORMAT_DIFFICULTY: Record<FormatType, number> = {
  introduction: 0,
  pickAnswer: 1,
  spotTheLie: 1,
  matchPairs: 2,
  wordScramble: 2,
  fillGap: 3,
  sentenceComprehension: 3,
  sentenceTranslation: 3,
  shellGame: 4,
  cardGame: 4,
  marbleGame: 4,
};

export const FORMAT_NAMES: Record<FormatType, string> = {
  introduction: "Introduction",
  pickAnswer: "Pick the Answer",
  spotTheLie: "Spot the Lie",
  matchPairs: "Match Pairs",
  wordScramble: "Word Scramble",
  fillGap: "Fill the Gap",
  sentenceComprehension: "Sentence Comprehension",
  sentenceTranslation: "Sentence Translation",
  shellGame: "Shell Game",
  cardGame: "Card Game",
  marbleGame: "Marble Game",
};

export interface QuestionResult {
  wordKey: string;
  correct: boolean;
  quality: number; // 0..5 (SM-2 quality scale; FSRS-5 maps internally)
  /** If true, this result is from an Introduction card — just mark as seen, don't run the algorithm. */
  isIntroduction?: boolean;
}
