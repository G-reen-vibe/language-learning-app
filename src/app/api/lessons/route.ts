import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { prismaLessonToClient, lessonToListItem } from "@/lib/server-serialization";
import { wordKeyOf } from "@/lib/aspects";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/lessons — list all lessons with computed stats (for HomeView).
 *
 * Returns the full Lesson objects (with words, wordStates, sessions) because
 * the client context loads everything into memory at once. This matches the
 * original localStorage behavior where loadUserData() returns the whole blob.
 *
 * The list endpoint and the single-lesson endpoint return the same shape;
 * the client's getLesson() just finds the lesson in the cached array.
 */
export async function GET() {
  const lessons = await db.lesson.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      words: {
        orderBy: { orderIndex: "asc" },
        include: { sentences: { orderBy: { orderIndex: "asc" } } },
      },
      wordStates: true,
      sessions: { orderBy: { startedAt: "desc" } },
    },
  });

  const clientLessons = lessons.map(prismaLessonToClient);
  return NextResponse.json({ lessons: clientLessons });
}

/**
 * POST /api/lessons — create a new lesson with words parsed from a JSON string.
 *
 * Mirrors `createLessonFromJson` from user-data-context.tsx:
 *   1. JSON.parse the word list
 *   2. validateLessonJson — array, each item has non-empty string "word"
 *   3. normalizeWordEntries — coerce types, strip leading "=" from synonym
 *   4. create the Lesson with fresh WordState per unique wordKey
 *
 * The words and their WordStates are created in a single nested Prisma create
 * so the whole lesson is atomic.
 */
const CreateLessonSchema = z.object({
  name: z.string().min(1).max(120),
  words: z.array(
    z.object({
      word: z.string().min(1),
      definition: z.string().optional(),
      synonym: z.string().optional(),
      translation: z.string().optional(),
      explanation: z.string().optional(),
      alt1: z.string().optional(),
      alt2: z.string().optional(),
      alt3: z.string().optional(),
      sentences: z
        .array(
          z.object({
            exert: z.string(),
            translation: z.string(),
          })
        )
        .optional(),
    })
  ),
  // Optional settings override; defaults to FSRS-5 / 10 / 2
  algorithm: z.enum(["SM-2", "FSRS-5"]).optional(),
  maxNewWordsPerDay: z.number().int().min(1).max(100).optional(),
  minMasteryForNewWords: z.number().int().min(1).max(5).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateLessonSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    name,
    words,
    algorithm = "FSRS-5",
    maxNewWordsPerDay = 10,
    minMasteryForNewWords = 2,
  } = parsed.data;

  // Normalize word entries (strip leading "=" from synonym, trim strings)
  const normalized = words.map((w) => ({
    word: w.word.trim(),
    definition: w.definition?.trim() || null,
    synonym: w.synonym ? w.synonym.replace(/^=/, "").trim() || null : null,
    translation: w.translation?.trim() || null,
    explanation: w.explanation?.trim() || null,
    alt1: w.alt1?.trim() || null,
    alt2: w.alt2?.trim() || null,
    alt3: w.alt3?.trim() || null,
    sentences: w.sentences?.map((s) => ({
      exert: s.exert.trim(),
      translation: s.translation.trim(),
    })) ?? [],
  }));

  // Build the WordState rows — one per UNIQUE wordKey (lowercased word).
  // Duplicate words within a lesson collapse to the same WordState, matching
  // the original createLesson behavior.
  const seenWordKeys = new Set<string>();
  const wordStateCreates: Prisma.WordStateCreateWithoutLessonInput[] = [];
  for (const w of normalized) {
    const k = wordKeyOf(w.word);
    if (!k) continue;
    if (seenWordKeys.has(k)) continue;
    seenWordKeys.add(k);
    // freshWordState defaults: ease=2.5, interval=0, repetitions=0,
    // stability=0, difficulty=5, mastery=0, seen=false, totalReviews=0,
    // totalCorrect=0 — these are all Prisma schema defaults, so we just
    // need to set the wordKey.
    wordStateCreates.push({ wordKey: k });
  }

  // Build the WordEntry creates with nested SentenceEntry creates
  const wordEntryCreates: Prisma.WordEntryCreateWithoutLessonInput[] = normalized.map(
    (w, i) => ({
      orderIndex: i,
      word: w.word,
      definition: w.definition,
      synonym: w.synonym,
      translation: w.translation,
      explanation: w.explanation,
      alt1: w.alt1,
      alt2: w.alt2,
      alt3: w.alt3,
      sentences: {
        create: w.sentences.map((s, si) => ({
          orderIndex: si,
          exert: s.exert,
          translation: s.translation,
        })),
      },
    })
  );

  const lesson = await db.lesson.create({
    data: {
      name,
      algorithm,
      maxNewWordsPerDay,
      minMasteryForNewWords,
      words: { create: wordEntryCreates },
      wordStates: { create: wordStateCreates },
    },
    include: {
      words: {
        orderBy: { orderIndex: "asc" },
        include: { sentences: { orderBy: { orderIndex: "asc" } } },
      },
      wordStates: true,
      sessions: { orderBy: { startedAt: "desc" } },
    },
  });

  const clientLesson = prismaLessonToClient(lesson);
  return NextResponse.json({ lesson: clientLesson }, { status: 201 });
}

// Unused export to satisfy linter — lessonToListItem is used by other routes
export { lessonToListItem };
