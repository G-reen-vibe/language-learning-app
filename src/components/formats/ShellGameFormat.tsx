"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormatComponentProps } from "./format-types";
import { pickGameItems, buildGameQuestion } from "@/lib/format-helpers";
import { shuffle, wordKeyOf, ASPECT_LABELS } from "@/lib/aspects";
import { QuestionResult, Aspect } from "@/lib/types";
import { playSound } from "@/lib/sounds";

type Phase = "preview" | "shuffling" | "prompt" | "reveal";

interface Prompt {
  // The aspect the user is asked to find — can be ANY aspect of the source
  // word besides def/expl, not necessarily the aspect displayed on the shell.
  questionAspect: Aspect;
  correctShellIdx: number; // index into setup.shellItems
  wordKey: string; // for grading — the source word of the correct shell
}

const SHELL_W = 120; // px (w-28 = 7rem = 112px, but we use 120 for spacing)
const SHELL_GAP = 12; // px (gap-3)

export default function ShellGameFormat({
  lesson,
  eligibleWords,
  onResult,
  onDone,
  remainingBudget,
}: FormatComponentProps) {
  const defaultCount = 4;
  const numPrompts = Math.min(defaultCount, remainingBudget);

  // Setup: pick N shell items, ONE ASPECT PER WORD (different words) so each
  // shell represents a different concept. Falls back to multiple aspects per
  // word only if there aren't enough eligible words.
  const setup = useMemo(() => {
    if (eligibleWords.length === 0) return null;
    // Use the max mastery among eligible words to determine N — mirrors the
    // Flashcards app's L4 shell-game scaling:
    //   mastery < 0.80 → 3 shells
    //   mastery < 0.90 → 4 shells
    //   mastery < 0.95 → 5 shells
    //   mastery >= 0.95 → 6 shells
    // (Shell game's max N is 6 here.)
    const maxMastery = Math.max(...eligibleWords.map((ew) => ew.state.mastery));
    const n = maxMastery >= 0.95 ? 6
      : maxMastery >= 0.90 ? 5
      : maxMastery >= 0.80 ? 4
      : 3;
    const eligibleWordEntries = eligibleWords.map((ew) => ew.word);
    const result = pickGameItems(eligibleWordEntries, n);
    if (!result || result.items.length < 3) return null;
    return {
      shellItems: result.items,
      sources: result.sources,
    };
  }, [eligibleWords]);

  const prompts = useMemo<Prompt[]>(() => {
    if (!setup) return [];
    const indices = setup.shellItems.map((_, i) => i);
    const shuffled = shuffle(indices);
    const count = Math.min(numPrompts, shuffled.length);
    const out: Prompt[] = [];
    for (let i = 0; i < count; i++) {
      const idx = shuffled[i];
      const optionAspect = setup.shellItems[idx];
      const targetWord = setup.sources[idx];
      const questionAspect = buildGameQuestion(
        targetWord,
        optionAspect,
        setup.sources
      );
      if (!questionAspect) continue;
      out.push({
        questionAspect,
        correctShellIdx: idx,
        wordKey: wordKeyOf(targetWord),
      });
    }
    return out;
  }, [setup, numPrompts]);

  const [phase, setPhase] = useState<Phase>("preview");
  const [promptIdx, setPromptIdx] = useState(0);
  // positions[origIdx] = display position (0-based). Each shell tracks where it is on screen.
  const [positions, setPositions] = useState<number[]>([]);
  const [selectedShell, setSelectedShell] = useState<number | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);
  const [revealCorrect, setRevealCorrect] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up any pending timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Initialize positions: shell i is at display position i
  useEffect(() => {
    if (setup) {
      setPositions(setup.shellItems.map((_, i) => i));
    }
  }, [setup]);

  // Preview → shuffling (face down) → prompt
  const startShuffling = useCallback(() => {
    if (!setup) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    playSound("shuffle");
    setPhase("shuffling");

    const n = setup.shellItems.length;
    const totalSwaps = n;
    const swapInterval = 1200;
    let swapCount = 0;

    const doSwap = () => {
      if (swapCount >= totalSwaps) {
        setPhase("prompt");
        return;
      }
      swapCount++;
      setPositions((prev) => {
        const next = [...prev];
        const a = Math.floor(Math.random() * n);
        let b = Math.floor(Math.random() * n);
        while (b === a) b = Math.floor(Math.random() * n);
        const tmp = next[a];
        next[a] = next[b];
        next[b] = tmp;
        return next;
      });
      timerRef.current = setTimeout(doSwap, swapInterval);
    };
    timerRef.current = setTimeout(doSwap, 500);
  }, [setup]);

  useEffect(() => {
    if (!setup) return;
    timerRef.current = setTimeout(() => {
      startShuffling();
    }, 10000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [setup, startShuffling]);

  useEffect(() => {
    if ((!setup || prompts.length === 0) && !completed) {
      setCompleted(true);
      onDone([], 0);
    }
  }, [setup, prompts, completed, onDone]);

  const handleShellClick = useCallback(
    (origIdx: number) => {
      if (phase !== "prompt") return;
      if (selectedShell !== null) return;
      setSelectedShell(origIdx);
      const current = prompts[promptIdx];
      const correct = origIdx === current.correctShellIdx;
      setRevealCorrect(correct);
      const r: QuestionResult = {
        wordKey: current.wordKey,
        correct,
        quality: correct ? 5 : 1,
      };
      setResults((prev) => [...prev, r]);
      onResult(r);
      setPhase("reveal");
      timerRef.current = setTimeout(() => {
        setSelectedShell(null);
        setRevealCorrect(false);
        if (promptIdx + 1 >= prompts.length) {
          if (!completedRef.current) {
            completedRef.current = true;
            setCompleted(true);
            onDone([], prompts.length);
          }
        } else {
          setPromptIdx(promptIdx + 1);
          setPhase("prompt");
        }
      }, 1500);
    },
    [phase, selectedShell, prompts, promptIdx, onResult, onDone]
  );

  if (!setup || prompts.length === 0 || positions.length === 0) return null;

  const current = prompts[promptIdx];
  const n = setup.shellItems.length;
  // Compute total width for centering
  const totalWidth = n * SHELL_W + (n - 1) * SHELL_GAP;

  // Build a map: displayPos → origIdx (inverse of positions)
  const displayPosOfOrig: Record<number, number> = {};
  for (let origIdx = 0; origIdx < n; origIdx++) {
    displayPosOfOrig[origIdx] = positions[origIdx];
  }

  return (
    <div className="flex flex-col items-center gap-6 max-w-3xl mx-auto w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-center text-lg text-muted-foreground">
            Shell Game —{" "}
            {phase === "preview"
              ? "Memorize the items!"
              : phase === "shuffling"
              ? "Shuffling..."
              : `Prompt ${promptIdx + 1} of ${prompts.length}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {phase === "preview" && (
            <div className="text-center space-y-2">
              <div className="text-sm text-muted-foreground">
                Memorize where each item is placed. Shells will shuffle in 10 seconds.
              </div>
              <Button size="sm" onClick={startShuffling}>
                Ready — Shuffle now
              </Button>
            </div>
          )}
          {phase === "shuffling" && (
            <div className="text-center text-sm text-muted-foreground">
              Shells are face-down and shuffling...
            </div>
          )}

          {/* Shells — absolutely positioned with CSS transition for smooth sliding */}
          <div
            className="relative mx-auto"
            style={{ width: totalWidth, height: 120 }}
          >
            {setup.shellItems.map((item, origIdx) => {
              const displayPos = displayPosOfOrig[origIdx];
              const left = displayPos * (SHELL_W + SHELL_GAP);
              const isSelected = selectedShell === origIdx;
              const showItem =
                phase === "preview" ||
                (phase === "reveal" &&
                  (isSelected || origIdx === current.correctShellIdx));
              return (
                <button
                  key={origIdx}
                  disabled={phase !== "prompt"}
                  onClick={() => handleShellClick(origIdx)}
                  className={`absolute flex flex-col items-center justify-center rounded-lg border-2 p-2 transition-all duration-500 ease-in-out ${
                    phase === "reveal" && isSelected
                      ? revealCorrect
                        ? "border-green-500 bg-green-50 dark:bg-green-950"
                        : "border-red-500 bg-red-50 dark:bg-red-950"
                      : phase === "reveal" && origIdx === current.correctShellIdx
                      ? "border-green-500 bg-green-50 dark:bg-green-950"
                      : phase === "preview"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                  style={{
                    width: SHELL_W,
                    height: 120,
                    left,
                    top: 0,
                    transitionProperty: "left, top, background-color, border-color",
                    transitionDuration: "500ms",
                    transitionTimingFunction: "ease-in-out",
                  }}
                >
                  <span className="text-sm font-semibold text-center">
                    {showItem ? item.value : "🥚"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Prompt */}
          {phase === "prompt" && (
            <div className="text-center">
              <Badge variant="secondary">Find the shell with the {ASPECT_LABELS[current.questionAspect.type]}:</Badge>
              <div className="mt-2 text-2xl font-bold">{current.questionAspect.value}</div>
            </div>
          )}
          {phase === "reveal" && (
            <div
              className={`text-center font-semibold ${
                revealCorrect ? "text-green-600" : "text-red-600"
              }`}
            >
              {revealCorrect ? "✓ Correct!" : "✗ Wrong"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
