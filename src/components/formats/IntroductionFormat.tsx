"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormatComponentProps } from "./format-types";
import { wordKeyOf } from "@/lib/aspects";
import { QuestionResult } from "@/lib/types";
import { playSound } from "@/lib/sounds";

export default function IntroductionFormat({
  eligibleWords,
  onResult,
  onDone,
}: FormatComponentProps) {
  // Introduction serves exactly 1 card.
  // Per spec: words are taught in the order they appear in the lesson.
  // eligibleWords is already in lesson order (eligibleWordsForFormat iterates lesson.words).
  const target = useMemo(() => {
    if (eligibleWords.length === 0) return null;
    return eligibleWords[0].word;
  }, [eligibleWords]);

  const [done, setDone] = useState(false);

  // If no eligible words (shouldn't happen — caller pre-checks), complete immediately.
  useEffect(() => {
    if (!target && !done) {
      setDone(true);
      onDone([], 0);
    }
  }, [target, done, onDone]);

  if (!target) return null;

  const handleOk = () => {
    if (done) return;
    playSound("click");
    setDone(true);
    const r: QuestionResult = {
      wordKey: wordKeyOf(target),
      correct: true,
      quality: 5,
      isIntroduction: true,
    };
    onResult(r);
    onDone([r], 1);
  };

  // Build the list of all details to display
  const detailRows: { label: string; value: string }[] = [];
  if (target.translation) detailRows.push({ label: "Translation", value: target.translation });
  if (target.synonym) {
    const syn = target.synonym.startsWith("=") ? target.synonym.slice(1) : target.synonym;
    if (syn.trim()) detailRows.push({ label: "Synonym", value: syn });
  }
  if (target.alt1) detailRows.push({ label: "Alt form 1", value: target.alt1 });
  if (target.alt2) detailRows.push({ label: "Alt form 2", value: target.alt2 });
  if (target.alt3) detailRows.push({ label: "Alt form 3", value: target.alt3 });
  if (target.definition) detailRows.push({ label: "Definition", value: target.definition });
  if (target.explanation) detailRows.push({ label: "Explanation", value: target.explanation });

  return (
    <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-center text-2xl">New Word</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center">
            <div className="text-4xl font-bold tracking-tight">{target.word}</div>
          </div>

          {/* All details */}
          {detailRows.length > 0 && (
            <div className="space-y-3">
              {detailRows.map((d, i) => (
                <div key={i} className="text-center">
                  <Badge variant="secondary" className="text-sm">
                    {d.label}
                  </Badge>
                  <div
                    className={`mt-1 ${
                      d.label === "Explanation" || d.label === "Definition"
                        ? "text-sm text-muted-foreground"
                        : "text-lg"
                    }`}
                  >
                    {d.value}
                  </div>
                </div>
              ))}
            </div>
          )}

        </CardContent>
      </Card>
      <Button size="lg" onClick={handleOk} disabled={done} className="min-w-32">
        {done ? "✓" : "Okay"}
      </Button>
    </div>
  );
}
