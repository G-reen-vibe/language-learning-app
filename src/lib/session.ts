import {
  Lesson,
  WordEntry,
  WordState,
  FormatType,
  StudyMode,
  FORMAT_DIFFICULTY,
} from "./types";
import { wordKeyOf, getWordForms, getAspects, isTypable } from "./aspects";
import { sm2Update } from "./sm2";
import { fsrs5Update } from "./fsrs5";
import { todayStr as todayStrLocal } from "./storage";

// ----- Mastery threshold helpers -----

/**
 * For diff-0 (introduction), eligible words are those NEVER seen (mastery 0, !seen).
 * For diff>=1, eligible words are those with mastery >= diff.
 */
export function eligibleWordsForFormat(
  lesson: Lesson,
  fmt: FormatType
): { word: WordEntry; state: WordState }[] {
  const diff = FORMAT_DIFFICULTY[fmt];
  const out: { word: WordEntry; state: WordState }[] = [];
  for (const w of lesson.words) {
    const k = wordKeyOf(w);
    const s = lesson.wordStates[k];
    if (!s) continue;
    if (diff === 0) {
      // never seen
      if (!s.seen && s.mastery === 0) out.push({ word: w, state: s });
    } else {
      if (s.mastery >= diff) out.push({ word: w, state: s });
    }
  }
  return out;
}

/** Number of words a format needs at minimum to be servable. */
function minWordsRequired(fmt: FormatType): number {
  switch (fmt) {
    case "introduction":
      return 1;
    case "pickAnswer":
      return 1;
    case "spotTheLie":
      return 1;
    case "matchPairs":
      return 3; // need at least 3 pairs for a meaningful match game
    case "wordScramble":
      return 1;
    case "fillGap":
      return 1;
    case "sentenceComprehension":
      return 1;
    case "sentenceTranslation":
      return 1;
    case "shellGame":
      return 1;
    case "cardGame":
      return 1;
    case "marbleGame":
      return 1;
  }
}

// ----- Local aspect-counting helpers -----

function aspectPresent(w: WordEntry, t: string): boolean {
  if (t === "synonym") return !!w.synonym && w.synonym.replace(/^=/, "").trim().length > 0;
  if (t === "translation") return !!w.translation && w.translation.trim().length > 0;
  if (t === "alt1") return !!w.alt1 && w.alt1.trim().length > 0;
  if (t === "alt2") return !!w.alt2 && w.alt2.trim().length > 0;
  if (t === "alt3") return !!w.alt3 && w.alt3.trim().length > 0;
  return false;
}

function countUsableAspects(w: WordEntry): number {
  return getAspects(w).length;
}

/** Count aspects that are NOT definition or explanation (fit on screen). */
function nonLongAspectsCount(w: WordEntry): number {
  return getAspects(w).filter(
    (a) => a.type !== "definition" && a.type !== "explanation"
  ).length;
}

/**
 * Determine whether a format is servable for the given lesson right now.
 * Also enforces additional restrictions (e.g., sentenceComprehension needs
 * at least one word with sentences containing lesson-word tokens).
 */
export function isFormatServable(lesson: Lesson, fmt: FormatType): boolean {
  const eligible = eligibleWordsForFormat(lesson, fmt);
  const need = minWordsRequired(fmt);
  if (eligible.length < need) return false;

  // Special restrictions
  if (fmt === "pickAnswer") {
    // Need at least 1 eligible word with >= 2 usable aspects (word + another aspect)
    const ok = eligible.some(({ word }) => countUsableAspects(word) >= 2);
    if (!ok) return false;
    // Need at least 2 distinct aspect values across all words for distractors
    const totalAspects = lesson.words.reduce((sum, w) => sum + countUsableAspects(w), 0);
    if (totalAspects < 2) return false;
    return true;
  }
  if (fmt === "spotTheLie") {
    // Need at least 2 eligible words with >= 2 non-def/expl aspects (word form + another)
    // to fabricate both correct pairs and a lie.
    const eligibleWithAspects = eligible.filter(
      ({ word }) => nonLongAspectsCount(word) >= 1
    );
    if (eligibleWithAspects.length < 2) return false;
    return true;
  }
  if (fmt === "matchPairs") {
    // Need at least 3 eligible words that have the SAME non-long aspect type present.
    const types: ("synonym" | "translation" | "alt1" | "alt2" | "alt3")[] = [
      "synonym",
      "translation",
      "alt1",
      "alt2",
      "alt3",
    ];
    for (const t of types) {
      const c = eligible.filter((w) => aspectPresent(w.word, t));
      if (c.length >= 3) return true;
    }
    return false;
  }
  if (fmt === "wordScramble") {
    // Need at least 1 eligible word with >= 2 usable aspects
    const ok = eligible.some(({ word }) => {
      const forms = getWordForms(word);
      return forms.length >= 1 && countUsableAspects(word) >= 2;
    });
    return ok;
  }
  if (fmt === "fillGap") {
    // Need at least 1 eligible word with a typable word form (>= 2 chars) and >= 2 aspects
    const ok = eligible.some(({ word }) => {
      const forms = getWordForms(word).filter((v) => v.value.length >= 2 && isTypable(v.value));
      return forms.length > 0 && countUsableAspects(word) >= 2;
    });
    return ok;
  }
  if (fmt === "sentenceComprehension" || fmt === "sentenceTranslation") {
    // Need at least 1 sentence from an eligible word that contains >= 2 SEEN lesson-word tokens.
    // Only seen words can be blanked (blanking unseen words would be unfair).
    const ok = eligible.some(({ word }) => {
      if (!word.sentences || word.sentences.length === 0) return false;
      return word.sentences.some((s) => {
        const parsed = parseSentence(s.exert);
        if (parsed.tokens.length < 3) return false;
        let seenMatchCount = 0;
        for (const t of parsed.tokens) {
          if (!t.translation) continue;
          const clean = t.text.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
          if (!clean) continue;
          const match = lesson.words.find((w) =>
            getWordForms(w).some((f) => f.value.toLowerCase() === clean)
          );
          if (match) {
            const k = wordKeyOf(match);
            const state = lesson.wordStates[k];
            if (state && state.seen) seenMatchCount++;
          }
        }
        return seenMatchCount >= 2;
      });
    });
    return ok;
  }
  if (fmt === "shellGame") {
    // Shell game uses pickShellItems (single word). Need at least 1 eligible word
    // with >= 3 shell aspect values (word/alt/synonym/translation).
    const ok = eligible.some(
      ({ word }) => nonLongAspectsCount(word) >= 3
    );
    return ok;
  }
  if (fmt === "cardGame") {
    // Card game uses pickGameItems (one aspect per word). The number of cards
    // equals the number of eligible words that have at least one shell aspect.
    // Need at least 4 such words (matches CardGameFormat's min items check).
    const wordsWithShellAspect = eligible.filter(({ word }) =>
      getAspects(word).some(
        (a) =>
          a.type === "word" ||
          a.type === "alt1" ||
          a.type === "alt2" ||
          a.type === "alt3" ||
          a.type === "synonym" ||
          a.type === "translation"
      )
    );
    return wordsWithShellAspect.length >= 4;
  }
  if (fmt === "marbleGame") {
    // Marble game uses pickGameItems (one aspect per word). The number of
    // slots equals the number of eligible words that have at least one shell
    // aspect. Need at least 6 such words (matches MarbleGameFormat's min items
    // check).
    const wordsWithShellAspect = eligible.filter(({ word }) =>
      getAspects(word).some(
        (a) =>
          a.type === "word" ||
          a.type === "alt1" ||
          a.type === "alt2" ||
          a.type === "alt3" ||
          a.type === "synonym" ||
          a.type === "translation"
      )
    );
    return wordsWithShellAspect.length >= 6;
  }
  return true;
}

// ---------- Sentence parsing ----------
export interface ParsedSentence {
  tokens: { text: string; translation: string | null }[];
  raw: string;
  translation: string;
}

/**
 * Parse a sentence exert like "El [the] gato [cat] duerme [sleeps]."
 * into tokens. Each token is either a word (with optional bracket translation)
 * or a non-word (punctuation/spaces).
 */
export function parseSentence(exert: string): ParsedSentence {
  // Tokenize: keep words (with attached bracket) and runs of non-word chars.
  const tokens: { text: string; translation: string | null }[] = [];
  // Regex: a "word" chunk = letters/chars followed optionally by [translation]
  // We'll iterate character by character building up tokens.
  let i = 0;
  while (i < exert.length) {
    const ch = exert[i];
    // skip leading spaces into a token
    if (/\s/.test(ch)) {
      let j = i;
      while (j < exert.length && /\s/.test(exert[j])) j++;
      tokens.push({ text: exert.slice(i, j), translation: null });
      i = j;
      continue;
    }
    // punctuation
    if (!/[\p{L}\p{N}]/u.test(ch)) {
      // Handle standalone '[' (not preceded by a word) — consume bracket as its own token
      if (ch === "[") {
        const end = exert.indexOf("]", i);
        if (end !== -1) {
          tokens.push({ text: exert.slice(i, end + 1), translation: null });
          i = end + 1;
        } else {
          tokens.push({ text: ch, translation: null });
          i++;
        }
        continue;
      }
      let j = i;
      while (
        j < exert.length &&
        !/[\p{L}\p{N}]/u.test(exert[j]) &&
        !/\s/.test(exert[j]) &&
        exert[j] !== "["
      )
        j++;
      // Guard: ensure progress to avoid infinite loop
      if (j === i) j++;
      tokens.push({ text: exert.slice(i, j), translation: null });
      i = j;
      continue;
    }
    // word chunk: read until whitespace or punctuation
    let j = i;
    while (
      j < exert.length &&
      /[\p{L}\p{N}]/u.test(exert[j])
    )
      j++;
    const word = exert.slice(i, j);
    i = j;
    // optional [translation]
    let translation: string | null = null;
    // skip spaces between word and bracket? spec implies no spaces, but be tolerant
    let k = i;
    while (k < exert.length && /\s/.test(exert[k])) k++;
    if (k < exert.length && exert[k] === "[") {
      // find closing ]
      const end = exert.indexOf("]", k);
      if (end !== -1) {
        translation = exert.slice(k + 1, end).trim();
        i = end + 1;
      }
    }
    tokens.push({ text: word, translation });
  }
  return { tokens, raw: exert, translation: "" };
}

// ---------- Format selection ----------

const ALL_FORMATS: FormatType[] = [
  "introduction",
  "pickAnswer",
  "spotTheLie",
  "matchPairs",
  "wordScramble",
  "fillGap",
  "sentenceComprehension",
  "sentenceTranslation",
  "shellGame",
  "cardGame",
  "marbleGame",
];

/**
 * Pick the next format for the session.
 * Strategy:
 *  - If there are unseen words AND we're under the daily new-word cap AND existing words
 *    are sufficiently mastered (per lesson settings), prefer "introduction".
 *  - Otherwise pick a random servable format (excluding those that can't run).
 *  - Avoid repeating the same format back-to-back when possible.
 */
export function pickNextFormat(
  lesson: Lesson,
  recentFormats: FormatType[],
  usedFormatsThisSession: Set<FormatType>
): FormatType | null {
  // Step 1: introduction priority
  const introEligible = eligibleWordsForFormat(lesson, "introduction");
  // The working lesson already resets newWordsIntroducedToday to 0 if it's a new
  // day (see StudyView's useState initializer). So we can read it directly.
  // NOTE: do NOT check lastStudyDate here — it's only set at session END,
  // so checking it here would make the daily cap ineffective during the session.
  const newToday = lesson.newWordsIntroducedToday;
  const underCap = newToday < lesson.settings.maxNewWordsPerDay;
  const existingWords = lesson.words.filter((w) => {
    const s = lesson.wordStates[wordKeyOf(w)];
    return s && s.seen;
  });
  const existingMasteredOk =
    existingWords.length === 0 ||
    existingWords.every(
      (w) =>
        lesson.wordStates[wordKeyOf(w)].mastery >=
        lesson.settings.minMasteryForNewWords
    );

  if (introEligible.length > 0 && underCap && existingMasteredOk) {
    return "introduction";
  }

  // Step 2: list servable formats
  // Hard-exclude formats that should only be served once per session:
  //   - matchPairs (spec: served once)
  //   - shellGame, cardGame, marbleGame (spec: "the game sets up once" — one setup per session)
  // Hard-exclude introduction if we're over the daily new-word cap
  const ONE_SHOT_FORMATS: FormatType[] = ["matchPairs", "shellGame", "cardGame", "marbleGame"];
  const servable = ALL_FORMATS.filter((f) => {
    if (ONE_SHOT_FORMATS.includes(f) && usedFormatsThisSession.has(f)) return false;
    if (f === "introduction" && !underCap) return false;
    return isFormatServable(lesson, f);
  });
  if (servable.length === 0) return null;

  // Step 3: avoid back-to-back repeat
  const last = recentFormats[recentFormats.length - 1];
  let pool = servable.filter((f) => f !== last);
  if (pool.length === 0) pool = servable;

  // Step 4: prefer not-yet-used formats in this session for variety
  const unused = pool.filter((f) => !usedFormatsThisSession.has(f));
  if (unused.length > 0) {
    return unused[Math.floor(Math.random() * unused.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Target question count for a study mode. */
export function modeQuestionTarget(mode: StudyMode): number {
  if (mode === "daily") return 30;
  if (mode === "lesson") return 100;
  return 0; // rush: no fixed target, time-based
}

/** Rush mode configuration. */
export const RUSH_DURATION_SEC = 5 * 60;
export const RUSH_LIVES = 3;

/**
 * Mark a word as "introduced" — seen for the first time.
 * This does NOT run the spaced repetition algorithm (no review happened).
 * Sets seen=true, mastery=1, introducedAt=now, lastReviewed=now.
 * Algorithm fields (ease, stability, difficulty, interval, repetitions) keep
 * their default fresh values and will be updated on the first real review.
 */
export function introduceWord(state: WordState): WordState {
  const now = Date.now();
  return {
    ...state,
    seen: true,
    mastery: 1,
    introducedAt: now,
    lastReviewed: now,
  };
}

// Apply result via the selected algorithm
export function applyAlgorithmResult(
  lesson: Lesson,
  wordKey: string,
  quality: number
): WordState | undefined {
  const s = lesson.wordStates[wordKey];
  if (!s) return undefined;
  if (lesson.settings.algorithm === "FSRS-5") {
    return fsrs5Update(s, quality);
  } else {
    return sm2Update(s, quality);
  }
}
