"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormatComponentProps } from "./format-types";
import { pickGameItems, buildGameQuestion } from "@/lib/format-helpers";
import { shuffle, wordKeyOf, ASPECT_LABELS, getAspects } from "@/lib/aspects";
import { playSound } from "@/lib/sounds";
import { QuestionResult, Aspect } from "@/lib/types";

type Phase = "preview" | "aiming" | "falling" | "reveal" | "answer" | "postanswer" | "reslot";

interface MarblePos {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Pin {
  x: number;
  y: number;
  r: number;
}

interface SlotDef {
  x: number; // center x of slot
  itemIdx: number; // index into slotItems
}

// No pre-generated prompts — the slot is determined by physics when the marble lands.
// We only track how many marbles to fire.

const CANVAS_W = 600;
const CANVAS_H = 420;
const CANNON_Y = 30;
const PIN_ROWS = 5;
const SLOT_Y = CANVAS_H - 50;
const SLOT_H = 40;
const MARBLE_R = 7;
const GRAVITY = 0.35;
const BOUNCE = 0.45;

export default function MarbleGameFormat({
  lesson,
  eligibleWords,
  onResult,
  onDone,
  remainingBudget,
}: FormatComponentProps) {
  const defaultCount = 4; // 4 marbles/prompts per setup
  const numPrompts = Math.min(defaultCount, remainingBudget);

  // Setup: pick N slot items, ONE ASPECT PER WORD (different words) so each
  // slot represents a different concept. Returns null if there aren't enough
  // eligible words — in that case the format is not servable and onDone is
  // called.
  const setup = useMemo(() => {
    if (eligibleWords.length === 0) return null;
    // Use the max mastery among eligible words to determine N — this matches
    // the previous behavior where each word's own mastery scaled N.
    const maxMastery = Math.max(...eligibleWords.map((ew) => ew.state.mastery));
    // N scales {6, 9, 12} with mastery: mastery 4 -> 6, mastery 5 -> 12
    const targetN = maxMastery >= 5 ? 12 : 6;
    const eligibleWordEntries = eligibleWords.map((ew) => ew.word);
    const result = pickGameItems(eligibleWordEntries, targetN);
    if (!result || result.items.length < 6) return null;
    return { slotItems: result.items, sources: result.sources };
  }, [eligibleWords]);

  // Total number of marbles to fire (no pre-selection — physics decides landing)
  const totalMarbles = useMemo(() => {
    if (!setup) return 0;
    return Math.min(numPrompts, setup.slotItems.length);
  }, [setup, numPrompts]);

  // Build slots and pins
  const { slots, pins } = useMemo(() => {
    if (!setup) return { slots: [] as SlotDef[], pins: [] as Pin[] };
    const n = setup.slotItems.length;
    const slotW = CANVAS_W / n;
    const slots: SlotDef[] = [];
    for (let i = 0; i < n; i++) {
      slots.push({ x: slotW * i + slotW / 2, itemIdx: i });
    }
    // Build a grid of pins between cannon and slots
    const pins: Pin[] = [];
    const pinAreaTop = CANNON_Y + 50;
    const pinAreaBottom = SLOT_Y - 30;
    const pinAreaH = pinAreaBottom - pinAreaTop;
    for (let row = 0; row < PIN_ROWS; row++) {
      const y = pinAreaTop + (pinAreaH * row) / (PIN_ROWS - 1);
      const offset = row % 2 === 0 ? 0 : slotW / 2;
      const cols = Math.floor(CANVAS_W / slotW);
      for (let col = 0; col <= cols; col++) {
        const x = col * slotW + offset;
        if (x > 10 && x < CANVAS_W - 10) {
          pins.push({ x, y, r: 5 });
        }
      }
    }
    return { slots, pins };
  }, [setup]);

  const [phase, setPhase] = useState<Phase>("preview");
  const [promptIdx, setPromptIdx] = useState(0);
  const [cannonAngle, setCannonAngle] = useState(0); // radians, 0 = straight down
  const [marble, setMarble] = useState<MarblePos | null>(null);
  const marbleRef = useRef<MarblePos | null>(null);
  const [landedSlotIdx, setLandedSlotIdx] = useState<number | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);
  const [revealCorrect, setRevealCorrect] = useState(false);
  const cannonAngleRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Question for the currently-landed slot. Set when the marble lands (in the
  // physics step) so the answer phase can render it. Using state (not useMemo)
  // because the question is built once per landing and must not change on
  // re-renders — useMemo would recompute if `setup` identity changed, which
  // can cause cascading renders in the answer phase.
  const [question, setQuestion] = useState<{ aspect: Aspect; choices: string[]; correctValue: string } | null>(null);
  // Ref to the scrollable container so we can auto-scroll to follow the marble
  // and to bring the landed slot into view on mobile (where the 600px board
  // overflows the viewport and the user would otherwise lose track of the
  // ball).
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Clean up any pending timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Preview phase: show slots for 10 seconds, then hide and start aiming
  useEffect(() => {
    if (!setup) return;
    timerRef.current = setTimeout(() => {
      setPhase("aiming");
    }, 10000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [setup]);

  useEffect(() => {
    if (!setup && !completed) {
      setCompleted(true);
      onDone([], 0);
    }
  }, [setup, completed, onDone]);

  // Aiming phase: pick a random angle, hold still, then fire after 1.5s
  useEffect(() => {
    if (phase !== "aiming") return;
    // Pick a random cannon angle (±35 degrees from vertical)
    const angle = (Math.random() - 0.5) * 1.2; // ±0.6 rad ≈ ±34°
    cannonAngleRef.current = angle;
    setCannonAngle(angle);
    // Hold the cannon still for 1.5s so the player can see the aim, then fire
    timerRef.current = setTimeout(() => {
      fireMarble();
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase]);

  const fireMarble = useCallback(() => {
    if (!setup) return;
    // Use the live cannon angle from the ref (not stale state)
    const angle = cannonAngleRef.current;
    const startX = CANVAS_W / 2 + Math.sin(angle) * 30;
    const startY = CANNON_Y + Math.cos(angle) * 30;
    const speed = 10; // increased so the marble visibly flies in the cannon's direction
    const vx = Math.sin(angle) * speed;
    const vy = Math.cos(angle) * speed;
    const pos = { x: startX, y: startY, vx, vy };
    marbleRef.current = pos;
    setMarble(pos);
    setPhase("falling");
    playSound("launch");
  }, [setup]);

  // Helper: smoothly scroll the board container so that the given SVG-x
  // coordinate is centered in the viewport. No-op on desktop where the whole
  // 600px board is already visible. Defined before the physics useEffect
  // because that effect references scrollToX in its deps array.
  const scrollToX = useCallback((svgX: number) => {
    const el = scrollRef.current;
    if (!el) return;
    // Map SVG-x (0..CANVAS_W) to scrollLeft (0..scrollWidth-clientWidth).
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) return; // board fits, no scroll needed
    const targetScroll = Math.max(
      0,
      Math.min(maxScroll, (svgX / CANVAS_W) * el.scrollWidth - el.clientWidth / 2)
    );
    el.scrollTo({ left: targetScroll, behavior: "smooth" });
  }, []);

  // Marble physics animation — runs once when phase becomes "falling"
  // Uses a ref for marble position to avoid side effects inside setState updater
  useEffect(() => {
    if (phase !== "falling") return;
    if (!setup) return;
    let raf: ReturnType<typeof requestAnimationFrame>;
    let cancelled = false;
    let stepCount = 0;
    const MAX_STEPS = 1000; // safety guard against infinite loops
    const step = () => {
      if (cancelled) return;
      stepCount++;
      const prev = marbleRef.current;
      if (!prev) return;
      let { x, y, vx, vy } = prev;
      vy += GRAVITY;
      x += vx;
      y += vy;
      // Bounce off walls
      if (x < MARBLE_R) {
        x = MARBLE_R;
        vx = -vx * BOUNCE;
      }
      if (x > CANVAS_W - MARBLE_R) {
        x = CANVAS_W - MARBLE_R;
        vx = -vx * BOUNCE;
      }
      // Bounce off pins
      for (const pin of pins) {
        const dx = x - pin.x;
        const dy = y - pin.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = MARBLE_R + pin.r;
        if (dist < minDist && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          x = pin.x + nx * minDist;
          y = pin.y + ny * minDist;
          const dot = vx * nx + vy * ny;
          vx = (vx - 2 * dot * nx) * BOUNCE;
          vy = (vy - 2 * dot * ny) * BOUNCE;
        }
      }
      // Check if marble reached slot area or safety limit
      if (y >= SLOT_Y - MARBLE_R || stepCount >= MAX_STEPS) {
        // Landing logic — side effects OUTSIDE setState updater
        const slotIdx = Math.floor((x / CANVAS_W) * setup.slotItems.length);
        const clampedIdx = Math.max(0, Math.min(setup.slotItems.length - 1, slotIdx));
        marbleRef.current = null;
        setMarble(null);
        setLandedSlotIdx(clampedIdx);
        // Build the question for this slot IMMEDIATELY (not in a useMemo) so
        // it's stable across re-renders during the answer phase. If we can't
        // build a valid question (e.g. not enough distractors), skip this
        // marble by going straight to reslot after a short reveal.
        const optionAspect = setup.slotItems[clampedIdx];
        const targetWord = setup.sources[clampedIdx];
        const questionAspect = buildGameQuestion(targetWord, optionAspect, setup.sources);
        if (questionAspect) {
          // Gather distractors from other source words' aspects (any non-def/expl).
          const distractorPool: string[] = [];
          for (let i = 0; i < setup.sources.length; i++) {
            if (i === clampedIdx) continue;
            const w = setup.sources[i];
            for (const a of getAspects(w)) {
              if (a.type === "definition" || a.type === "explanation") continue;
              if (a.value.trim().length === 0) continue;
              if (a.value !== questionAspect.value) distractorPool.push(a.value);
            }
          }
          const distractors = shuffle(Array.from(new Set(distractorPool))).slice(0, 3);
          if (distractors.length >= 3) {
            const choices = shuffle([questionAspect.value, ...distractors]);
            setQuestion({ aspect: questionAspect, choices, correctValue: questionAspect.value });
            setPhase("reveal");
          } else {
            // Not enough distractors — skip this marble.
            setQuestion(null);
            setPhase("postanswer");
          }
        } else {
          // Can't build a question — skip this marble.
          setQuestion(null);
          setPhase("postanswer");
        }
        playSound("land");
        // Auto-scroll to bring the landed slot into view. On mobile the
        // 600px board overflows the viewport, so without this the user
        // may not see where the marble landed.
        const slotCenterX = (clampedIdx + 0.5) * (CANVAS_W / setup.slotItems.length);
        scrollToX(slotCenterX);
        return; // don't schedule next frame
      }
      const next = { x, y, vx, vy };
      marbleRef.current = next;
      setMarble(next);
      // Follow the marble horizontally so the user can track it as it
      // bounces. This is especially important on mobile where the board
      // overflows the viewport.
      scrollToX(x);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [phase, pins, setup, scrollToX]);

  // After marble lands, show reveal for 1s then go to answer phase.
  // Only transition to answer if we have a valid question; otherwise the
  // postanswer phase (set in the landing code) will skip to the next marble.
  useEffect(() => {
    if (phase !== "reveal") return;
    timerRef.current = setTimeout(() => {
      setPhase("answer");
    }, 800);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase]);

  // Skip-marble path: if we landed but couldn't build a valid question,
  // we went straight to postanswer. After a brief pause, advance to the
  // next marble (or finish).
  useEffect(() => {
    if (phase !== "postanswer" || question !== null) return;
    if (completedRef.current) return;
    timerRef.current = setTimeout(() => {
      setSelectedChoice(null);
      setRevealCorrect(false);
      setLandedSlotIdx(null);
      setQuestion(null);
      if (promptIdx + 1 >= totalMarbles) {
        if (!completedRef.current) {
          completedRef.current = true;
          setCompleted(true);
          onDone([], totalMarbles);
        }
      } else {
        setPromptIdx(promptIdx + 1);
        setPhase("reslot");
      }
    }, 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, question, promptIdx, totalMarbles, onDone]);

  const handleAnswer = useCallback(
    (choice: string) => {
      if (phase !== "answer" || selectedChoice !== null || landedSlotIdx === null || !question) return;
      setSelectedChoice(choice);
      const correct = choice === question.correctValue;
      setRevealCorrect(correct);
      const r: QuestionResult = {
        wordKey: wordKeyOf(setup!.sources[landedSlotIdx]),
        correct,
        quality: correct ? 5 : 1,
      };
      setResults((prev) => [...prev, r]);
      onResult(r);
      // After answer, show slots briefly (postanswer), then next marble or done.
      // Use separate timer refs to avoid the second overwriting the first.
      timerRef.current = setTimeout(() => {
        setPhase("postanswer");
        timerRef.current = setTimeout(() => {
          setSelectedChoice(null);
          setRevealCorrect(false);
          setLandedSlotIdx(null);
          setQuestion(null);
          if (promptIdx + 1 >= totalMarbles) {
            if (!completedRef.current) {
              completedRef.current = true;
              setCompleted(true);
              onDone([], totalMarbles);
            }
          } else {
            setPromptIdx(promptIdx + 1);
            setPhase("reslot");
          }
        }, 1500);
      }, 1500);
    },
    [phase, selectedChoice, landedSlotIdx, promptIdx, setup, totalMarbles, question, onResult, onDone]
  );

  // "reslot" phase: show slots briefly again, then aim next marble
  useEffect(() => {
    if (phase !== "reslot") return;
    timerRef.current = setTimeout(() => {
      setPhase("aiming");
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase]);

  if (!setup || totalMarbles === 0) return null;

  // Slots visible during preview, reslot, and briefly after answering (postanswer).
  // During reveal (marble landing) and answer, slots are HIDDEN.
  const slotsVisible = phase === "preview" || phase === "reslot" || phase === "postanswer";
  const slotW = CANVAS_W / setup.slotItems.length;

  return (
    <div className="flex flex-col items-center gap-6 max-w-3xl mx-auto w-full">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-center text-lg text-muted-foreground">
            Marble Game —{" "}
            {phase === "preview"
              ? "Memorize the slots!"
              : `Marble ${promptIdx + 1} of ${totalMarbles}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Game canvas — horizontally scrollable so the full 600px board
              is reachable on mobile. We auto-scroll to follow the marble
              and to bring the landed slot into view (see scrollToX). */}
          <div
            ref={scrollRef}
            className="w-full overflow-x-auto overflow-y-hidden rounded-lg"
            style={{
              // Subtle fade hints on the left/right edges so the user knows
              // the board is scrollable on mobile.
              scrollbarWidth: "thin",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <svg
              width={CANVAS_W}
              height={CANVAS_H}
              // No maxWidth — we WANT the board to overflow on mobile so the
              // user can scroll. viewBox keeps the SVG's coordinate system
              // stable regardless of display size.
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              className="border border-border rounded-lg bg-card"
              style={{
                display: "block",
                // Ensure the SVG never shrinks below its natural coordinate
                // size (prevents the browser from squishing it on mobile).
                minWidth: `${CANVAS_W}px`,
              }}
            >
              {/* Cannon — rotate uses negated angle so positive angle = tilt right (matches marble velocity) */}
              <g
                transform={`translate(${CANVAS_W / 2}, ${CANNON_Y}) rotate(${-cannonAngle * (180 / Math.PI)})`}
                style={{ transition: "transform 0.5s ease-out" }}
              >
                <rect x={-12} y={0} width={24} height={30} rx={4} className="fill-primary" />
                <rect x={-8} y={-6} width={16} height={12} rx={2} className="fill-primary" />
              </g>

              {/* Pins */}
              {pins.map((pin, i) => (
                <circle
                  key={`pin-${i}`}
                  cx={pin.x}
                  cy={pin.y}
                  r={pin.r}
                  className="fill-muted-foreground/40"
                />
              ))}

              {/* Slots */}
              {slots.map((slot, i) => {
                const item = setup.slotItems[slot.itemIdx];
                const isLanded = landedSlotIdx === slot.itemIdx;
                // During answer phase, slots are HIDDEN (user must remember)
                const showItem = slotsVisible;
                return (
                  <g key={`slot-${i}`}>
                    <rect
                      x={slot.x - slotW / 2 + 2}
                      y={SLOT_Y}
                      width={slotW - 4}
                      height={SLOT_H}
                      rx={4}
                      className={
                        isLanded
                          ? "fill-primary/30 stroke-primary"
                          : "fill-muted/30 stroke-border"
                      }
                      strokeWidth={isLanded ? 2 : 1}
                    />
                    {/* Always show the slot number — this helps the user
                        identify slots during preview and confirm which slot
                        the marble landed in (the badge also says "slot N"). */}
                    <text
                      x={slot.x}
                      y={SLOT_Y - 6}
                      textAnchor="middle"
                      className="fill-muted-foreground"
                      style={{ fontSize: 10 }}
                    >
                      {i + 1}
                    </text>
                    {showItem && (
                      <text
                        x={slot.x}
                        y={SLOT_Y + SLOT_H / 2 + 4}
                        textAnchor="middle"
                        className="fill-foreground"
                        style={{ fontSize: Math.max(8, Math.min(14, 80 / setup.slotItems.length)) }}
                      >
                        {item.value.length > 8 ? item.value.slice(0, 7) + "…" : item.value}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Marble */}
              {marble && (
                <circle
                  cx={marble.x}
                  cy={marble.y}
                  r={MARBLE_R}
                  className="fill-red-500"
                />
              )}
            </svg>
          </div>
          {/* Phase instructions / prompt */}
          {phase === "preview" && (
            <div className="text-center text-sm text-muted-foreground space-y-1">
              <div>Memorize which word is in each slot. Marbles launch in 10 seconds.</div>
              {/* Hint for mobile users — the 600px board overflows the viewport
                  and they need to know they can swipe to see all slots. */}
              <div className="text-xs opacity-70">← swipe to see all slots →</div>
            </div>
          )}
          {phase === "reslot" && (
            <div className="text-center text-sm text-muted-foreground">
              Slots shown again — memorize for next marble!
            </div>
          )}
          {phase === "postanswer" && (
            <div className="text-center text-sm text-muted-foreground">
              Memorize the slots for the next marble!
            </div>
          )}
          {phase === "aiming" && (
            <div className="text-center text-sm text-muted-foreground">
              Aiming... marble will fire soon!
            </div>
          )}
          {phase === "falling" && (
            <div className="text-center text-sm text-muted-foreground">
              Marble falling...
            </div>
          )}
          {(phase === "reveal" || phase === "answer") && landedSlotIdx !== null && (
            <div className="text-center">
              <Badge variant="secondary">Marble landed in slot {landedSlotIdx + 1}!</Badge>
            </div>
          )}
          {phase === "answer" && landedSlotIdx !== null && question && (
            <div className="space-y-3">
              <div className="text-center">
                <Badge variant="secondary">
                  Which {ASPECT_LABELS[question.aspect.type]} was in slot {landedSlotIdx + 1}?
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {question.choices.map((c, i) => {
                  const isCorrect = c === question.correctValue;
                  const isSelected = c === selectedChoice;
                  return (
                    <Button
                      key={i}
                      variant={
                        selectedChoice !== null
                          ? isCorrect
                            ? "default"
                            : isSelected
                            ? "destructive"
                            : "outline"
                          : "outline"
                      }
                      disabled={selectedChoice !== null}
                      onClick={() => handleAnswer(c)}
                      className="text-base"
                    >
                      {c}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
          {revealCorrect && (
            <div className="text-center font-semibold text-green-600">✓ Correct!</div>
          )}
          {selectedChoice !== null && !revealCorrect && phase === "answer" && (
            <div className="text-center font-semibold text-red-600">✗ Wrong</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
