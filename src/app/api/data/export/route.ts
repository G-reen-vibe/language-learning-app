import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildUserDataExport } from "@/lib/server-serialization";

/**
 * GET /api/data/export — export all user data as a JSON blob.
 *
 * Returns the same shape as the original localStorage UserData:
 *   { version: 1, lessons: Lesson[], stats: GlobalStats }
 *
 * This format is backwards-compatible with the original import/export
 * feature in HomeView — users can import a backup from the old localStorage
 * version of the app.
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

  const statsRow = await db.globalStats.findUnique({ where: { id: "global" } });
  const stats = statsRow ?? {
    totalSessions: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    currentStreak: 0,
    lastStudyDate: null,
  };

  const userData = buildUserDataExport(lessons, stats);

  const dateStr = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(userData, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="language-learning-backup-${dateStr}.json"`,
    },
  });
}
