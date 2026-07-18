import type { Lesson, WordEntry, WordState, SessionRecord, GlobalStats, UserData, SentenceEntry } from "./types";
import { wordKeyOf } from "./aspects";
import { prismaWordStateToClient } from "./server-schedulers";
import { todayStr } from "./storage";

/**
 * Serialization helpers: convert Prisma rows (with relations) to the
 * client-facing types defined in types.ts.
 *
 * The client code (HomeView, LessonView, StudyView, all game format components)
 * operates on the `Lesson` / `WordState` / `SessionRecord` types — these
 * serializers let us swap the storage layer (localStorage → Prisma) without
 * touching any of the client code.
 *
 * All DateTime fields are converted to epoch ms to match the client types.
 */

type PrismaWordEntryWithSentences = {
  id: string;
  orderIndex: number;
  word: string;
  definition: string | null;
  synonym: string | null;
  translation: string | null;
  explanation: string | null;
  alt1: string | null;
  alt2: string | null;
  alt3: string | null;
  sentences: {
    orderIndex: number;
    exert: string;
    translation: string;
  }[];
};

type PrismaWordStateRow = {
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
};

type PrismaSessionRow = {
  id: string;
  mode: string;
  startedAt: Date;
  endedAt: Date | null;
  questionsServed: number;
  correctCount: number;
  wrongCount: number;
  livesUsed: number | null;
  durationSec: number;
  wordsStudied: string;
};

type PrismaLessonWithRelations = {
  id: string;
  name: string;
  algorithm: string;
  maxNewWordsPerDay: number;
  minMasteryForNewWords: number;
  newWordsIntroducedToday: number;
  lastStudyDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  words: PrismaWordEntryWithSentences[];
  wordStates: PrismaWordStateRow[];
  sessions: PrismaSessionRow[];
};

export function prismaWordEntryToClient(row: PrismaWordEntryWithSentences): WordEntry {
  const sortedSentences = [...row.sentences].sort((a, b) => a.orderIndex - b.orderIndex);
  const sentences: SentenceEntry[] | undefined = sortedSentences.length > 0
    ? sortedSentences.map((s) => ({ exert: s.exert, translation: s.translation }))
    : undefined;
  return {
    word: row.word,
    definition: row.definition ?? undefined,
    synonym: row.synonym ?? undefined,
    translation: row.translation ?? undefined,
    explanation: row.explanation ?? undefined,
    alt1: row.alt1 ?? undefined,
    alt2: row.alt2 ?? undefined,
    alt3: row.alt3 ?? undefined,
    sentences,
  };
}

export function prismaWordStateToClientMap(rows: PrismaWordStateRow[]): Record<string, WordState> {
  const out: Record<string, WordState> = {};
  for (const row of rows) {
    out[row.wordKey] = prismaWordStateToClient(row);
  }
  return out;
}

export function prismaSessionToClient(row: PrismaSessionRow): SessionRecord {
  let wordsStudied: string[] = [];
  try {
    const parsed = JSON.parse(row.wordsStudied);
    if (Array.isArray(parsed)) wordsStudied = parsed.filter((x) => typeof x === "string");
  } catch {
    // malformed JSON — leave empty
  }
  return {
    id: row.id,
    lessonId: "", // caller fills this in
    mode: row.mode as SessionRecord["mode"],
    startedAt: row.startedAt.getTime(),
    endedAt: row.endedAt ? row.endedAt.getTime() : 0,
    questionsServed: row.questionsServed,
    correctCount: row.correctCount,
    wrongCount: row.wrongCount,
    livesUsed: row.livesUsed ?? undefined,
    durationSec: row.durationSec,
    wordsStudied,
  };
}

export function prismaLessonToClient(row: PrismaLessonWithRelations): Lesson {
  const sortedWords = [...row.words].sort((a, b) => a.orderIndex - b.orderIndex);
  const sortedSessions = [...row.sessions].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

  const words = sortedWords.map(prismaWordEntryToClient);
  const wordStates = prismaWordStateToClientMap(row.wordStates);
  const sessions = sortedSessions.map((s) => ({ ...prismaSessionToClient(s), lessonId: row.id }));

  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.getTime(),
    words,
    settings: {
      algorithm: row.algorithm as "SM-2" | "FSRS-5",
      maxNewWordsPerDay: row.maxNewWordsPerDay,
      minMasteryForNewWords: row.minMasteryForNewWords,
    },
    wordStates,
    sessions,
    newWordsIntroducedToday: row.newWordsIntroducedToday,
    lastStudyDate: row.lastStudyDate,
  };
}

/** Lightweight lesson shape for list views (no word states / sessions). */
export type LessonListItem = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  algorithm: string;
  maxNewWordsPerDay: number;
  minMasteryForNewWords: number;
  wordCount: number;
  seenCount: number;
  masteredCount: number;
  avgMastery: number;
  totalReviews: number;
  totalCorrect: number;
  newWordsIntroducedToday: number;
  lastStudyDate: string | null;
  lastSession: {
    mode: string;
    startedAt: number;
    questionsServed: number;
    correctCount: number;
    wrongCount: number;
  } | null;
};

export function lessonToListItem(
  lesson: {
    id: string;
    name: string;
    algorithm: string;
    maxNewWordsPerDay: number;
    minMasteryForNewWords: number;
    newWordsIntroducedToday: number;
    lastStudyDate: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { words?: number };
    words?: { wordStates?: PrismaWordStateRow[] }[];
  }
): LessonListItem {
  // Count from wordStates relation if present, else fall back to _count.words
  const wordStates: PrismaWordStateRow[] = [];
  if (lesson.words) {
    for (const w of lesson.words) {
      if (w.wordStates) wordStates.push(...w.wordStates);
    }
  }
  // Actually wordStates is a direct relation on Lesson, not nested under words.
  // The caller should pass lesson.wordStates explicitly. Handle both shapes:
  const directWordStates = (lesson as unknown as { wordStates?: PrismaWordStateRow[] }).wordStates ?? wordStates;

  const total = directWordStates.length;
  const seen = directWordStates.filter((s) => s.seen).length;
  // "Mastered" = mastery >= 0.90 (top of the continuous [0,1] scale).
  const mastered = directWordStates.filter((s) => s.mastery >= 0.90).length;
  // avgMastery is now in [0, 1] (continuous mastery; was 0..5 integer).
  const avgMastery = total === 0 ? 0 : directWordStates.reduce((s, x) => s + x.mastery, 0) / total;
  const totalReviews = directWordStates.reduce((s, x) => s + x.totalReviews, 0);
  const totalCorrect = directWordStates.reduce((s, x) => s + x.totalCorrect, 0);

  return {
    id: lesson.id,
    name: lesson.name,
    createdAt: lesson.createdAt.getTime(),
    updatedAt: lesson.updatedAt.getTime(),
    algorithm: lesson.algorithm,
    maxNewWordsPerDay: lesson.maxNewWordsPerDay,
    minMasteryForNewWords: lesson.minMasteryForNewWords,
    wordCount: lesson._count?.words ?? 0,
    seenCount: seen,
    masteredCount: mastered,
    avgMastery,
    totalReviews,
    totalCorrect,
    newWordsIntroducedToday: lesson.newWordsIntroducedToday,
    lastStudyDate: lesson.lastStudyDate,
    lastSession: null, // caller fills if needed
  };
}

/** Compute GlobalStats from a Prisma GlobalStats row. */
export function prismaGlobalStatsToClient(row: {
  totalSessions: number;
  totalQuestions: number;
  totalCorrect: number;
  currentStreak: number;
  lastStudyDate: string | null;
}): GlobalStats {
  return {
    totalSessions: row.totalSessions,
    totalQuestions: row.totalQuestions,
    totalCorrect: row.totalCorrect,
    currentStreak: row.currentStreak,
    lastStudyDate: row.lastStudyDate,
  };
}

/**
 * Update GlobalStats after a session ends. Mirrors `recordSessionStats` from
 * user-data-context.tsx but as a pure function that returns the new values.
 *
 * Streak logic:
 *  - If lastStudyDate === today: streak unchanged
 *  - If lastStudyDate === yesterday: streak + 1
 *  - Else: streak = 1
 */
export function computeUpdatedGlobalStats(
  current: GlobalStats,
  session: SessionRecord
): GlobalStats {
  const today = todayStr();
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  let newStreak = current.currentStreak;
  if (current.lastStudyDate !== today) {
    if (current.lastStudyDate === yesterday) {
      newStreak = current.currentStreak + 1;
    } else {
      newStreak = 1;
    }
  }

  return {
    totalSessions: current.totalSessions + 1,
    totalQuestions: current.totalQuestions + session.questionsServed,
    totalCorrect: current.totalCorrect + session.correctCount,
    currentStreak: newStreak,
    lastStudyDate: today,
  };
}

/**
 * Build the full UserData export shape from Prisma rows.
 * Used by /api/data/export.
 */
export function buildUserDataExport(
  lessons: PrismaLessonWithRelations[],
  stats: { totalSessions: number; totalQuestions: number; totalCorrect: number; currentStreak: number; lastStudyDate: string | null }
): UserData {
  return {
    version: 1,
    lessons: lessons.map(prismaLessonToClient),
    stats: prismaGlobalStatsToClient(stats),
  };
}

/**
 * Get the wordKey for a WordEntry (re-exported here so API routes can compute
 * it without importing from aspects.ts indirectly).
 */
export { wordKeyOf };
