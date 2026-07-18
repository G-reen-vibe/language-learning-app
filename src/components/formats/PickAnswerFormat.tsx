"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormatComponentProps, nForMastery } from "./format-types";
import { PromptCard } from "./PromptCard";
import { buildPickAnswer } from "@/lib/format-helpers";
import { pickRandom, wordKeyOf } from "@/lib/aspects";
import { QuestionResult, WordEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Q {
  target: WordEntry;
  question: string;
  correct: string;
  choices: string[];
}

export default function PickAnswerFormat({
  lesson,
  eligibleWords,
  onResult,
  onDone,
  remainingBudget,
}: FormatComponentProps) {
  const defaultCount = 4;
  const numQuestions = Math.min(defaultCount, remainingBudget, eligibleWords.length);

  const questions = useMemo<Q[]>(() => {
    const out: Q[] = [];
    const usedTargets = new Set<string>();
    const pool = [...eligibleWords];
    let attempts = 0;
    while (out.length < numQuestions && attempts < numQuestions * 5) {
      attempts++;
      const remaining = pool.filter((p) => !usedTargets.has(wordKeyOf(p.word)));
      const candidates = remaining.length > 0 ? remaining : pool;
      const target = pickRandom(candidates);
      const mastery = target.state.mastery;
      const n = nForMastery(mastery, 6);
      const built = buildPickAnswer(target.word, lesson.words, n);
      if (built) {
        out.push({
          target: target.word,
          question: built.question,
          correct: built.correct,
          choices: built.choices,
        });
        usedTargets.add(wordKeyOf(target.word));
      }
    }
    return out;
  }, [eligibleWords, lesson.words, numQuestions]);

  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [completed, setCompleted] = useState(false);

  const current = questions[idx];

  useEffect(() => {
    if (questions.length === 0 && !completed) {
      setCompleted(true);
      onDone([], 0);
    }
  }, [questions.length, completed, onDone]);

  const handleSelect = useCallback(
    (choice: string) => {
      if (selected !== null) return;
      setSelected(choice);
      const correct = choice === current.correct;
      const r: QuestionResult = {
        wordKey: wordKeyOf(current.target),
        correct,
        quality: correct ? 5 : 1,
      };
      setResults((prev) => [...prev, r]);
      onResult(r);
    },
    [selected, current, onResult]
  );

  const handleNext = useCallback(() => {
    if (idx + 1 >= questions.length) {
      if (!completed) {
        setCompleted(true);
        onDone(results, questions.length);
      }
    } else {
      setIdx(idx + 1);
      setSelected(null);
    }
  }, [idx, questions.length, results, onDone, completed]);

  if (questions.length === 0 || !current) return null;

  const answered = selected !== null;
  const numOptions = current.choices.length;

  return (
    <div className="flex flex-col items-center gap-5 max-w-2xl mx-auto w-full">
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-center text-sm text-muted-foreground">
            Question {idx + 1} of {questions.length} — Pick the Answer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <PromptCard text={current.question} size="lg" />

          <div
            className={cn(
              "grid gap-2",
              numOptions <= 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"
            )}
          >
            {current.choices.map((c, i) => {
              const isCorrect = c === current.correct;
              const isSelected = c === selected;
              const showState = answered && (isCorrect || isSelected);
              return (
                <motion.button
                  key={i}
                  whileHover={!answered ? { scale: 1.02 } : {}}
                  whileTap={!answered ? { scale: 0.98 } : {}}
                  onClick={() => handleSelect(c)}
                  disabled={answered}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-base font-medium transition-all text-left break-words",
                    !showState && "border-border bg-card hover:border-primary/40",
                    showState && isCorrect && "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                    showState && isSelected && !isCorrect && "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                  )}
                >
                  {c}
                </motion.button>
              );
            })}
          </div>
        </CardContent>
      </Card>
      {answered && (
        <Button size="lg" onClick={handleNext} className="min-w-32">
          {idx + 1 >= questions.length ? "Finish" : "Next"}
        </Button>
      )}
    </div>
  );
}
