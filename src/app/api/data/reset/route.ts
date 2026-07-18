import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

/**
 * POST /api/data/reset — reset all scheduling progress.
 *
 * Body: { lessonId?: string }
 *   - With lessonId: resets all WordStates in that lesson to fresh defaults,
 *     deletes all sessions for that lesson, clears newWordsIntroducedToday
 *     and lastStudyDate.
 *   - Without lessonId: resets ALL WordStates across ALL lessons, deletes
 *     ALL sessions, clears GlobalStats.
 *
 * Word entries themselves (word, definition, etc.) are preserved — only
 * scheduling state is reset.
 *
 * Uses a transaction for atomicity (admin operation).
 *
 * Mirrors the Flashcards /api/data/reset route.
 */
const ResetSchema = z.object({
  lessonId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = ResetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { lessonId } = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      if (lessonId) {
        // Reset one lesson
        await tx.sessionRecord.deleteMany({ where: { lessonId } });
        await tx.wordState.updateMany({
          where: { lessonId },
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
        });
        await tx.lesson.update({
          where: { id: lessonId },
          data: {
            newWordsIntroducedToday: 0,
            lastStudyDate: null,
          },
        });
      } else {
        // Reset everything
        await tx.sessionRecord.deleteMany({});
        await tx.wordState.updateMany({
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
        });
        await tx.lesson.updateMany({
          data: {
            newWordsIntroducedToday: 0,
            lastStudyDate: null,
          },
        });
        await tx.globalStats.deleteMany({});
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Reset failed:", e);
    return NextResponse.json(
      { error: "Reset failed: " + (e instanceof Error ? e.message : "unknown error") },
      { status: 500 }
    );
  }
}
