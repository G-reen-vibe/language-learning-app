import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { wordKeyOf } from "@/lib/aspects";

/**
 * POST /api/data/import?mode=merge|replace — import user data from a JSON blob.
 *
 * Accepts the same shape as /api/data/export returns:
 *   { version: 1, lessons: Lesson[], stats: GlobalStats }
 *
 * Modes:
 *   - merge (default): keep existing lessons, add imported ones. Skips
 *     lessons whose name+createdAt match an existing lesson (id can't be
 *     reused since it's a cuid generated on insert).
 *   - replace: wipe all existing data first, then import.
 *
 * Uses a transaction for atomicity (admin operation, no concurrent writers).
 *
 * Mirrors the Flashcards /api/data/import route's semantics.
 */

const SentenceSchema = z.object({
  exert: z.string(),
  translation: z.string(),
});

const WordEntrySchema = z.object({
  word: z.string().min(1),
  definition: z.string().optional(),
  synonym: z.string().optional(),
  translation: z.string().optional(),
  explanation: z.string().optional(),
  alt1: z.string().optional(),
  alt2: z.string().optional(),
  alt3: z.string().optional(),
  sentences: z.array(SentenceSchema).optional(),
});

const WordStateSchema = z.object({
  wordKey: z.string(),
  ease: z.number().default(2.5),
  interval: z.number().default(0),
  repetitions: z.number().default(0),
  lastReviewed: z.number().nullable().optional(),
  nextReview: z.number().optional(),
  stability: z.number().default(0),
  difficulty: z.number().default(5),
  // Mastery is now continuous [0,1]. Old imports with integer 0..5 values
  // would still validate (they're numbers), but the values are stale — the
  // first review will recompute via the Flashcards formula.
  mastery: z.number().min(0).max(1).default(0),
  seen: z.boolean().default(false),
  introducedAt: z.number().nullable().optional(),
  totalReviews: z.number().default(0),
  totalCorrect: z.number().default(0),
});

const SessionRecordSchema = z.object({
  id: z.string().optional(),
  mode: z.enum(["daily", "lesson", "rush"]),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  questionsServed: z.number().default(0),
  correctCount: z.number().default(0),
  wrongCount: z.number().default(0),
  livesUsed: z.number().optional(),
  durationSec: z.number().default(0),
  wordsStudied: z.array(z.string()).default([]),
});

const LessonSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  createdAt: z.number().optional(),
  words: z.array(WordEntrySchema),
  settings: z.object({
    algorithm: z.enum(["SM-2", "FSRS-5"]).default("FSRS-5"),
    maxNewWordsPerDay: z.number().int().min(1).max(100).default(10),
    // Mastery is now continuous [0,1]. Default 0.10 = L1 boundary.
    minMasteryForNewWords: z.number().min(0).max(1).default(0.10),
  }).default({ algorithm: "FSRS-5", maxNewWordsPerDay: 10, minMasteryForNewWords: 0.10 }),
  wordStates: z.record(z.string(), WordStateSchema).default({}),
  sessions: z.array(SessionRecordSchema).default([]),
  newWordsIntroducedToday: z.number().default(0),
  lastStudyDate: z.string().nullable().optional(),
});

const UserDataSchema = z.object({
  version: z.number().optional(),
  lessons: z.array(LessonSchema),
  stats: z.object({
    totalSessions: z.number().default(0),
    totalQuestions: z.number().default(0),
    totalCorrect: z.number().default(0),
    currentStreak: z.number().default(0),
    lastStudyDate: z.string().nullable().optional(),
  }).optional(),
});

type ImportMode = "merge" | "replace";

export async function POST(req: NextRequest) {
  const mode = (req.nextUrl.searchParams.get("mode") ?? "merge") as ImportMode;
  if (mode !== "merge" && mode !== "replace") {
    return NextResponse.json(
      { error: "mode must be 'merge' or 'replace'" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = UserDataSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  try {
    const result = await db.$transaction(async (tx) => {
      // Replace mode: wipe everything first. Delete in dependency order:
      // sessions → wordStates → sentences → wordEntries → lessons → globalStats.
      if (mode === "replace") {
        await tx.sessionRecord.deleteMany({});
        await tx.wordState.deleteMany({});
        await tx.sentenceEntry.deleteMany({});
        await tx.wordEntry.deleteMany({});
        await tx.lesson.deleteMany({});
        await tx.globalStats.deleteMany({});
      }

      let importedLessons = 0;
      let importedWords = 0;
      let importedWordStates = 0;
      let importedSessions = 0;

      for (const lesson of data.lessons) {
        // In merge mode, skip lessons that match an existing name+createdAt
        // (since we can't reuse the imported id — Prisma generates a new cuid).
        if (mode === "merge") {
          const existing = await tx.lesson.findFirst({
            where: {
              name: lesson.name,
              createdAt: lesson.createdAt ? new Date(lesson.createdAt) : undefined,
            },
            select: { id: true },
          });
          if (existing) continue;
        }

        // Create the lesson
        const createdLesson = await tx.lesson.create({
          data: {
            name: lesson.name,
            algorithm: lesson.settings.algorithm,
            maxNewWordsPerDay: lesson.settings.maxNewWordsPerDay,
            minMasteryForNewWords: lesson.settings.minMasteryForNewWords,
            newWordsIntroducedToday: lesson.newWordsIntroducedToday,
            lastStudyDate: lesson.lastStudyDate ?? null,
            createdAt: lesson.createdAt ? new Date(lesson.createdAt) : new Date(),
          },
        });
        importedLessons++;

        // Create word entries (with nested sentences)
        for (let i = 0; i < lesson.words.length; i++) {
          const w = lesson.words[i];
          await tx.wordEntry.create({
            data: {
              lessonId: createdLesson.id,
              orderIndex: i,
              word: w.word.trim(),
              definition: w.definition?.trim() || null,
              synonym: w.synonym ? w.synonym.replace(/^=/, "").trim() || null : null,
              translation: w.translation?.trim() || null,
              explanation: w.explanation?.trim() || null,
              alt1: w.alt1?.trim() || null,
              alt2: w.alt2?.trim() || null,
              alt3: w.alt3?.trim() || null,
              sentences: {
                create: (w.sentences ?? []).map((s, si) => ({
                  orderIndex: si,
                  exert: s.exert,
                  translation: s.translation,
                })),
              },
            },
          });
          importedWords++;
        }

        // Create word states
        for (const [, state] of Object.entries(lesson.wordStates)) {
          await tx.wordState.create({
            data: {
              lessonId: createdLesson.id,
              wordKey: state.wordKey,
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
            },
          });
          importedWordStates++;
        }

        // Create session records
        for (const session of lesson.sessions) {
          await tx.sessionRecord.create({
            data: {
              lessonId: createdLesson.id,
              mode: session.mode,
              startedAt: new Date(session.startedAt),
              endedAt: session.endedAt ? new Date(session.endedAt) : null,
              questionsServed: session.questionsServed,
              correctCount: session.correctCount,
              wrongCount: session.wrongCount,
              livesUsed: session.livesUsed ?? null,
              durationSec: session.durationSec,
              wordsStudied: JSON.stringify(session.wordsStudied),
            },
          });
          importedSessions++;
        }
      }

      // Update global stats (only in replace mode, or if stats are provided
      // and current stats are zero in merge mode).
      if (data.stats) {
        const currentStats = await tx.globalStats.findUnique({ where: { id: "global" } });
        const shouldUpdate = mode === "replace" || !currentStats;
        if (shouldUpdate) {
          await tx.globalStats.upsert({
            where: { id: "global" },
            update: {
              totalSessions: data.stats.totalSessions,
              totalQuestions: data.stats.totalQuestions,
              totalCorrect: data.stats.totalCorrect,
              currentStreak: data.stats.currentStreak,
              lastStudyDate: data.stats.lastStudyDate ?? null,
            },
            create: {
              id: "global",
              totalSessions: data.stats.totalSessions,
              totalQuestions: data.stats.totalQuestions,
              totalCorrect: data.stats.totalCorrect,
              currentStreak: data.stats.currentStreak,
              lastStudyDate: data.stats.lastStudyDate ?? null,
            },
          });
        }
      }

      return { importedLessons, importedWords, importedWordStates, importedSessions };
    });

    return NextResponse.json({ imported: result });
  } catch (e) {
    console.error("Import failed:", e);
    return NextResponse.json(
      { error: "Import failed: " + (e instanceof Error ? e.message : "unknown error") },
      { status: 500 }
    );
  }
}

// Re-export wordKeyOf for explicit import graph (not strictly needed here).
export { wordKeyOf };
