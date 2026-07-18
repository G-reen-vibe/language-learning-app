"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormatComponentProps, distractorCount, hintCount } from "./format-types";
import { PromptCard } from "./PromptCard";
import { buildScrambleOrFill } from "@/lib/format-helpers";
import { pickRandom, shuffle, sampleN, getAspects, wordKeyOf, ASPECT_LABELS } from "@/lib/aspects";
import { QuestionResult, WordEntry, AspectType } from "@/lib/types";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { RotateCcw, Check } from "lucide-react";

interface ScrambleQ {
  target: WordEntry;
  questionText: string;
  questionAspectType: AspectType;
  answerText: string;
  answerAspectType: AspectType;
  answerElements: string[];
  isMultiWord: boolean;
  wordKey: string;
  hintPositions: number[];
  pieces: string[];
  correctSequence: string[];
}

function generateDistractors(
  answerElements: string[],
  isMultiWord: boolean,
  count: number,
  allWords: WordEntry[]
): string[] {
  if (isMultiWord) {
    const pool: string[] = [];
    for (const w of allWords) {
      for (const a of getAspects(w)) {
        if (!a.value.includes(" ") && a.value.length >= 2 && a.value.length <= 12) {
          pool.push(a.value);
        }
      }
    }
    const filtered = pool.filter((v) => !answerElements.includes(v));
    const distinct = Array.from(new Set(filtered));
    return sampleN(distinct, count);
  } else {
    const alpha = "abcdefghijklmnopqrstuvwxyz";
    const used = new Set(answerElements.map((c) => c.toLowerCase()));
    const pool = alpha.split("").filter((c) => !used.has(c));
    return shuffle(pool).slice(0, count);
  }
}

export default function WordScrambleFormat({
  lesson,
  eligibleWords,
  onResult,
  onDone,
  remainingBudget,
}: FormatComponentProps) {
  const defaultCount = 3;
  const numQuestions = Math.min(defaultCount, remainingBudget, eligibleWords.length);

  const questions = useMemo<ScrambleQ[]>(() => {
    const out: ScrambleQ[] = [];
    const used = new Set<string>();
    let attempts = 0;
    while (out.length < numQuestions && attempts < numQuestions * 6) {
      attempts++;
      const remaining = eligibleWords.filter((p) => !used.has(wordKeyOf(p.word)));
      const candidates = remaining.length > 0 ? remaining : eligibleWords;
      const target = pickRandom(candidates);
      const built = buildScrambleOrFill(target.word, { fillMode: "scramble" });
      if (!built) continue;
      const mastery = target.state.mastery;
      const nDistractors = distractorCount(mastery);
      const nHints = hintCount(built.answerElements.length, mastery);
      const hintPositions = chooseHintPositions(built.answerElements.length, nHints);
      const nonHintElements = built.answerElements.filter((_, i) => !hintPositions.includes(i));
      const distractors = generateDistractors(
        built.answerElements,
        built.isMultiWord,
        nDistractors,
        lesson.words
      );
      const pieces = shuffle([...nonHintElements, ...distractors]);
      out.push({
        target: target.word,
        questionText: built.questionText,
        questionAspectType: built.questionAspectType,
        answerText: built.answerText,
        answerAspectType: built.answerAspectType,
        answerElements: built.answerElements,
        isMultiWord: built.isMultiWord,
        wordKey: built.wordKey,
        hintPositions,
        pieces,
        correctSequence: nonHintElements,
      });
      used.add(wordKeyOf(target.word));
    }
    return out;
  }, [eligibleWords, lesson.words, numQuestions]);

  const [idx, setIdx] = useState(0);
  const [placedIdxs, setPlacedIdxs] = useState<number[]>([]);
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
    setPlacedIdxs([]);
    setFeedback("none");
  }, [idx]);

  const handlePieceClick = useCallback(
    (pieceIdx: number) => {
      if (feedback !== "none") return;
      if (placedIdxs.includes(pieceIdx)) return;
      if (placedIdxs.length >= current.correctSequence.length) return;
      playSound("place");
      setPlacedIdxs((prev) => [...prev, pieceIdx]);
    },
    [feedback, placedIdxs, current]
  );

  const handleSlotRemove = useCallback(
    (placedSlotIdx: number) => {
      if (feedback !== "none") return;
      if (placedSlotIdx < 0 || placedSlotIdx >= placedIdxs.length) return;
      playSound("click");
      setPlacedIdxs((prev) => {
        const next = [...prev];
        next.splice(placedSlotIdx, 1);
        return next;
      });
    },
    [feedback, placedIdxs]
  );

  const handleClear = useCallback(() => {
    if (feedback !== "none") return;
    if (placedIdxs.length === 0) return;
    playSound("click");
    setPlacedIdxs([]);
  }, [feedback, placedIdxs]);

  const handleSubmit = useCallback(() => {
    if (feedback !== "none") return;
    const built = placedIdxs.map((i) => current.pieces[i]);
    const correct = arraysEqual(built, current.correctSequence);
    setFeedback(correct ? "correct" : "wrong");
    const r: QuestionResult = {
      wordKey: current.wordKey,
      correct,
      quality: correct ? 5 : 1,
    };
    setResults((prev) => [...prev, r]);
    onResult(r);
  }, [feedback, placedIdxs, current, onResult]);

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

  // Build display slots
  const displaySlots: (
    | { type: "hint"; value: string; placedIdx: -1 }
    | { type: "filled"; value: string; placedIdx: number }
    | { type: "empty"; placedIdx: -1 }
  )[] = [];
  let placedPtr = 0;
  for (let i = 0; i < current.answerElements.length; i++) {
    if (current.hintPositions.includes(i)) {
      displaySlots.push({ type: "hint", value: current.answerElements[i], placedIdx: -1 });
    } else if (placedPtr < placedIdxs.length) {
      displaySlots.push({ type: "filled", value: current.pieces[placedIdxs[placedPtr]], placedIdx: placedPtr });
      placedPtr++;
    } else {
      displaySlots.push({ type: "empty", placedIdx: -1 });
    }
  }

  const remainingSlots = current.correctSequence.length - placedIdxs.length;

  return (
    <div className="flex flex-col items-center gap-5 max-w-2xl mx-auto w-full">
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-center text-sm text-muted-foreground">
            Question {idx + 1} of {questions.length} — Word Scramble
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="text-center text-sm text-muted-foreground">
            Arrange to form the <span className="font-semibold text-foreground">{ASPECT_LABELS[current.answerAspectType]}</span> for:
          </div>
          <PromptCard label={ASPECT_LABELS[current.questionAspectType]} text={current.questionText} size="md" />

          {/* Answer slots */}
          <div className="flex flex-wrap items-center justify-center gap-2 min-h-[60px] rounded-lg border-2 border-dashed border-border p-4 bg-muted/20">
            {displaySlots.map((slot, i) => {
              if (slot.type === "hint") {
                return (
                  <span
                    key={i}
                    className="inline-flex items-center justify-center min-w-[36px] h-10 px-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-300"
                  >
                    {slot.value}
                  </span>
                );
              }
              if (slot.type === "filled") {
                return (
                  <motion.button
                    type="button"
                    key={i}
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    className={cn(
                      "inline-flex items-center justify-center min-w-[36px] h-10 px-2 rounded-md border text-sm font-mono font-semibold cursor-pointer transition-colors",
                      feedback === "correct" && "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                      feedback === "wrong" && "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300",
                      feedback === "none" && "border-primary bg-primary/10 hover:bg-primary/20"
                    )}
                    onClick={() => handleSlotRemove(slot.placedIdx)}
                    aria-label={`Remove tile ${slot.value}`}
                  >
                    {slot.value}
                  </motion.button>
                );
              }
              return (
                <span
                  key={i}
                  className="inline-flex items-center justify-center min-w-[36px] h-10 px-2 rounded-md border border-dashed border-muted-foreground/30 text-sm text-muted-foreground/40"
                >
                  _
                </span>
              );
            })}
          </div>

          {/* Tile pool */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {current.pieces.map((p, i) => {
              const used = placedIdxs.includes(i);
              return (
                <motion.button
                  key={i}
                  whileHover={!used && feedback === "none" ? { scale: 1.05 } : {}}
                  whileTap={!used && feedback === "none" ? { scale: 0.95 } : {}}
                  onClick={() => handlePieceClick(i)}
                  disabled={used || feedback !== "none"}
                  className={cn(
                    "inline-flex items-center justify-center min-w-[36px] h-10 px-2 rounded-md border text-sm font-mono font-semibold transition-all",
                    !used && "border-border bg-card hover:border-primary/40",
                    used && "opacity-30 border-muted border-dashed"
                  )}
                >
                  {p}
                </motion.button>
              );
            })}
          </div>

          {feedback !== "none" && (
            <div className="text-center text-sm">
              {feedback === "correct" ? (
                <span className="text-emerald-600 font-medium">✓ Correct!</span>
              ) : (
                <span className="text-muted-foreground">
                  Correct answer: <span className="font-semibold text-foreground">{current.answerText}</span>
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {feedback === "none" ? (
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={handleClear} disabled={placedIdxs.length === 0}>
            <RotateCcw className="h-4 w-4 mr-1" /> Clear
          </Button>
          <Button onClick={handleSubmit} disabled={remainingSlots > 0}>
            <Check className="h-4 w-4 mr-1" /> Submit
          </Button>
        </div>
      ) : (
        <Button size="lg" onClick={handleNext} className="min-w-32">
          {idx + 1 >= questions.length ? "Finish" : "Next"}
        </Button>
      )}
    </div>
  );
}

function chooseHintPositions(total: number, nHints: number): number[] {
  if (nHints <= 0 || total <= 1) return [];
  const positions: number[] = [];
  const step = total / (nHints + 1);
  for (let i = 1; i <= nHints; i++) {
    const pos = Math.floor(step * i);
    if (pos < total && !positions.includes(pos)) positions.push(pos);
  }
  return positions;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
