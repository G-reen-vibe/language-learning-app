import { WordEntry, Aspect, AspectType } from "./types";
import { getAspects, getWordForms, pickRandom, shuffle, sampleNDistinct, sampleN, wordKeyOf } from "./aspects";

/**
 * Given a target word and the full lesson word list, pick N distractor aspect values
 * of the given type, ensuring they are distinct from each other AND from `correctValue`.
 */
export function pickDistractorAspects(
  allWords: WordEntry[],
  correctValue: string,
  type: AspectType,
  n: number
): string[] {
  const pool: string[] = [];
  for (const w of allWords) {
    const a = getAspects(w).find((x) => x.type === type);
    if (a && a.value && a.value.trim()) pool.push(a.value);
  }
  const filtered = pool.filter((v) => v !== correctValue);
  const distinct = Array.from(new Set(filtered));
  return sampleN(distinct, n);
}

/**
 * Generic distractor picker: pick N distinct aspect VALUES from OTHER words (any aspect type),
 * excluding both `correctValue` AND `questionValue` (to avoid a distractor equaling the question).
 */
export function pickGenericDistractors(
  allWords: WordEntry[],
  excludeWord: WordEntry,
  correctValue: string,
  questionValue: string,
  n: number
): string[] {
  const pool: string[] = [];
  for (const w of allWords) {
    if (w === excludeWord) continue;
    for (const a of getAspects(w)) {
      if (a.value && a.value.trim()) pool.push(a.value);
    }
  }
  const filtered = pool.filter((v) => v !== correctValue && v !== questionValue);
  const distinct = Array.from(new Set(filtered));
  return sampleN(distinct, n);
}

/**
 * For "Pick the Answer":
 *  - Question side: a random "word form" aspect of the target word.
 *  - Answer side: a random OTHER aspect of the target word (different value).
 *  - Distractors: same aspect type from other words, fallback to any aspect value.
 */
export function buildPickAnswer(
  target: WordEntry,
  allWords: WordEntry[],
  nChoices: number
): { question: string; correct: string; choices: string[] } | null {
  const wordForms = getWordForms(target);
  const allAspects = getAspects(target);
  if (wordForms.length === 0 || allAspects.length < 2) return null;

  const qAspect = pickRandom(wordForms);
  const answerPool = allAspects.filter((a) => a.value !== qAspect.value);
  if (answerPool.length === 0) return null;
  const aAspect = pickRandom(answerPool);

  // distractors: prefer same aspect type from other words, fall back to any aspect value
  let distractors = pickDistractorAspects(
    allWords.filter((w) => w !== target),
    aAspect.value,
    aAspect.type,
    nChoices - 1
  );
  if (distractors.length < nChoices - 1) {
    const extra = pickGenericDistractors(
      allWords,
      target,
      aAspect.value,
      qAspect.value, // also exclude question value
      nChoices - 1 - distractors.length
    );
    distractors = distractors.concat(extra);
  }
  // dedupe + exclude correct AND question value
  const seen = new Set<string>([aAspect.value, qAspect.value]);
  const finalDistractors: string[] = [];
  for (const d of distractors) {
    if (!seen.has(d)) {
      seen.add(d);
      finalDistractors.push(d);
    }
    if (finalDistractors.length >= nChoices - 1) break;
  }
  if (finalDistractors.length < nChoices - 1) return null;

  const choices = shuffle([aAspect.value, ...finalDistractors]);
  return { question: qAspect.value, correct: aAspect.value, choices };
}

/**
 * For "Spot the Lie": build N pairs where N-1 are correct and 1 is incorrect.
 * Each pair: (word form value of word, non-def/expl aspect value of word).
 * The "lie" pair has the word form of one word paired with a non-def/expl aspect of ANOTHER word.
 *
 * @param eligibleWords — only words that meet the format's mastery requirement
 */
export function buildSpotTheLie(
  eligibleWords: WordEntry[],
  nPairs: number
): {
  pairs: { left: string; right: string; correct: boolean }[];
  lieIndex: number;
  sourceWordKeys: string[];
} | null {
  // Eligible words: those with at least one word form and at least one non-def/expl aspect
  const eligible = eligibleWords.filter((w) => {
    return getWordForms(w).length >= 1 && hasNonDefExplAspect(w);
  });
  if (eligible.length < 1) return null;
  // Need at least one OTHER word to fabricate a lie from
  if (eligibleWords.length < 2) return null;

  const correctTargets = sampleNDistinct(eligible, nPairs - 1, (w) => wordKeyOf(w));
  if (correctTargets.length < 1) return null;

  // For each correct target, pick a word form (left) and a non-def/expl aspect (right, different value)
  const pairs: { left: string; right: string; correct: boolean; sourceWord: WordEntry }[] = [];
  for (const t of correctTargets) {
    const forms = getWordForms(t);
    const aspects = getAspects(t).filter(
      (a) => a.type !== "definition" && a.type !== "explanation"
    );
    if (forms.length === 0 || aspects.length === 0) continue;
    const left = pickRandom(forms).value;
    // right must be different value from left
    const rightPool = aspects.filter((a) => a.value !== left);
    if (rightPool.length === 0) continue;
    const right = pickRandom(rightPool).value;
    pairs.push({ left, right, correct: true, sourceWord: t });
  }
  if (pairs.length < 1) return null;

  // Build the lie: pick a word form from a correct target, and a non-def/expl aspect from a DIFFERENT word.
  // The lie pair must NOT match any correct pair AND must NOT accidentally be correct for the lie's source word.
  let liePair: { left: string; right: string; correct: boolean } | null = null;
  let lieRightWord: WordEntry | null = null;
  let lieLeftWord: WordEntry | null = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const lieWord = pickRandom(correctTargets);
    const lieLeft = pickRandom(getWordForms(lieWord)).value;
    const otherWords = eligibleWords.filter((w) => w !== lieWord && hasNonDefExplAspect(w));
    if (otherWords.length === 0) continue;
    const candidateLieRightWord = pickRandom(otherWords);
    const lieRightAspects = getAspects(candidateLieRightWord).filter(
      (a) => a.type !== "definition" && a.type !== "explanation" && a.value !== lieLeft
    );
    if (lieRightAspects.length === 0) continue;
    const lieRight = pickRandom(lieRightAspects).value;
    const candidate = { left: lieLeft, right: lieRight, correct: false };
    // Check it doesn't duplicate any correct pair
    const duplicates = pairs.some((p) => p.left === candidate.left && p.right === candidate.right);
    if (duplicates) continue;
    // Check the lie doesn't accidentally form a correct pair for lieWord
    // (i.e., lieRight should NOT be one of lieWord's own non-def/expl aspect values)
    const lieWordAspects = getAspects(lieWord)
      .filter((a) => a.type !== "definition" && a.type !== "explanation")
      .map((a) => a.value);
    if (lieWordAspects.includes(lieRight)) continue;
    liePair = candidate;
    lieRightWord = candidateLieRightWord;
    lieLeftWord = lieWord;
    break;
  }
  if (!liePair || !lieRightWord || !lieLeftWord) return null;

  const allPairs = [
    ...pairs.map(({ left, right, correct }) => ({ left, right, correct })),
    liePair,
  ];
  const shuffled = shuffle(allPairs);
  const lieIndex = shuffled.findIndex((p) => !p.correct);
  // Collect all unique source word keys for grading.
  // Include both correct pair sources, the lie's left word source, and the lie's right word source.
  const sourceWordKeys = Array.from(new Set([
    ...pairs.map((p) => wordKeyOf(p.sourceWord)),
    wordKeyOf(lieLeftWord),
    wordKeyOf(lieRightWord),
  ]));
  return { pairs: shuffled, lieIndex, sourceWordKeys };
}

function hasNonDefExplAspect(w: WordEntry): boolean {
  const a = getAspects(w).filter(
    (x) => x.type !== "definition" && x.type !== "explanation"
  );
  return a.length > 0;
}

/**
 * For "Match Pairs": given a target aspect type, pick N words that have
 * that aspect, and build pairs of (word form, aspect value).
 * Enforces unique left values AND unique right values across pairs.
 */
export function buildMatchPairs(
  allWords: WordEntry[],
  aspectType: AspectType,
  nPairs: number
): { left: string; right: string; wordKey: string }[] | null {
  const eligible = allWords.filter((w) => {
    const a = getAspects(w).find((x) => x.type === aspectType);
    return a && a.value.trim().length > 0;
  });
  if (eligible.length < nPairs) return null;

  // Try multiple times to find a set with unique left and right values
  for (let attempt = 0; attempt < 5; attempt++) {
    const chosen = sampleNDistinct(eligible, nPairs, (w) => wordKeyOf(w));
    if (chosen.length < nPairs) continue;
    const result: { left: string; right: string; wordKey: string }[] = [];
    const usedLefts = new Set<string>();
    const usedRights = new Set<string>();
    let ok = true;
    for (const w of chosen) {
      const forms = getWordForms(w);
      const right = getAspects(w).find((x) => x.type === aspectType)!.value;
      // find a left form not yet used and not equal to right
      const availableForms = forms.filter((f) => f.value !== right && !usedLefts.has(f.value));
      if (availableForms.length === 0) {
        ok = false;
        break;
      }
      const left = pickRandom(availableForms).value;
      if (usedRights.has(right)) {
        ok = false;
        break;
      }
      usedLefts.add(left);
      usedRights.add(right);
      result.push({ left, right, wordKey: wordKeyOf(w) });
    }
    if (ok && result.length === nPairs) return result;
  }
  return null;
}

/**
 * For "Word Scramble" / "Fill the Gap":
 *  - Choose word form aspect (the "answer" or "question" side)
 *  - Choose another aspect of the same word (the other side)
 *  - Either side can be question or answer (random).
 *
 * Returns the aspect TYPES alongside the values so the UI can show the user
 * which aspect they're being asked to produce. Without this label, the user
 * has no way to know whether to type the translation, synonym, alt form, etc.
 * when multiple aspects could be valid for the same word.
 */
export function buildScrambleOrFill(
  target: WordEntry,
  opts: { fillMode: "fill" | "scramble" }
):
  | {
      questionText: string;
      questionAspectType: AspectType;
      answerText: string;
      answerAspectType: AspectType;
      answerElements: string[];
      isMultiWord: boolean;
      wordKey: string;
    }
  | null {
  const forms = getWordForms(target);
  const allAspects = getAspects(target);
  if (forms.length === 0 || allAspects.length < 2) return null;

  const formAspect = pickRandom(forms);
  const others = allAspects.filter((a) => a.value !== formAspect.value);
  if (others.length === 0) return null;
  const otherAspect = pickRandom(others);

  let questionAspect: Aspect;
  let answerAspect: Aspect;
  if (opts.fillMode === "fill") {
    // For "fill": answer must be typable (ASCII) AND not def/expl (per spec).
    // Try word form first; if not typable, try other non-def/expl aspects.
    if (formAspect.value.length >= 2 && isTypable(formAspect.value)) {
      answerAspect = formAspect;
      questionAspect = otherAspect;
    } else {
      // try to find a typable, non-def/expl aspect as the answer
      const typableOthers = others.filter(
        (a) =>
          a.type !== "definition" &&
          a.type !== "explanation" &&
          a.value.length >= 2 &&
          isTypable(a.value)
      );
      if (typableOthers.length > 0) {
        answerAspect = pickRandom(typableOthers);
        // question = a word form (different value)
        const qForms = forms.filter((f) => f.value !== answerAspect.value);
        if (qForms.length === 0) return null;
        questionAspect = pickRandom(qForms);
      } else {
        return null;
      }
    }
  } else {
    // scramble: pick whichever arrangement gives a valid answer (>= 2 chars)
    if (Math.random() < 0.5 && formAspect.value.length >= 2) {
      answerAspect = formAspect;
      questionAspect = otherAspect;
    } else if (otherAspect.value.length >= 2) {
      answerAspect = otherAspect;
      questionAspect = formAspect;
    } else if (formAspect.value.length >= 2) {
      answerAspect = formAspect;
      questionAspect = otherAspect;
    } else {
      return null;
    }
  }

  const answerText = answerAspect.value;
  if (answerText.length < 2) return null;

  const isMultiWord = answerText.includes(" ");
  const answerElements = isMultiWord
    ? answerText.split(/\s+/).filter((s) => s.length > 0)
    : answerText.split("");

  return {
    questionText: questionAspect.value,
    questionAspectType: questionAspect.type,
    answerText,
    answerAspectType: answerAspect.type,
    answerElements,
    isMultiWord,
    wordKey: wordKeyOf(target),
  };
}

function isTypable(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c > 0x7e) {
      if (c !== 0x09 && c !== 0x0a && c !== 0x0d) return false;
    }
  }
  return true;
}

/**
 * For "Shell Game" / "Card Game": pick N distinct aspect values from a single word
 * (word forms + synonym + translation).
 */
export function pickShellItems(
  target: WordEntry,
  n: number
): Aspect[] | null {
  const allowed = getAspects(target).filter(
    (a) =>
      a.type === "word" ||
      a.type === "alt1" ||
      a.type === "alt2" ||
      a.type === "alt3" ||
      a.type === "synonym" ||
      a.type === "translation"
  );
  if (allowed.length < n) return null;
  const distinct = sampleNDistinct(allowed, n, (a) => a.value);
  if (distinct.length < n) return null;
  return distinct;
}

/**
 * For "Card Game" (N up to 9) and "Marble Game" (N up to 12):
 * pick N distinct aspect values, sourcing from a primary word first,
 * then supplementing with aspects from other eligible words if the primary
 * doesn't have enough. Returns the items plus the primary target word.
 *
 * Each item is tagged with its source word so grading can be done per-word.
 *
 * @deprecated Prefer `pickGameItems` for new code — it sources one aspect
 * per word so each shell/card/slot represents a DIFFERENT word, which is
 * much easier for the user to distinguish. This is kept for backward
 * compatibility with ShellGameFormat's single-word mode.
 */
export function pickShellItemsMulti(
  primaryTarget: WordEntry,
  otherWords: WordEntry[],
  n: number
): { items: Aspect[]; sources: WordEntry[] } | null {
  // Start with all shell aspects from the primary word
  const primaryAspects = getAspects(primaryTarget).filter(
    (a) =>
      a.type === "word" ||
      a.type === "alt1" ||
      a.type === "alt2" ||
      a.type === "alt3" ||
      a.type === "synonym" ||
      a.type === "translation"
  );
  const seen = new Set<string>();
  const items: Aspect[] = [];
  const sources: WordEntry[] = [];
  // Add primary aspects first
  for (const a of primaryAspects) {
    if (items.length >= n) break;
    if (!seen.has(a.value)) {
      seen.add(a.value);
      items.push(a);
      sources.push(primaryTarget);
    }
  }
  // Supplement from other words
  if (items.length < n) {
    for (const w of shuffle(otherWords)) {
      if (items.length >= n) break;
      if (w === primaryTarget) continue;
      const aspects = getAspects(w).filter(
        (a) =>
          a.type === "word" ||
          a.type === "alt1" ||
          a.type === "alt2" ||
          a.type === "alt3" ||
          a.type === "synonym" ||
          a.type === "translation"
      );
      for (const a of aspects) {
        if (items.length >= n) break;
        if (!seen.has(a.value)) {
          seen.add(a.value);
          items.push(a);
          sources.push(w);
        }
      }
    }
  }
  if (items.length < n) return null;
  return { items, sources };
}

/**
 * Pick N "shell" aspects (word/alt forms/synonym/translation) for the games
 * (Shell, Card, Marble) such that EACH ITEM COMES FROM A DIFFERENT WORD.
 *
 * This is the recommended helper for game setups because having multiple
 * aspects of the SAME word on the board makes the question very hard to
 * answer (the user can't tell which shell/slot corresponds to which concept
 * when they're all facets of the same word). It also creates ambiguous
 * questions — e.g. if "hiragana" (romaji) and "ひらがな" (hiragana form)
 * of the same word both appear as separate cards, the user has no way to
 * know which card the question is asking about.
 *
 * Algorithm:
 *  Walk through eligible words in random order and pick ONE aspect from each
 *  (preferring the "word" form so the user sees the canonical spelling).
 *  Continue until we have N items, OR run out of words.
 *
 * Returns null if we can't gather at least `minItems` items. The caller is
 * responsible for treating null as "this format is not servable right now"
 * — the question is simply not allowed if there aren't enough eligible
 * words at the required mastery level.
 */
export function pickGameItems(
  eligibleWords: WordEntry[],
  n: number,
  minItems = 3
): { items: Aspect[]; sources: WordEntry[] } | null {
  if (eligibleWords.length === 0 || n < 1) return null;

  const shuffledWords = shuffle(eligibleWords);
  const items: Aspect[] = [];
  const sources: WordEntry[] = [];
  const usedValues = new Set<string>();
  const SHELL_TYPES: AspectType[] = ["word", "alt1", "alt2", "alt3", "synonym", "translation"];

  const shellAspectsOf = (w: WordEntry): Aspect[] =>
    getAspects(w).filter((a) => SHELL_TYPES.includes(a.type));

  // One aspect per word (different words). Prefer the "word" form so the
  // user sees the canonical spelling on the board — this is the most
  // recognizable aspect and makes the game feel less arbitrary.
  for (const w of shuffledWords) {
    if (items.length >= n) break;
    const aspects = shellAspectsOf(w).filter((a) => !usedValues.has(a.value));
    if (aspects.length === 0) continue;
    // Prefer "word" form if available, otherwise a random shell aspect.
    const preferred = aspects.find((a) => a.type === "word") ?? pickRandom(aspects);
    items.push(preferred);
    sources.push(w);
    usedValues.add(preferred.value);
  }

  // Need at least `minItems` for any game to be meaningful.
  if (items.length < Math.min(minItems, n)) return null;
  return { items, sources };
}

/**
 * Build a question for a "game" format (Shell / Card / Marble).
 *
 * Each card/shell/slot on the board displays ONE aspect of its source word
 * (the "option" aspect). The QUESTION can ask about ANY aspect of that
 * source word besides `definition` and `explanation` (which are too long
 * to display). The question aspect can be the SAME as the option aspect
 * (trivial: "find the card that says X") or a DIFFERENT aspect (harder:
 * "find the card whose translation is X" when the card displays the word).
 *
 * To avoid ambiguous questions, the question aspect value must NOT appear
 * as any aspect value of any OTHER source word on the board. Otherwise the
 * user couldn't uniquely identify the correct card.
 *
 * @param targetWord   The source word of the correct card.
 * @param optionAspect The aspect displayed on the correct card.
 * @param allSources   All source words on the board (including targetWord).
 * @returns A question aspect (with type + value) that uniquely identifies
 *          the target card, or null if no unambiguous question can be built.
 */
export function buildGameQuestion(
  targetWord: WordEntry,
  optionAspect: Aspect,
  allSources: WordEntry[]
): Aspect | null {
  // Candidate question aspects: any aspect of targetWord besides def/expl.
  const candidates = getAspects(targetWord).filter(
    (a) => a.type !== "definition" && a.type !== "explanation" && a.value.trim().length > 0
  );
  if (candidates.length === 0) return null;

  // For each OTHER source word on the board, collect ALL of its aspect values
  // (regardless of type) so we can detect ambiguity. If the question value
  // appears anywhere in another word's aspects, the question is ambiguous.
  const otherAspectValues = new Set<string>();
  for (const w of allSources) {
    if (w === targetWord) continue;
    for (const a of getAspects(w)) {
      if (a.value.trim().length > 0) otherAspectValues.add(a.value);
    }
  }

  // Prefer a DIFFERENT aspect from the option (so the question is non-trivial
  // — the user has to actually know the word, not just match text).
  // Fall back to the option aspect itself if no different aspect is available.
  const different = candidates.filter((a) => a.value !== optionAspect.value);
  const preferred = different.length > 0 ? different : candidates;

  // Among preferred, find one whose value is unique across all other source
  // words' aspects (no ambiguity).
  const unambiguous = preferred.filter((a) => !otherAspectValues.has(a.value));
  if (unambiguous.length > 0) {
    return pickRandom(unambiguous);
  }

  // If no different-aspect question is unambiguous, try the option aspect
  // itself (the trivial "find the card that says X" form). This is always
  // unambiguous because option values are unique across the board.
  const optionInCandidates = candidates.find((a) => a.value === optionAspect.value);
  if (optionInCandidates && !otherAspectValues.has(optionInCandidates.value)) {
    return optionInCandidates;
  }

  return null;
}
