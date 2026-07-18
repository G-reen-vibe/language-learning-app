"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormatComponentProps, nForMastery } from "./format-types";
import { buildSpotTheLie } from "@/lib/format-helpers";
import { QuestionResult } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Q {
  sourceWordKeys: string[];
  pairs: { left: string; right: string; correct: boolean }[];
  lieIndex: number;
}

export default function SpotTheLieFormat({
  lesson,
  eligibleWords,
  onResult,
  onDone,
  remainingBudget,
}: FormatComponentProps) {
  const defaultCount = 3;
  const numQuestions = Math.min(defaultCount, remainingBudget, eligibleWords.length);

  const questions = useMemo<Q[]>(() => {
    const out: Q[] = [];
    let attempts = 0;
    const eligibleWordEntries = eligibleWords.map((ew) => ew.word);
    while (out.length < numQuestions && attempts < numQuestions * 6) {
      attempts++;
      // Avg mastery is now a continuous value in [0, 1] — pass directly.
      const avgMastery = eligibleWords.length === 0 ? 0 :
        eligibleWords.reduce((s, w) => s + w.state.mastery, 0) / eligibleWords.length;
      const n = nForMastery(avgMastery, 6);
      const built = buildSpotTheLie(eligibleWordEntries, n);
      if (built) {
        out.push({
          sourceWordKeys: built.sourceWordKeys,
          pairs: built.pairs,
          lieIndex: built.lieIndex,
        });
      }
    }
    return out;
  }, [eligibleWords, numQuestions]);

  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
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
    (pairIdx: number) => {
      if (selected !== null) return;
      setSelected(pairIdx);
      const correct = pairIdx === current.lieIndex;
      for (const wk of current.sourceWordKeys) {
        const r: QuestionResult = {
          wordKey: wk,
          correct,
          quality: correct ? 5 : 1,
        };
        setResults((prev) => [...prev, r]);
        onResult(r);
      }
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

  return (
    <div className="flex flex-col items-center gap-5 max-w-2xl mx-auto w-full">
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-center text-sm text-muted-foreground">
            Question {idx + 1} of {questions.length} — Spot the Lie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            One of these pairings is wrong. Tap the lie.
          </div>
          <div className="space-y-2">
            {current.pairs.map((p, i) => {
              const isLie = i === current.lieIndex;
              const isSelected = i === selected;
              const showState = answered && (isLie || isSelected);
              return (
                <motion.button
                  key={i}
                  whileHover={!answered ? { x: 2 } : {}}
                  onClick={() => handleSelect(i)}
                  disabled={answered}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border p-4 transition-all text-left",
                    !showState && "border-border bg-card hover:border-primary/40",
                    showState && isLie && "border-emerald-500 bg-emerald-500/10",
                    showState && isSelected && !isLie && "border-rose-500 bg-rose-500/10"
                  )}
                >
                  <span className="flex-1 text-base font-medium truncate">{p.left}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="flex-1 text-base font-medium truncate text-right">{p.right}</span>
                </motion.button>
              );
            })}
          </div>
          {answered && (
            <div className="text-center text-sm">
              {selected === current.lieIndex ? (
                <span className="text-emerald-600 font-medium">✓ Correct! You found the lie.</span>
              ) : (
                <span className="text-rose-600 font-medium">✗ Wrong. The lie was highlighted in green.</span>
              )}
            </div>
          )}
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
