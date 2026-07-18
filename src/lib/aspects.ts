import { Aspect, AspectType, WordEntry } from "./types";

/**
 * Get all aspects of a word that are non-empty.
 * The "synonym" is stored WITHOUT the leading "=" prefix.
 */
export function getAspects(word: WordEntry): Aspect[] {
  const aspects: Aspect[] = [];
  aspects.push({ type: "word", value: word.word });
  // NOTE: "definition" is intentionally excluded from quiz aspects — it's the
  // definition in the non-native language and is too difficult for now.
  // It is still displayed on Introduction cards.
  // strip leading "=" from synonym
  if (word.synonym) {
    const v = word.synonym.startsWith("=") ? word.synonym.slice(1) : word.synonym;
    if (v.trim()) aspects.push({ type: "synonym", value: v });
  }
  if (word.translation) aspects.push({ type: "translation", value: word.translation });
  if (word.explanation) aspects.push({ type: "explanation", value: word.explanation });
  if (word.alt1) aspects.push({ type: "alt1", value: word.alt1 });
  if (word.alt2) aspects.push({ type: "alt2", value: word.alt2 });
  if (word.alt3) aspects.push({ type: "alt3", value: word.alt3 });
  return aspects;
}

/** "Word or alt form" aspect types. */
export const WORD_FORM_TYPES: AspectType[] = ["word", "alt1", "alt2", "alt3"];

/**
 * Human-readable labels for each aspect type, used in UI badges/labels so the
 * user knows which facet of the word they're being quizzed on (e.g. "type the
 * Translation", "find the Synonym").
 */
export const ASPECT_LABELS: Record<AspectType, string> = {
  word: "Word",
  definition: "Definition",
  synonym: "Synonym",
  translation: "Translation",
  explanation: "Explanation",
  alt1: "Alt form 1",
  alt2: "Alt form 2",
  alt3: "Alt form 3",
};

/** Get all "word or alt form" aspects of a word (non-empty). */
export function getWordForms(word: WordEntry): Aspect[] {
  return getAspects(word).filter((a) => WORD_FORM_TYPES.includes(a.type));
}

/** Stable key for a word. */
export function wordKeyOf(word: WordEntry | string): string {
  const w = typeof word === "string" ? word : word.word;
  return w.trim().toLowerCase();
}

/** Pick a random element from an array. */
export function pickRandom<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error("pickRandom: empty array");
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Shuffle (Fisher-Yates) — returns a new array. */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sample N distinct items from arr. Returns fewer if arr.length < N. */
export function sampleN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

/** Check if a string is "typable" on a standard QWERTY keyboard (ASCII printable). */
export function isTypable(s: string): boolean {
  // ASCII printable: 0x20..0x7E plus common whitespace.
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c > 0x7e) {
      // allow newlines and tabs
      if (c !== 0x09 && c !== 0x0a && c !== 0x0d) return false;
    }
  }
  return true;
}

/**
 * Sample N distinct items from arr such that `keyFn(item)` is unique across the sample.
 * Useful when items may have duplicate values (e.g. two words with same translation).
 */
export function sampleNDistinct<T, K>(
  arr: T[],
  n: number,
  keyFn: (x: T) => K
): T[] {
  const shuffled = shuffle(arr);
  const seen = new Set<K>();
  const out: T[] = [];
  for (const x of shuffled) {
    if (out.length >= n) break;
    const k = keyFn(x);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}
