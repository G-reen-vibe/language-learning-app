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

type Phase = "preview" | "prompt" | "reveal";

interface Prompt {
  // The aspect the user is asked to find — can be ANY aspect of the source
  // word besides def/expl, not necessarily the aspect displayed on the card.
  // This makes the question non-trivial: instead of "find the card that says
  // 'cat'", the question might be "find the card whose translation is 'gato'"
  // when the card displays the word form "cat".
  questionAspect: Aspect;
  correctCardIdx: number; // index into setup.cardItems
  wordKey: string; // for grading — the source word of the correct card
}

export default function CardGameFormat({
  lesson,
  eligibleWords,
  onResult,
  onDone,
  remainingBudget,
}: FormatComponentProps) {
  const defaultCount = 4;
  const numPrompts = Math.min(defaultCount, remainingBudget);

  const setup = useMemo(() => {
    if (eligibleWords.length === 0) return null;
    // Use the max mastery among eligible words to determine N — this matches
    // the previous behavior where each word's own mastery scaled N.
    const maxMastery = Math.max(...eligibleWords.map((ew) => ew.state.mastery));
    // N scales {4, 6, 9} with mastery: mastery 4 -> 4, mastery 5 -> 9
    const targetN = maxMastery >= 5 ? 9 : 4;
    const eligibleWordEntries = eligibleWords.map((ew) => ew.word);
    // pickGameItems picks ONE ASPECT PER WORD so each card represents a
    // different concept. Returns null if there aren't enough eligible words
    // — in that case the format is not servable and onDone is called.
    const result = pickGameItems(eligibleWordEntries, targetN);
    if (!result || result.items.length < 4) return null;
    return {
      cardItems: result.items,
      sources: result.sources,
    };
  }, [eligibleWords]);

  // Build prompts: for each target card, ask about ANY aspect of its source
  // word (besides def/expl). The question aspect is chosen via buildGameQuestion
  // which guarantees no ambiguity (the question value uniquely identifies the
  // target card among all cards on the board).
  const prompts = useMemo<Prompt[]>(() => {
    if (!setup) return [];
    const indices = setup.cardItems.map((_, i) => i);
    const shuffled = shuffle(indices);
    const count = Math.min(numPrompts, shuffled.length);
    const out: Prompt[] = [];
    for (let i = 0; i < count; i++) {
      const idx = shuffled[i];
      const optionAspect = setup.cardItems[idx];
      const targetWord = setup.sources[idx];
      const questionAspect = buildGameQuestion(
        targetWord,
        optionAspect,
        setup.sources
      );
      if (!questionAspect) continue; // skip cards we can't build a question for
      out.push({
        questionAspect,
        correctCardIdx: idx,
        wordKey: wordKeyOf(targetWord),
      });
    }
    return out;
  }, [setup, numPrompts]);

  const [phase, setPhase] = useState<Phase>("preview");
  const [promptIdx, setPromptIdx] = useState(0);
  const [cardOrder, setCardOrder] = useState<number[]>([]);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [clickedCard, setClickedCard] = useState<number | null>(null);
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

  useEffect(() => {
    if (setup) {
      setCardOrder(setup.cardItems.map((_, i) => i));
    }
  }, [setup]);

  useEffect(() => {
    if (phase === "preview" && setup) {
      timerRef.current = setTimeout(() => {
        setPhase("prompt");
      }, 10000);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [phase, setup]);

  useEffect(() => {
    if ((!setup || prompts.length === 0) && !completed) {
      setCompleted(true);
      onDone([], 0);
    }
  }, [setup, prompts, completed, onDone]);

  const handlePreviewCardClick = useCallback(
    (displayPos: number) => {
      if (phase !== "preview") return;
      playSound("click");
      if (selectedCard === null) {
        setSelectedCard(displayPos);
      } else if (selectedCard === displayPos) {
        setSelectedCard(null);
      } else {
        setCardOrder((prev) => {
          const next = [...prev];
          [next[selectedCard], next[displayPos]] = [next[displayPos], next[selectedCard]];
          return next;
        });
        setSelectedCard(null);
      }
    },
    [phase, selectedCard]
  );

  const handleReady = useCallback(() => {
    if (phase !== "preview") return;
    playSound("shuffle");
    if (timerRef.current) clearTimeout(timerRef.current);
    setPhase("prompt");
  }, [phase]);

  const handleCardAnswer = useCallback(
    (displayPos: number) => {
      if (phase !== "prompt") return;
      if (clickedCard !== null) return;
      setClickedCard(displayPos);
      const originalIdx = cardOrder[displayPos];
      const current = prompts[promptIdx];
      const correct = originalIdx === current.correctCardIdx;
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
        setClickedCard(null);
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
    [phase, clickedCard, cardOrder, prompts, promptIdx, onResult, onDone]
  );

  if (!setup || prompts.length === 0) return null;

  const current = prompts[promptIdx];
  const n = setup.cardItems.length;
  const gridCols =
    n <= 4 ? "grid-cols-2" : n <= 6 ? "grid-cols-3" : "grid-cols-3";

  return (
    <div className="flex flex-col items-center gap-6 max-w-3xl mx-auto w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-center text-lg text-muted-foreground">
            Card Game —{" "}
            {phase === "preview"
              ? "Memorize & arrange cards"
              : `Prompt ${promptIdx + 1} of ${prompts.length}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {phase === "preview" && (
            <div className="text-center space-y-2">
              <div className="text-sm text-muted-foreground">
                Click two cards to swap them. Cards will hide in 10 seconds.
              </div>
              <Button size="sm" onClick={handleReady}>
                Ready — Hide cards
              </Button>
            </div>
          )}

          <div className={`grid ${gridCols} gap-3`}>
            {cardOrder.map((origIdx, displayPos) => {
              const item = setup.cardItems[origIdx];
              const isFaceUp = phase === "preview";
              const isSelected = selectedCard === displayPos;
              const isClicked = clickedCard === displayPos;
              // During reveal, show the clicked card and the correct card.
              // The correct card is identified by its source word (correctCardIdx),
              // NOT by matching the question aspect value — because the question
              // aspect can be a DIFFERENT aspect from the one displayed.
              const showItem =
                isFaceUp ||
                (phase === "reveal" &&
                  current &&
                  (isClicked || origIdx === current.correctCardIdx));
              return (
                <button
                  key={displayPos}
                  disabled={phase === "reveal"}
                  onClick={() =>
                    phase === "preview"
                      ? handlePreviewCardClick(displayPos)
                      : handleCardAnswer(displayPos)
                  }
                  className={`aspect-square flex flex-col items-center justify-center rounded-lg border-2 p-2 transition-all ${
                    phase === "reveal" && isClicked
                      ? revealCorrect
                        ? "border-green-500 bg-green-50 dark:bg-green-950"
                        : "border-red-500 bg-red-50 dark:bg-red-950"
                      : phase === "reveal" && current && origIdx === current.correctCardIdx
                      ? "border-green-500 bg-green-50 dark:bg-green-950"
                      : isSelected
                      ? "border-primary bg-primary/20"
                      : "border-border bg-card hover:bg-accent"
                  }`}
                >
                  <span className="text-xs text-muted-foreground">{displayPos + 1}</span>
                  <span className="text-sm font-semibold text-center mt-1">
                    {showItem ? item.value : "?"}
                  </span>
                </button>
              );
            })}
          </div>

          {phase === "prompt" && current && (
            <div className="text-center">
              <Badge variant="secondary">Find the card with the {ASPECT_LABELS[current.questionAspect.type]}:</Badge>
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
