"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormatComponentProps } from "./format-types";
import { PromptCard } from "./PromptCard";
import { buildScrambleOrFill } from "@/lib/format-helpers";
import { pickRandom, wordKeyOf, ASPECT_LABELS } from "@/lib/aspects";
import { QuestionResult, WordEntry, AspectType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface FillQ {
  target: WordEntry;
  questionText: string;
  questionAspectType: AspectType;
  answerText: string;
  answerAspectType: AspectType;
  toType: string;
  hintPrefix: string;
  hintSuffix: string;
  wordKey: string;
}

function computeHints(answer: string): { hintPrefix: string; toType: string; hintSuffix: string } {
  if (answer.includes(" ")) {
    const parts = answer.split(/\s+/);
    if (parts.length < 2) {
      return { hintPrefix: "", toType: answer, hintSuffix: "" };
    }
    const hintPrefix = parts.slice(0, -1).join(" ") + " ";
    const toType = parts[parts.length - 1];
    return { hintPrefix, toType, hintSuffix: "" };
  }
  if (answer.length > 8) {
    const cut = Math.max(1, answer.length - 3);
    return {
      hintPrefix: answer.slice(0, cut),
      toType: answer.slice(cut),
      hintSuffix: "",
    };
  }
  return { hintPrefix: "", toType: answer, hintSuffix: "" };
}

export default function FillGapFormat({
  lesson,
  eligibleWords,
  onResult,
  onDone,
  remainingBudget,
}: FormatComponentProps) {
  const defaultCount = 4;
  const numQuestions = Math.min(defaultCount, remainingBudget, eligibleWords.length);

  const questions = useMemo<FillQ[]>(() => {
    const out: FillQ[] = [];
    const used = new Set<string>();
    let attempts = 0;
    while (out.length < numQuestions && attempts < numQuestions * 6) {
      attempts++;
      const remaining = eligibleWords.filter((p) => !used.has(wordKeyOf(p.word)));
      const candidates = remaining.length > 0 ? remaining : eligibleWords;
      const target = pickRandom(candidates);
      const built = buildScrambleOrFill(target.word, { fillMode: "fill" });
      if (!built) continue;
      let answerText = built.answerText;
      if (!isTypable(answerText)) continue;
      const hints = computeHints(answerText);
      if (hints.toType.length < 2) continue;
      out.push({
        target: target.word,
        questionText: built.questionText,
        questionAspectType: built.questionAspectType,
        answerText,
        answerAspectType: built.answerAspectType,
        toType: hints.toType,
        hintPrefix: hints.hintPrefix,
        hintSuffix: hints.hintSuffix,
        wordKey: built.wordKey,
      });
      used.add(wordKeyOf(target.word));
    }
    return out;
  }, [eligibleWords, numQuestions]);

  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState("");
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [completed, setCompleted] = useState(false);
  const [feedback, setFeedback] = useState<"none" | "correct" | "wrong">("none");
  const inputRef = useRef<HTMLInputElement>(null);

  const current = questions[idx];

  useEffect(() => {
    if (questions.length === 0 && !completed) {
      setCompleted(true);
      onDone([], 0);
    }
  }, [questions.length, completed, onDone]);

  useEffect(() => {
    setInput("");
    setFeedback("none");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [idx]);

  const handleSubmit = useCallback(() => {
    if (feedback !== "none") return;
    if (!input.trim()) return;
    const correct = input.trim().toLowerCase() === current.toType.toLowerCase();
    setFeedback(correct ? "correct" : "wrong");
    // No explicit playSound here — the parent's handleResult plays the
    // debounced correct/wrong sound via onResult.
    const r: QuestionResult = {
      wordKey: current.wordKey,
      correct,
      quality: correct ? 5 : 1,
    };
    setResults((prev) => [...prev, r]);
    onResult(r);
  }, [feedback, input, current, onResult]);

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

  return (
    <div className="flex flex-col items-center gap-5 max-w-2xl mx-auto w-full">
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-center text-sm text-muted-foreground">
            Question {idx + 1} of {questions.length} — Fill the Gap
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="text-center text-sm text-muted-foreground">
            Type the <span className="font-semibold text-foreground">{ASPECT_LABELS[current.answerAspectType]}</span> for:
          </div>
          <PromptCard label={ASPECT_LABELS[current.questionAspectType]} text={current.questionText} size="md" />

          {/* Input area */}
          <div className="rounded-xl border border-border p-5 text-center bg-muted/20">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-3">
              Type your answer
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {current.hintPrefix && (
                <span className="text-lg font-mono text-muted-foreground">
                  {current.hintPrefix}
                </span>
              )}
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                disabled={feedback !== "none"}
                className={cn(
                  "w-40 text-lg font-mono text-center",
                  feedback === "correct" && "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                  feedback === "wrong" && "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                )}
                placeholder="..."
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {current.hintSuffix && (
                <span className="text-lg font-mono text-muted-foreground">
                  {current.hintSuffix}
                </span>
              )}
            </div>
          </div>

          {feedback === "wrong" && (
            <div className="text-center text-sm">
              <span className="text-muted-foreground">Correct answer: </span>
              <span className="font-semibold text-foreground">{current.toType}</span>
            </div>
          )}
          {feedback === "correct" && (
            <div className="text-center text-sm text-emerald-600 font-medium">✓ Correct!</div>
          )}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        {feedback === "none" ? (
          <Button size="lg" onClick={handleSubmit} disabled={!input.trim()}>
            <Check className="h-4 w-4 mr-1" /> Submit
            <kbd className="ml-2 text-[10px] opacity-70">↵</kbd>
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

function isTypable(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c > 0x7e) {
      if (c !== 0x09 && c !== 0x0a && c !== 0x0d) return false;
    }
  }
  return true;
}
