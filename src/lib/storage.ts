import { UserData, Lesson, WordEntry, WordState, LessonSettings, GlobalStats } from "./types";
import { freshWordState } from "./sm2";
import { wordKeyOf } from "./aspects";

const STORAGE_KEY = "langlearn.userdata.v1";
const VERSION = 1;

export function defaultStats(): GlobalStats {
  return {
    totalSessions: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    currentStreak: 0,
    lastStudyDate: null,
  };
}

export function defaultUserData(): UserData {
  return {
    version: VERSION,
    lessons: [],
    stats: defaultStats(),
  };
}

export function defaultLessonSettings(): LessonSettings {
  return {
    algorithm: "FSRS-5",
    maxNewWordsPerDay: 10,
    minMasteryForNewWords: 2,
  };
}

/** Load user data from localStorage. Returns default if missing/corrupt. */
export function loadUserData(): UserData {
  if (typeof window === "undefined") return defaultUserData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultUserData();
    const parsed = JSON.parse(raw) as UserData;
    if (!parsed || typeof parsed !== "object") return defaultUserData();
    if (!parsed.lessons) parsed.lessons = [];
    if (!parsed.stats) parsed.stats = defaultStats();
    if (parsed.version !== VERSION) {
      // future migration point
      parsed.version = VERSION;
    }
    return parsed;
  } catch {
    return defaultUserData();
  }
}

export function saveUserData(data: UserData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportUserData(data: UserData): string {
  return JSON.stringify(data, null, 2);
}

export function importUserData(json: string): UserData {
  const parsed = JSON.parse(json) as UserData;
  if (!Array.isArray(parsed.lessons))
    throw new Error("Invalid user data: lessons must be an array");
  if (!parsed.stats) parsed.stats = defaultStats();
  parsed.version = VERSION;
  return parsed;
}

/** Create a new lesson from a list of word entries. */
export function createLesson(name: string, words: WordEntry[]): Lesson {
  const now = Date.now();
  const wordStates: Record<string, WordState> = {};
  for (const w of words) {
    const k = wordKeyOf(w);
    if (!k) continue;
    if (!wordStates[k]) wordStates[k] = freshWordState(k);
  }
  return {
    id: makeId(),
    name: name || "Untitled Lesson",
    createdAt: now,
    words,
    settings: defaultLessonSettings(),
    wordStates,
    sessions: [],
    newWordsIntroducedToday: 0,
    lastStudyDate: null,
  };
}

export function makeId(): string {
  // 8 hex chars + timestamp suffix
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Validate a parsed JSON value as a lesson word list. Returns an error message or null. */
export function validateLessonJson(parsed: unknown): string | null {
  if (!Array.isArray(parsed)) return "Expected a JSON array.";
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (!item || typeof item !== "object") return `Item ${i}: not an object`;
    const w = (item as Record<string, unknown>).word;
    if (typeof w !== "string" || !w.trim())
      return `Item ${i}: missing or empty "word" field`;
    if ((item as Record<string, unknown>).sentences !== undefined) {
      if (!Array.isArray((item as Record<string, unknown>).sentences))
        return `Item ${i}: "sentences" must be an array`;
    }
  }
  return null;
}

/** Normalize raw parsed JSON into WordEntry[] (handles missing fields gracefully). */
export function normalizeWordEntries(parsed: unknown): WordEntry[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item: any) => ({
    word: String(item.word ?? "").trim(),
    definition: item.definition ? String(item.definition).trim() : undefined,
    synonym: item.synonym ? String(item.synonym).replace(/^=/, "").trim() : undefined,
    translation: item.translation ? String(item.translation).trim() : undefined,
    explanation: item.explanation ? String(item.explanation).trim() : undefined,
    alt1: item.alt1 ? String(item.alt1).trim() : undefined,
    alt2: item.alt2 ? String(item.alt2).trim() : undefined,
    alt3: item.alt3 ? String(item.alt3).trim() : undefined,
    sentences: Array.isArray(item.sentences)
      ? item.sentences.map((s: any) => ({
          exert: String(s.exert ?? "").trim(),
          translation: String(s.translation ?? "").trim(),
        }))
      : undefined,
  }));
}
