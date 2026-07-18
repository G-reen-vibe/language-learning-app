"use client";

import React, { createContext, useContext, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserData,
  Lesson,
  WordState,
  SessionRecord,
  GlobalStats,
} from "./types";
import {
  normalizeWordEntries,
  validateLessonJson,
} from "./storage";
import { toast } from "sonner";

/**
 * API-backed user data context.
 *
 * Replaces the localStorage-backed version. Same public interface so
 * HomeView / LessonView / StudyView need minimal changes — only the
 * implementation switches from localStorage reads/writes to API calls
 * that go through the server-side SQLite database.
 *
 * Data flow:
 *   - data.lessons  ← useQuery(['lessons'])  → GET /api/lessons
 *   - data.stats    ← useQuery(['stats'])    → GET /api/stats
 *   - Mutations     → POST/PATCH/DELETE      → invalidate ['lessons'] / ['stats']
 *
 * Query keys are hierarchical so partial invalidations work cleanly:
 *   ['lessons']                  — list (full lesson objects)
 *   ['lesson', lessonId]         — single lesson (used after study session)
 *   ['stats']                    — GlobalStats singleton
 *
 * The 'data' field is a UserData-shaped object assembled from the two
 * queries, so existing consumers (HomeView's data.lessons, etc.) work
 * unchanged.
 */

// Hierarchical query keys (exported so other components can invalidate).
export const QUERY_KEYS = {
  lessons: ["lessons"] as const,
  lesson: (id: string) => ["lesson", id] as const,
  stats: ["stats"] as const,
};

interface UserDataContextValue {
  data: UserData;
  /** True until the initial query has loaded. */
  isLoading: boolean;
  setData: (d: UserData) => void;
  createLessonFromJson: (name: string, json: string) => { ok: boolean; error?: string; lesson?: Lesson };
  deleteLesson: (id: string) => void;
  resetLessonProgress: (id: string) => void;
  updateLessonSettings: (id: string, settings: Partial<Lesson["settings"]>) => void;
  updateLessonName: (id: string, name: string) => void;
  recordSessionStats: (session: SessionRecord) => void;
  replaceLesson: (lesson: Lesson) => void;
  importData: (json: string) => Promise<{ ok: boolean; error?: string }>;
  exportData: () => Promise<string>;
  getLesson: (id: string) => Lesson | undefined;
  /** Invalidate all queries (force refetch). */
  invalidateAll: () => void;
}

const Ctx = createContext<UserDataContextValue | null>(null);

const DEFAULT_STATS: GlobalStats = {
  totalSessions: 0,
  totalQuestions: 0,
  totalCorrect: 0,
  currentStreak: 0,
  lastStudyDate: null,
};

const DEFAULT_DATA: UserData = {
  version: 1,
  lessons: [],
  stats: DEFAULT_STATS,
};

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  // ---- Queries ----
  const lessonsQuery = useQuery<{ lessons: Lesson[] }>({
    queryKey: QUERY_KEYS.lessons,
    queryFn: async () => {
      const r = await fetch("/api/lessons");
      if (!r.ok) throw new Error("Failed to load lessons");
      return r.json();
    },
  });

  const statsQuery = useQuery<{ stats: GlobalStats }>({
    queryKey: QUERY_KEYS.stats,
    queryFn: async () => {
      const r = await fetch("/api/stats");
      if (!r.ok) throw new Error("Failed to load stats");
      return r.json();
    },
  });

  const lessons = lessonsQuery.data?.lessons ?? [];
  const stats = statsQuery.data?.stats ?? DEFAULT_STATS;
  const isLoading = lessonsQuery.isLoading || statsQuery.isLoading;
  const data: UserData = { version: 1, lessons, stats };

  // ---- Mutations ----

  // Create lesson: POST /api/lessons
  const createLessonMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      words: ReturnType<typeof normalizeWordEntries>;
      algorithm?: "SM-2" | "FSRS-5";
      maxNewWordsPerDay?: number;
      minMasteryForNewWords?: number;
    }) => {
      const r = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create lesson");
      }
      return r.json() as Promise<{ lesson: Lesson }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.lessons });
    },
    onError: (e) => toast.error("Failed to create lesson: " + (e as Error).message),
  });

  // Delete lesson: DELETE /api/lessons/[id]
  const deleteLessonMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/lessons/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete lesson");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.lessons });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.stats });
    },
    onError: () => toast.error("Failed to delete lesson"),
  });

  // Reset lesson progress: POST /api/lessons/[id] { action: "reset-progress" }
  const resetLessonMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/lessons/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-progress" }),
      });
      if (!r.ok) throw new Error("Failed to reset lesson progress");
      return r.json() as Promise<{ lesson: Lesson }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.lessons });
    },
    onError: () => toast.error("Failed to reset lesson progress"),
  });

  // Update lesson settings / name: PATCH /api/lessons/[id]
  const patchLessonMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      name?: string;
      algorithm?: "SM-2" | "FSRS-5";
      maxNewWordsPerDay?: number;
      minMasteryForNewWords?: number;
    }) => {
      const r = await fetch(`/api/lessons/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("Failed to update lesson");
      return r.json() as Promise<{ lesson: Lesson }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.lessons });
    },
    onError: () => toast.error("Failed to update lesson"),
  });

  // Import: POST /api/data/import?mode=replace
  // Uses mutateAsync so the caller can await the result and show errors
  // inline in the dialog (instead of closing the dialog immediately and
  // only showing a fleeting toast on error).
  const importMutation = useMutation({
    mutationFn: async (json: string) => {
      const parsed = JSON.parse(json); // throws on invalid JSON
      const r = await fetch("/api/data/import?mode=replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Import failed");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.lessons });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.stats });
      toast.success("Data imported");
    },
    // onError intentionally omitted — the caller handles errors via the
    // returned Promise so they can be shown inline in the dialog.
  });

  // ---- Context methods (preserve original interface) ----

  const setData = useCallback(
    (d: UserData) => {
      // Legacy escape hatch — not used by the refactored components, but
      // kept for compatibility. Replaces the query cache.
      qc.setQueryData(QUERY_KEYS.lessons, { lessons: d.lessons });
      qc.setQueryData(QUERY_KEYS.stats, { stats: d.stats });
    },
    [qc]
  );

  const createLessonFromJson = useCallback(
    (name: string, json: string): { ok: boolean; error?: string; lesson?: Lesson } => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch (e) {
        return { ok: false, error: "Invalid JSON: " + (e as Error).message };
      }
      const err = validateLessonJson(parsed);
      if (err) return { ok: false, error: err };
      const words = normalizeWordEntries(parsed);

      // Fire the mutation. We can't easily return the created lesson synchronously
      // (mutations are async), so we return a placeholder and let the query
      // refetch pick it up. The caller (HomeView) doesn't use the returned
      // lesson object for navigation — it just closes the dialog.
      createLessonMutation.mutate(
        { name, words },
        {
          onSuccess: (data) => {
            // Optionally do something with the created lesson
            void data;
          },
        }
      );
      return { ok: true };
    },
    [createLessonMutation]
  );

  const deleteLesson = useCallback(
    (id: string) => {
      deleteLessonMutation.mutate(id);
    },
    [deleteLessonMutation]
  );

  const resetLessonProgress = useCallback(
    (id: string) => {
      resetLessonMutation.mutate(id);
    },
    [resetLessonMutation]
  );

  const updateLessonSettings = useCallback(
    (id: string, settings: Partial<Lesson["settings"]>) => {
      patchLessonMutation.mutate({ id, ...settings });
    },
    [patchLessonMutation]
  );

  const updateLessonName = useCallback(
    (id: string, name: string) => {
      patchLessonMutation.mutate({ id, name });
    },
    [patchLessonMutation]
  );

  /**
   * recordSessionStats — legacy method preserved for compatibility.
   *
   * In the localStorage version, this was called after replaceLesson at
   * session end to bump the GlobalStats. In the API version, the
   * /api/sessions/[id] PATCH route updates GlobalStats transactionally
   * on the server, so this client method is a no-op — the stats query
   * will refetch automatically when invalidated.
   */
  const recordSessionStats = useCallback((_session: SessionRecord) => {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.stats });
  }, [qc]);

  /**
   * replaceLesson — legacy method preserved for compatibility.
   *
   * In the localStorage version, StudyView called this at session end with
   * the final working lesson (word states + sessions appended). In the API
   * version, StudyView submits reviews incrementally via /api/review and
   * ends the session via /api/sessions/[id] PATCH, so this method just
   * invalidates the cache to refetch the authoritative server state.
   */
  const replaceLesson = useCallback((_lesson: Lesson) => {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.lessons });
    qc.invalidateQueries({ queryKey: QUERY_KEYS.stats });
  }, [qc]);

  const importData = useCallback(
    async (json: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await importMutation.mutateAsync(json);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: "Import failed: " + (e as Error).message };
      }
    },
    [importMutation]
  );

  const exportData = useCallback(async (): Promise<string> => {
    const r = await fetch("/api/data/export");
    if (!r.ok) throw new Error("Failed to export data");
    return r.text();
  }, []);

  const getLesson = useCallback(
    (id: string) => data.lessons.find((l) => l.id === id),
    [data.lessons]
  );

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: QUERY_KEYS.lessons });
    qc.invalidateQueries({ queryKey: QUERY_KEYS.stats });
  }, [qc]);

  const value: UserDataContextValue = {
    data,
    isLoading,
    setData,
    createLessonFromJson,
    deleteLesson,
    resetLessonProgress,
    updateLessonSettings,
    updateLessonName,
    recordSessionStats,
    replaceLesson,
    importData,
    exportData,
    getLesson,
    invalidateAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUserData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUserData must be used within UserDataProvider");
  return v;
}

// Re-export WordState type so existing imports from this module still work.
export type { WordState };
