import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/lessons/[id]/sessions — start a new study session.
 *
 * Creates a SessionRecord row with startedAt=now, endedAt=null.
 * Returns the session ID so the client can later PATCH /api/sessions/[id]
 * to end it (with final stats).
 *
 * Mirrors the Flashcards /api/sessions POST route.
 */
const StartSchema = z.object({
  mode: z.enum(["daily", "lesson", "rush"]),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = StartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Verify the lesson exists
  const lesson = await db.lesson.findUnique({ where: { id }, select: { id: true } });
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const session = await db.sessionRecord.create({
    data: {
      lessonId: id,
      mode: parsed.data.mode,
      startedAt: new Date(),
      // livesUsed left null; set on PATCH if rush mode
    },
  });

  return NextResponse.json(
    {
      session: {
        id: session.id,
        lessonId: session.lessonId,
        mode: session.mode,
        startedAt: session.startedAt.getTime(),
      },
    },
    { status: 201 }
  );
}
