import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prismaGlobalStatsToClient } from "@/lib/server-serialization";

/**
 * GET /api/stats — fetch the GlobalStats singleton.
 *
 * Returns zeros if no session has ever been recorded (the row may not exist).
 */
export async function GET() {
  const row = await db.globalStats.findUnique({ where: { id: "global" } });
  const stats = row
    ? prismaGlobalStatsToClient(row)
    : {
        totalSessions: 0,
        totalQuestions: 0,
        totalCorrect: 0,
        currentStreak: 0,
        lastStudyDate: null,
      };
  return NextResponse.json({ stats });
}
