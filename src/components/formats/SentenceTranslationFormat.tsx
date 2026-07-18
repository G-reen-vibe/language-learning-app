"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormatComponentProps, distractorCount } from "./format-types";
import { pickRandom, shuffle, sampleN, getWordForms, wordKeyOf } from "@/lib/aspects";
import { parseSentence } from "@/lib/session";
import { playSound } from "@/lib/sounds";
import { QuestionResult, WordEntry, WordState } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SentenceQ {
  sentence: { exert: string; translation: string };
  blankTokenIndices: number[];
  correctWords: string[];
  wordKeys: (string | null)[];
  pieces: string[];
  tokens: { text: string; translation: string | null; isBlank: boolean; showTranslation: boolean }[];
}

const DIFF3_MASTERY = 3;

function findLessonWordMatch(
  text: string,
  lessonWords: WordEntry[]
): WordEntry | null {
  const lower = text.toLowerCase();
  for (const w of lessonWords) {
    const forms = getWordForms(w).map((f) => f.value.toLowerCase());
    if (forms.includes(lower)) return w;
  }
  return null;
}

export default function SentenceTranslationFormat({
  lesson,
  eligibleWords,
  onResult,
  onDone,
  remainingBudget,
}: FormatComponentProps) {
  const defaultCount = 2;
  const numQuestions = Math.min(defaultCount, remainingBudget, eligibleWords.length);

  const questions = useMemo<SentenceQ[]>(() => {
    const out: SentenceQ[] = [];
    const used = new Set<string>();
    // Pre-filter: only consider words that have at least one sentence with
    // 2+ SEEN lesson-word tokens. This prevents the retry loop from wasting
    // attempts on words that can never produce a question.
    const suitableEligible = eligibleWords.filter(({ word }) => {
      if (!word.sentences || word.sentences.length === 0) return false;
      return word.sentences.some((s) => {
        const parsed = parseSentence(s.exert);
        if (parsed.tokens.length < 3) return false;
        let seenCount = 0;
        for (const t of parsed.tokens) {
          if (!t.translation) continue;
          const clean = t.text.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
          if (!clean) continue;
          const match = findLessonWordMatch(clean, lesson.words);
          if (match) {
            const k = wordKeyOf(match);
            const state = lesson.wordStates[k];
            if (state && state.seen) seenCount++;
          }
        }
        return seenCount >= 2;
      });
    });
    let attempts = 0;
    while (out.length < numQuestions && attempts < numQuestions * 8 && suitableEligible.length > 0) {
      attempts++;
      const remaining = suitableEligible.filter((p) => !used.has(wordKeyOf(p.word)));
      const candidates = remaining.length > 0 ? remaining : suitableEligible;
      const target = pickRandom(candidates);
      if (!target.word.sentences || target.word.sentences.length === 0) continue;
      const sentence = pickRandom(target.word.sentences);
      const parsed = parseSentence(sentence.exert);
      if (parsed.tokens.length < 3) continue;

      // Find tokens that are lesson words (for blanking)
      const tokenMatches: { idx: number; word: WordEntry; state: WordState | undefined }[] = [];
      for (let i = 0; i < parsed.tokens.length; i++) {
        const t = parsed.tokens[i];
        if (!t.translation) continue;
        if (!t.text.trim()) continue;
        const cleanText = t.text.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
        if (!cleanText) continue;
        const match = findLessonWordMatch(cleanText, lesson.words);
        if (match) {
          const k = wordKeyOf(match);
          const state = lesson.wordStates[k];
          tokenMatches.push({ idx: i, word: match, state });
        }
      }
      if (tokenMatches.length < 2) continue;

      const mastery = target.state.mastery;
      // Only blank SEEN words (blanking unseen words would be unfair to the user).
      const blankCandidates = tokenMatches.filter((t) => t.state && t.state.seen);
      if (blankCandidates.length < 2) continue; // need at least 2 seen tokens to blank
      // Sentence Translation: MORE blanks than sentence comprehension.
      // nBlanks: 2-5, scaling with mastery
      const nBlanks = Math.min(
        Math.max(2, blankCandidates.length),
        Math.min(5, 3 + Math.floor(mastery / 2))
      );
      const nDistractors = distractorCount(mastery) + 1; // slightly more distractors

      const chosen = sampleN(blankCandidates, Math.min(nBlanks, blankCandidates.length));
      const blankTokenIndicesSet = new Set(chosen.map((c) => c.idx));

      const blankTokenIndices = chosen.map((c) => c.idx).sort((a, b) => a - b);
      const correctWords = blankTokenIndices.map((idx) => parsed.tokens[idx].text);
      const wordKeys = blankTokenIndices.map((idx) => {
        const match = tokenMatches.find((m) => m.idx === idx);
        return match ? wordKeyOf(match.word) : null;
      });

      // distractors: other word forms from the lesson
      // Use case-insensitive comparison so that a capitalized sentence token
      // (e.g. "Gato") correctly excludes the lowercase word form ("gato")
      // from the distractor pool. Otherwise the user would see both "Gato"
      // (correct) and "gato" (distractor) as pieces, which is confusing.
      const correctWordsLower = correctWords.map((w) => w.toLowerCase());
      const distractorPool: string[] = [];
      for (const w of lesson.words) {
        const forms = getWordForms(w);
        for (const f of forms) {
          if (!correctWordsLower.includes(f.value.toLowerCase()) && f.value.length >= 2) {
            distractorPool.push(f.value);
          }
        }
      }
      const distractors = sampleN(Array.from(new Set(distractorPool)), nDistractors);
      const pieces = shuffle([...correctWords, ...distractors]);

      // build display tokens — ALL bracket translations removed for mastery >= 3 words
      // (per spec: "all words with some mastery equal to the requirement to reach difficulty 3
      //  have their bracket translations removed")
      const tokens = parsed.tokens.map((t, i) => {
        const isBlank = blankTokenIndicesSet.has(i);
        let showTranslation = true;
        if (t.translation) {
          const cleanText = t.text.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
          const match = findLessonWordMatch(cleanText, lesson.words);
          if (match) {
            const k = wordKeyOf(match);
            const state = lesson.wordStates[k];
            if (state && state.mastery >= DIFF3_MASTERY) {
              showTranslation = false;
            }
          }
        }
        return {
          text: t.text,
          translation: t.translation,
          isBlank,
          showTranslation,
        };
      });

      out.push({
        sentence: { exert: sentence.exert, translation: sentence.translation },
        blankTokenIndices,
        correctWords,
        wordKeys,
        pieces,
        tokens,
      });
      used.add(wordKeyOf(target.word));
    }
    return out;
  }, [eligibleWords, lesson.words, numQuestions]);

  const [idx, setIdx] = useState(0);
  const [placed, setPlaced] = useState<(number | null)[]>([]);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [completed, setCompleted] = useState(false);
  const [feedback, setFeedback] = useState<"none" | "correct" | "wrong">("none");

  const current = questions[idx];

  useEffect(() => {
    if (questions.length === 0 && !completed) {
      setCompleted(true);
      onDone([], 0);
    }
  }, [questions.length, completed, onDone]);

  useEffect(() => {
    setPlaced(new Array(current?.blankTokenIndices.length || 0).fill(null));
    setFeedback("none");
  }, [idx, current]);

  const handlePieceClick = useCallback(
    (pieceIdx: number) => {
      if (feedback !== "none") return;
      const emptySlot = placed.findIndex((p) => p === null);
      if (emptySlot === -1) return;
      if (placed.includes(pieceIdx)) return;
      setPlaced((prev) => {
        const next = [...prev];
        next[emptySlot] = pieceIdx;
        return next;
      });
      playSound("place");
    },
    [feedback, placed]
  );

  const handleBlankClick = useCallback(
    (blankIdx: number) => {
      if (feedback !== "none") return;
      setPlaced((prev) => {
        const next = [...prev];
        next[blankIdx] = null;
        return next;
      });
    },
    [feedback]
  );

  const handleSubmit = useCallback(() => {
    if (feedback !== "none") return;
    if (placed.some((p) => p === null)) return;
    const built = placed.map((p) => current.pieces[p!]);
    // Case-insensitive comparison: sentence tokens may have different casing than word forms.
    const correct = built.every((w, i) => w.toLowerCase() === current.correctWords[i].toLowerCase());
    setFeedback(correct ? "correct" : "wrong");
    const newResults: QuestionResult[] = current.wordKeys.map((wk, i) => {
      const isCorrect = built[i].toLowerCase() === current.correctWords[i].toLowerCase();
      return {
        wordKey: wk || wordKeyOf(current.correctWords[i]),
        correct: isCorrect,
        quality: isCorrect ? 5 : 1,
      };
    });
    // Reorder results so wrong ones come first. The parent's handleResult
    // plays a debounced sound based on the FIRST result — by putting wrong
    // results first, the user hears "wrong" if ANY blank is wrong, and
    // "correct" only if ALL blanks are correct.
    newResults.sort((a, b) => (a.correct === b.correct ? 0 : a.correct ? 1 : -1));
    setResults((prev) => [...prev, ...newResults]);
    for (const r of newResults) onResult(r);
  }, [feedback, placed, current, onResult]);

  const handleNext = useCallback(() => {
    if (idx + 1 >= questions.length) {
      if (!completed) {
        setCompleted(true);
        onDone(results, questions.length);
      }
    } else {
      setIdx(idx + 1);
    }
  }, [idx, questions.length, results, onDone, completed]);

  if (questions.length === 0 || !current) return null;

  let blankCounter = 0;
  return (
    <div className="flex flex-col items-center gap-5 max-w-3xl mx-auto w-full">
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-center text-sm text-muted-foreground">
            Question {idx + 1} of {questions.length} — Sentence Translation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Show the translation as the prompt */}
          <div className="relative rounded-xl border border-primary/30 bg-card p-5 text-center">
            <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wide text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted/60">
              Translate this
            </span>
            <div className="mt-2 text-lg font-semibold">{current.sentence.translation}</div>
          </div>

          {/* The sentence with blanks */}
          <div className="rounded-xl border border-border p-5 bg-muted/20">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 text-center">
              Fill in the blanks
            </div>
            <div className="text-center text-xl leading-relaxed">
              {current.tokens.map((t, i) => {
                if (t.isBlank) {
                  const blankIdx = blankCounter++;
                  const pieceIdx = placed[blankIdx];
                  const filled = pieceIdx !== null && pieceIdx !== undefined;
                  return (
                    <button
                      key={i}
                      disabled={feedback !== "none"}
                      onClick={() => handleBlankClick(blankIdx)}
                      className={cn(
                        "inline-block mx-1 px-3 py-1 rounded-md border-2 min-w-20 transition-colors",
                        filled
                          ? feedback === "correct"
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : feedback === "wrong"
                            ? "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                            : "border-primary bg-primary/10"
                          : "border-dashed border-border"
                      )}
                    >
                      {filled ? current.pieces[pieceIdx!] : "____"}
                    </button>
                  );
                }
                return (
                  <span key={i}>
                    {t.text}
                    {t.translation && t.showTranslation && (
                      <span className="text-xs text-muted-foreground ml-0.5">
                        [{t.translation}]
                      </span>
                    )}
                    {" "}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Piece pool */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {current.pieces.map((p, i) => {
              const used = placed.includes(i);
              return (
                <motion.button
                  key={i}
                  whileHover={!used && feedback === "none" ? { scale: 1.05 } : {}}
                  whileTap={!used && feedback === "none" ? { scale: 0.95 } : {}}
                  disabled={used || feedback !== "none"}
                  onClick={() => handlePieceClick(i)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-base transition-all",
                    used
                      ? "opacity-30 border-muted border-dashed"
                      : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  {p}
                </motion.button>
              );
            })}
          </div>

          {feedback === "wrong" && (
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Correct: </span>
              <span className="font-semibold text-foreground">{current.correctWords.join(" | ")}</span>
            </div>
          )}
          {feedback === "correct" && (
            <div className="text-center text-sm text-emerald-600 font-medium">✓ Correct!</div>
          )}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        {feedback === "none" ? (
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={placed.some((p) => p === null)}
          >
            Submit
          </Button>
        ) : (
          <Button size="lg" onClick={handleNext} className="min-w-32">
            {idx + 1 >= questions.length ? "Finish" : "Next"}
          </Button>
        )}
      </div>
    </div>
  );
}
