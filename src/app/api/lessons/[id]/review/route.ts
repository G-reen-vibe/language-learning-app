import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/server-utils";
import {
  prismaWordStateToClient,
  applyReview,
  introduceWordServer,
  clientWordStateToPrismaUpdate,
} from "@/lib/server-schedulers";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/lessons/[id]/review — submit a single review for one word.
 *
 * Body: { wordKey, quality, isIntroduction? }
 *
 * Flow:
 *   1. Fetch the lesson (for algorithm) and the WordState row.
 *   2. If isIntroduction: call introduceWordServer (just marks seen=true,
 *      mastery=1, introducedAt=now, lastReviewed=now; does NOT run the
 *      scheduling algorithm).
 *   3. Else: dispatch to sm2Update or fsrs5Update based on lesson.algorithm.
 *   4. Persist the new WordState via a sequential write with per-statement
 *      retry (NOT an interactive transaction — Prisma's interactive
 *      transactions for SQLite have a 5s hardcoded socket timeout that
 *      causes P1001 errors under concurrent multi-card-game review load).
 *
 * Returns the updated WordState (client-facing shape) so the client can
 * optimistically update its cache.
 *
 * Concurrency hardening (ported from Flashcards):
 *   - Prisma transactionOptions: { timeout: 15s, maxWait: 10s } in db.ts
 *   - busy_timeout in the SQLite connection string
 *   - Sequential writes (not interactive transactions) on the hot path
 *   - withRetry() wrapper with exponential backoff (150ms, 300ms, 600ms, 1.2s)
 *     for transient errors (P2028, P2034, P1001, P1002)
 *   - Client-side retry on 5xx/network errors (in the StudyView refactor)
 */
const ReviewSchema = z.object({
  wordKey: z.string().min(1),
  quality: z.number().int().min(0).max(5),
  isIntroduction: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { wordKey, quality, isIntroduction } = parsed.data;

  // Fetch the lesson (just need the algorithm) and the WordState row.
  // We use a transaction here ONLY for the read — this is safe because
  // reads don't contend for the writer lock.
  const lesson = await db.lesson.findUnique({
    where: { id },
    select: { id: true, algorithm: true, newWordsIntroducedToday: true, lastStudyDate: true },
  });
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const stateRow = await db.wordState.findUnique({
    where: { lessonId_wordKey: { lessonId: id, wordKey } },
  });
  if (!stateRow) {
    return NextResponse.json(
      { error: "WordState not found for wordKey: " + wordKey },
      { status: 404 }
    );
  }

  // Convert to client shape, apply the scheduler, convert back to Prisma update.
  const currentState = prismaWordStateToClient(stateRow);
  const wasUnseen = !currentState.seen && currentState.mastery === 0;

  const newState = isIntroduction
    ? introduceWordServer(currentState)
    : applyReview(currentState, quality, lesson.algorithm);

  const updateData = clientWordStateToPrismaUpdate(newState);

  // Sequential write with retry — the critical write (scheduling state).
  // If this fails after all retries, the client will retry on 5xx; if it
  // still fails, the user sees an error toast but the card scheduling is
  // simply not updated (acceptable for a learning app).
  await withRetry(() =>
    db.wordState.update({
      where: { id: stateRow.id },
      data: updateData,
    })
  );

  // If this review introduced a previously-unseen word, increment the daily
  // new-word counter on the lesson. Best-effort: if the lesson row was
  // concurrently modified (e.g. another tab reset progress), we still keep
  // the WordState update above — that's the critical data.
  let newWordsIntroducedToday = lesson.newWordsIntroducedToday;
  if (wasUnseen && newState.seen) {
    try {
      const updated = await withRetry(() =>
        db.lesson.update({
          where: { id },
          data: { newWordsIntroducedToday: { increment: 1 } },
          select: { newWordsIntroducedToday: true },
        })
      );
      newWordsIntroducedToday = updated.newWordsIntroducedToday;
    } catch (e) {
      // Best-effort — don't fail the review over a counter increment.
      console.warn(`Failed to increment newWordsIntroducedToday for lesson ${id}:`, e);
    }
  }

  return NextResponse.json({
    wordState: newState,
    newWordsIntroducedToday,
  });
}

/**
 * GET /api/lessons/[id]/review — not implemented.
 *
 * The client computes the practice queue client-side using the
 * mastery-tier gating logic in session.ts (eligibleWordsForFormat /
 * pickNextFormat). This matches the original app's behavior where
 * "due today" is mastery-based, not date-based.
 *
 * (The Flashcards app has a sophisticated server-side queue builder, but
 * that's because it uses date-based SRS scheduling. This app uses
 * mastery-tier gating, so the queue is naturally computed client-side
 * from the word states that the client already has in memory.)
 */
