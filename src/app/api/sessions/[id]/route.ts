import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/server-utils";
import { computeUpdatedGlobalStats } from "@/lib/server-serialization";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PATCH /api/sessions/[id] — end a session.
 *
 * Body: {
 *   endedAt?: Date | ISO string,
 *   questionsServed?: number,
 *   correctCount?: number,
 *   wrongCount?: number,
 *   livesUsed?: number,
 *   durationSec?: number,
 *   wordsStudied?: string[],
 *   lessonId?: string  // needed to update lesson's lastStudyDate
 * }
 *
 * This is the most critical write in the app — it finalizes a study session:
 *   1. Updates the SessionRecord with final stats.
 *   2. Updates the lesson's lastStudyDate (for the daily new-word cap reset).
 *   3. Updates the GlobalStats singleton (totalSessions, totalQuestions,
 *      totalCorrect, currentStreak, lastStudyDate).
 *
 * All three updates are wrapped in a transaction so the stats stay consistent.
 *
 * Streak logic (mirrors recordSessionStats from user-data-context.tsx):
 *   - If lastStudyDate === today: streak unchanged (same-day session)
 *   - If lastStudyDate === yesterday: streak + 1
 *   - Else: streak = 1
 *
 * Note: we use z.coerce.date() for endedAt because JSON.stringify(new Date())
 * produces an ISO string, not a Date object. Zod's z.date() won't accept ISO
 * strings; z.coerce.date() will. (Lesson from the Flashcards app.)
 */
const PatchSchema = z.object({
  endedAt: z.coerce.date().optional(),
  questionsServed: z.number().int().min(0).optional(),
  correctCount: z.number().int().min(0).optional(),
  wrongCount: z.number().int().min(0).optional(),
  livesUsed: z.number().int().min(0).optional(),
  durationSec: z.number().int().min(0).optional(),
  wordsStudied: z.array(z.string()).optional(),
  lessonId: z.string().optional(),
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

  // Fetch the existing session to get lessonId + stats for GlobalStats update
  const existing = await db.sessionRecord.findUnique({
    where: { id },
    select: {
      lessonId: true,
      mode: true,
      questionsServed: true,
      correctCount: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const lessonId = parsed.data.lessonId ?? existing.lessonId;
  const finalQuestions = parsed.data.questionsServed ?? existing.questionsServed;
  const finalCorrect = parsed.data.correctCount ?? existing.correctCount;

  // Build the session update payload
  const sessionUpdate: {
    endedAt?: Date;
    questionsServed?: number;
    correctCount?: number;
    wrongCount?: number;
    livesUsed?: number | null;
    durationSec?: number;
    wordsStudied?: string;
  } = {};
  if (parsed.data.endedAt) sessionUpdate.endedAt = parsed.data.endedAt;
  if (parsed.data.questionsServed !== undefined)
    sessionUpdate.questionsServed = parsed.data.questionsServed;
  if (parsed.data.correctCount !== undefined)
    sessionUpdate.correctCount = parsed.data.correctCount;
  if (parsed.data.wrongCount !== undefined)
    sessionUpdate.wrongCount = parsed.data.wrongCount;
  // livesUsed is nullable — only set if explicitly provided
  if (parsed.data.livesUsed !== undefined)
    sessionUpdate.livesUsed = parsed.data.livesUsed;
  if (parsed.data.durationSec !== undefined)
    sessionUpdate.durationSec = parsed.data.durationSec;
  if (parsed.data.wordsStudied !== undefined)
    sessionUpdate.wordsStudied = JSON.stringify(parsed.data.wordsStudied);

  // Use a transaction for the three writes (session update + lesson lastStudyDate
  // + GlobalStats update). This is an admin-style operation (one per session end),
  // so the interactive transaction's 15s timeout is plenty.
  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Update the session record
      const session = await tx.sessionRecord.update({
        where: { id },
        data: sessionUpdate,
      });

      // 2. Update the lesson's lastStudyDate to today.
      // This drives the daily new-word cap reset (when the user starts a new
      // session on a different day, newWordsIntroducedToday resets to 0).
      const today = new Date().toISOString().slice(0, 10);
      await tx.lesson.update({
        where: { id: lessonId },
        data: { lastStudyDate: today },
      });

      // 3. Update GlobalStats (singleton row with id="global").
      // Upsert in case the row doesn't exist yet (first-ever session).
      const currentStats = await tx.globalStats.findUnique({
        where: { id: "global" },
      });
      const current = currentStats ?? {
        totalSessions: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        currentStreak: 0,
        lastStudyDate: null,
      };
      const newStats = computeUpdatedGlobalStats(current, {
        // SessionRecord shape (client) — only the fields used by the streak/stats computation
        id,
        lessonId,
        mode: existing.mode as "daily" | "lesson" | "rush",
        startedAt: session.startedAt.getTime(),
        endedAt: session.endedAt?.getTime() ?? 0,
        questionsServed: finalQuestions,
        correctCount: finalCorrect,
        wrongCount: parsed.data.wrongCount ?? 0,
        livesUsed: parsed.data.livesUsed,
        durationSec: parsed.data.durationSec ?? 0,
        wordsStudied: parsed.data.wordsStudied ?? [],
      });

      await tx.globalStats.upsert({
        where: { id: "global" },
        update: {
          totalSessions: newStats.totalSessions,
          totalQuestions: newStats.totalQuestions,
          totalCorrect: newStats.totalCorrect,
          currentStreak: newStats.currentStreak,
          lastStudyDate: newStats.lastStudyDate,
        },
        create: {
          id: "global",
          totalSessions: newStats.totalSessions,
          totalQuestions: newStats.totalQuestions,
          totalCorrect: newStats.totalCorrect,
          currentStreak: newStats.currentStreak,
          lastStudyDate: newStats.lastStudyDate,
        },
      });

      return { session, newStats };
    });

    return NextResponse.json({
      session: {
        id: result.session.id,
        lessonId: result.session.lessonId,
        mode: result.session.mode,
        startedAt: result.session.startedAt.getTime(),
        endedAt: result.session.endedAt?.getTime() ?? null,
        questionsServed: result.session.questionsServed,
        correctCount: result.session.correctCount,
        wrongCount: result.session.wrongCount,
        livesUsed: result.session.livesUsed ?? undefined,
        durationSec: result.session.durationSec,
        wordsStudied: (() => {
          try {
            const p = JSON.parse(result.session.wordsStudied);
            return Array.isArray(p) ? p : [];
          } catch {
            return [];
          }
        })(),
      },
      stats: result.newStats,
    });
  } catch (e) {
    console.error("Failed to end session:", e);
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sessions/[id] — fetch a single session.
 *
 * Used by the results screen to display session stats. Reuses the lesson
 * detail endpoint's data (the client finds the session in the lesson's
 * sessions array), but this dedicated endpoint is cleaner for deep-linking.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const session = await db.sessionRecord.findUnique({ where: { id } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({
    session: {
      id: session.id,
      lessonId: session.lessonId,
      mode: session.mode,
      startedAt: session.startedAt.getTime(),
      endedAt: session.endedAt?.getTime() ?? null,
      questionsServed: session.questionsServed,
      correctCount: session.correctCount,
      wrongCount: session.wrongCount,
      livesUsed: session.livesUsed ?? undefined,
      durationSec: session.durationSec,
      wordsStudied: (() => {
        try {
          const p = JSON.parse(session.wordsStudied);
          return Array.isArray(p) ? p : [];
        } catch {
          return [];
        }
      })(),
    },
  });
}

// Re-export withRetry to keep the import graph explicit (not strictly needed).
export { withRetry };
