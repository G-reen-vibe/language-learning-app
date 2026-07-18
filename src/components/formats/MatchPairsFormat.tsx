"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormatComponentProps, nForMastery } from "./format-types";
import { buildMatchPairs } from "@/lib/format-helpers";
import { shuffle } from "@/lib/aspects";
import { QuestionResult, AspectType } from "@/lib/types";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface MatchQ {
  pairs: { left: string; right: string; wordKey: string }[];
  leftItems: string[];
  rightItems: string[];
}

export default function MatchPairsFormat({
  lesson,
  eligibleWords,
  onResult,
  onDone,
}: FormatComponentProps) {
  // Avg mastery is now a continuous value in [0, 1]. Pass it directly to
  // nForMastery — the helper handles the [0,1] mapping.
  const avgMastery =
    eligibleWords.length === 0
      ? 0
      : eligibleWords.reduce((s, w) => s + w.state.mastery, 0) / eligibleWords.length;
  const nPairs = nForMastery(avgMastery, 6);

  const matchQ = useMemo<MatchQ | null>(() => {
    const aspectTypes: AspectType[] = ["translation", "synonym", "alt1", "alt2", "alt3"];
    const eligibleWordEntries = eligibleWords.map((ew) => ew.word);
    let best: { type: AspectType; pairs: ReturnType<typeof buildMatchPairs> } | null = null;
    const shuffledTypes = shuffle(aspectTypes);
    for (const t of shuffledTypes) {
      const pairs = buildMatchPairs(eligibleWordEntries, t, nPairs);
      if (pairs) {
        best = { type: t, pairs };
        break;
      }
    }
    if (!best || !best.pairs) return null;
    return {
      pairs: best.pairs,
      leftItems: shuffle(best.pairs.map((p) => p.left)),
      rightItems: shuffle(best.pairs.map((p) => p.right)),
    };
  }, [eligibleWords, nPairs]);

  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"none" | "correct" | "wrong">("none");
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (matchQ) {
      const init: Record<string, string | null> = {};
      for (const item of matchQ.leftItems) init[item] = null;
      setAssignments(init);
      setFeedback("none");
      setSelectedLeft(null);
    }
  }, [matchQ]);

  useEffect(() => {
    if (!matchQ && !completed) {
      setCompleted(true);
      onDone([], 0);
    }
  }, [matchQ, completed, onDone]);

  const assignedCount = matchQ
    ? matchQ.leftItems.filter((l) => assignments[l] !== null && assignments[l] !== undefined).length
    : 0;
  const allAssigned = matchQ ? assignedCount === matchQ.pairs.length : false;

  // Count correct matches (for feedback)
  const correctCount = matchQ
    ? matchQ.pairs.filter((p) => assignments[p.left] === p.right).length
    : 0;

  const handleLeftClick = useCallback(
    (left: string) => {
      if (feedback !== "none") return;
      if (assignments[left]) return;
      playSound("click");
      // Toggle selection
      setSelectedLeft((prev) => (prev === left ? null : left));
    },
    [feedback, assignments]
  );

  const handleRightClick = useCallback(
    (right: string) => {
      if (feedback !== "none") return;
      if (!matchQ) return;
      // Check if right is already assigned to a left
      const usedBy = matchQ.leftItems.find((l) => assignments[l] === right);
      if (usedBy) {
        // Unassign it
        playSound("click");
        setAssignments((prev) => ({ ...prev, [usedBy]: null }));
        setSelectedLeft(null);
        return;
      }
      // If a left is selected, match them
      if (selectedLeft !== null) {
        playSound("place");
        setAssignments((prev) => ({ ...prev, [selectedLeft]: right }));
        setSelectedLeft(null);
      } else {
        // No left selected — give subtle audio feedback so the user knows
        // they need to pick a word on the left first.
        playSound("click");
      }
    },
    [feedback, assignments, selectedLeft, matchQ]
  );

  const handleSubmit = useCallback(() => {
    if (feedback !== "none") return;
    if (!matchQ || !allAssigned) return;

    let allCorrect = true;
    const results: QuestionResult[] = [];
    for (const p of matchQ.pairs) {
      const assigned = assignments[p.left];
      const isCorrect = assigned === p.right;
      if (!isCorrect) allCorrect = false;
      results.push({
        wordKey: p.wordKey,
        correct: isCorrect,
        quality: isCorrect ? 5 : 1,
      });
    }
    // Reorder results so wrong ones come first. The parent's handleResult
    // plays a debounced sound based on the FIRST result — by putting wrong
    // results first, the user hears "wrong" if ANY pair is wrong, and
    // "correct" only if ALL pairs are correct.
    results.sort((a, b) => (a.correct === b.correct ? 0 : a.correct ? 1 : -1));
    setFeedback(allCorrect ? "correct" : "wrong");
    for (const r of results) onResult(r);
  }, [feedback, matchQ, allAssigned, assignments, onResult]);

  const handleNext = useCallback(() => {
    if (!completed) {
      setCompleted(true);
      onDone([], 1);
    }
  }, [completed, onDone]);

  if (!matchQ) return null;

  // Build right → left map
  const rightToleft: Record<string, string | null> = {};
  for (const left of matchQ.leftItems) {
    const r = assignments[left];
    if (r) rightToleft[r] = left;
  }

  return (
    <div className="flex flex-col items-center gap-5 max-w-3xl mx-auto w-full">
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-center text-sm text-muted-foreground">
            Match Pairs — Match all {matchQ.pairs.length} pairs ({assignedCount}/{matchQ.pairs.length} assigned)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center text-sm text-muted-foreground">
            Tap a word on the left, then tap its match on the right. Tap an assigned right item to unassign it.
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Left column */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">Word</div>
              {matchQ.leftItems.map((left, i) => {
                const assigned = assignments[left];
                const isSelected = selectedLeft === left;
                const isAssigned = !!assigned;
                const pair = matchQ.pairs.find((p) => p.left === left);
                const isCorrect = feedback !== "none" && pair && pair.right === assigned;
                const isWrong = feedback !== "none" && isAssigned && pair && pair.right !== assigned;
                return (
                  <button
                    key={i}
                    disabled={feedback !== "none" || isAssigned}
                    onClick={() => handleLeftClick(left)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-sm font-medium transition-all text-left",
                      feedback === "none" && !isAssigned && !isSelected && "border-border bg-card hover:border-primary/40",
                      feedback === "none" && isSelected && "border-primary bg-primary/10 ring-2 ring-primary/30",
                      feedback === "none" && isAssigned && "border-primary/50 bg-primary/5",
                      isCorrect && "border-emerald-500 bg-emerald-500/10",
                      isWrong && "border-rose-500 bg-rose-500/10"
                    )}
                  >
                    <div className="truncate">{left}</div>
                    {isAssigned && (
                      <div className={cn("mt-1 text-[10px]", isWrong ? "text-rose-500 line-through" : "text-muted-foreground")}>
                        → {assigned}
                      </div>
                    )}
                    {isWrong && (
                      <div className="mt-0.5 text-[10px] text-emerald-600">
                        ✓ {pair?.right}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right column */}
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground text-center">Match</div>
              {matchQ.rightItems.map((right, i) => {
                const assignedToLeft = rightToleft[right];
                const isAssigned = !!assignedToLeft;
                const pair = matchQ.pairs.find((p) => p.right === right);
                const isCorrectMatch = feedback !== "none" && pair && pair.left === assignedToLeft;
                const isWrongMatch = feedback !== "none" && isAssigned && pair && pair.left !== assignedToLeft;
                const isCorrectAnswerForWrong = feedback !== "none" && !isCorrectMatch &&
                  matchQ.leftItems.some((l) => l === pair?.left && assignments[l] !== pair?.right);
                return (
                  <button
                    key={i}
                    disabled={feedback !== "none"}
                    onClick={() => handleRightClick(right)}
                    className={cn(
                      "w-full rounded-lg border p-3 text-sm font-medium transition-all text-left",
                      feedback === "none" && !isAssigned && "border-border bg-card hover:border-primary/40",
                      feedback === "none" && isAssigned && "border-primary/50 bg-primary/5",
                      isCorrectMatch && "border-emerald-500 bg-emerald-500/10",
                      isWrongMatch && "border-rose-500 bg-rose-500/10",
                      isCorrectAnswerForWrong && "border-emerald-500/60 bg-emerald-500/5"
                    )}
                  >
                    <div className="truncate">{right}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {feedback === "correct" && (
            <div className="text-center text-sm text-emerald-600 font-medium">
              All pairs matched correctly! ✓
            </div>
          )}
          {feedback === "wrong" && (
            <div className="text-center text-sm text-rose-600 font-medium">
              {correctCount}/{matchQ.pairs.length} correct. Green = right, Red = wrong.
            </div>
          )}
        </CardContent>
      </Card>

      {feedback === "none" ? (
        <Button size="lg" onClick={handleSubmit} disabled={!allAssigned}>
          <Check className="h-4 w-4 mr-1" /> Submit
        </Button>
      ) : (
        <Button size="lg" onClick={handleNext} className="min-w-32">
          Next
        </Button>
      )}
    </div>
  );
}
