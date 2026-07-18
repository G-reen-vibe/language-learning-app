import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { prismaLessonToClient } from "@/lib/server-serialization";
import { wordKeyOf } from "@/lib/aspects";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/lessons/[id] — fetch a single lesson with all relations.
 *
 * Returns the same shape as /api/lessons but for one lesson. Used by the
 * client when it needs to refetch a single lesson after a mutation (e.g.
 * after a study session updates word states).
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const lesson = await db.lesson.findUnique({
    where: { id },
    include: {
      words: {
        orderBy: { orderIndex: "asc" },
        include: { sentences: { orderBy: { orderIndex: "asc" } } },
      },
      wordStates: true,
      sessions: { orderBy: { startedAt: "desc" } },
    },
  });
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  return NextResponse.json({ lesson: prismaLessonToClient(lesson) });
}

/**
 * PATCH /api/lessons/[id] — update lesson metadata.
 *
 * Supports: name, algorithm, maxNewWordsPerDay, minMasteryForNewWords.
 * Used by LessonView's settings panel and rename input.
 */
const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  algorithm: z.enum(["SM-2", "FSRS-5"]).optional(),
  maxNewWordsPerDay: z.number().int().min(1).max(100).optional(),
  minMasteryForNewWords: z.number().int().min(1).max(5).optional(),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const lesson = await db.lesson.update({
      where: { id },
      data: parsed.data,
      include: {
        words: {
          orderBy: { orderIndex: "asc" },
          include: { sentences: { orderBy: { orderIndex: "asc" } } },
        },
        wordStates: true,
        sessions: { orderBy: { startedAt: "desc" } },
      },
    });
    return NextResponse.json({ lesson: prismaLessonToClient(lesson) });
  } catch {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
}

/**
 * DELETE /api/lessons/[id] — delete a lesson and all its relations.
 *
 * Cascade handles words, sentences, word states, and sessions automatically.
 */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  try {
    await db.lesson.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
}

/**
 * POST /api/lessons/[id] with body { action: "reset-progress" } — reset all
 * word states for this lesson to fresh defaults, delete all sessions.
 *
 * Mirrors `resetLessonProgress` from user-data-context.tsx.
 */
const PostSchema = z.object({
  action: z.literal("reset-progress"),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.action === "reset-progress") {
    // Verify the lesson exists
    const lesson = await db.lesson.findUnique({ where: { id }, select: { id: true } });
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // Delete all sessions and reset all word states to fresh defaults.
    // Uses a transaction because both deletes should be atomic.
    await db.$transaction([
      db.sessionRecord.deleteMany({ where: { lessonId: id } }),
      // Reset word states: keep the row (preserves the wordKey ↔ WordEntry
      // linkage) but zero out all scheduling fields. Matches freshWordState()
      // defaults: ease=2.5, interval=0, repetitions=0, stability=0,
      // difficulty=5, mastery=0, seen=false, totalReviews=0, totalCorrect=0.
      db.wordState.updateMany({
        where: { lessonId: id },
        data: {
          ease: 2.5,
          interval: 0,
          repetitions: 0,
          lastReviewed: null,
          stability: 0,
          difficulty: 5,
          mastery: 0,
          seen: false,
          introducedAt: null,
          totalReviews: 0,
          totalCorrect: 0,
        },
      }),
      // Reset the daily new-word counter and lastStudyDate
      db.lesson.update({
        where: { id },
        data: {
          newWordsIntroducedToday: 0,
          lastStudyDate: null,
        },
      }),
    ]);

    // Refetch and return the reset lesson
    const reset = await db.lesson.findUnique({
      where: { id },
      include: {
        words: {
          orderBy: { orderIndex: "asc" },
          include: { sentences: { orderBy: { orderIndex: "asc" } } },
        },
        wordStates: true,
        sessions: { orderBy: { startedAt: "desc" } },
      },
    });
    return NextResponse.json({ lesson: prismaLessonToClient(reset!) });
  }
}

// Re-export wordKeyOf to keep the import-graph explicit (not strictly needed).
export { wordKeyOf };
