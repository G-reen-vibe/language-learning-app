"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Clock, Heart, Trophy, Target, CheckCircle2, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Lesson,
  StudyMode,
  FormatType,
  QuestionResult,
  SessionRecord,
  FORMAT_NAMES,
  WordState,
} from "@/lib/types";
import {
  pickNextFormat,
  eligibleWordsForFormat,
  isFormatServable,
  modeQuestionTarget,
  RUSH_DURATION_SEC,
  RUSH_LIVES,
} from "@/lib/session";
import { introduceWord, applyAlgorithmResult } from "@/lib/session";
import { todayStr } from "@/lib/storage";
import { playSound, resumeAudio } from "@/lib/sounds";
import { wordKeyOf } from "@/lib/aspects";
import { QUERY_KEYS } from "@/lib/user-data-context";

import IntroductionFormat from "./formats/IntroductionFormat";
import PickAnswerFormat from "./formats/PickAnswerFormat";
import SpotTheLieFormat from "./formats/SpotTheLieFormat";
import MatchPairsFormat from "./formats/MatchPairsFormat";
import WordScrambleFormat from "./formats/WordScrambleFormat";
import FillGapFormat from "./formats/FillGapFormat";
import SentenceComprehensionFormat from "./formats/SentenceComprehensionFormat";
import SentenceTranslationFormat from "./formats/SentenceTranslationFormat";
import ShellGameFormat from "./formats/ShellGameFormat";
import CardGameFormat from "./formats/CardGameFormat";
import MarbleGameFormat from "./formats/MarbleGameFormat";

interface StudyViewProps {
  lesson: Lesson;
  mode: StudyMode;
  onExit: () => void;
  /** If set, forces this format for the entire session (debug mode). */
  debugFormat?: FormatType;
}

/**
 * StudyView — refactored to persist reviews to the server incrementally.
 *
 * Architecture (mirrors the Flashcards app's pattern):
 *
 * 1. Working copy: deep clone of the lesson is kept in state for synchronous
 *    reads by the format components (they need word states to build questions).
 *
 * 2. Per-result persistence: when a format calls onResult, we:
 *    a. Optimistically update the working copy (so eligibleWordsForFormat
 *       sees the new state for the next format pick).
 *    b. Fire POST /api/lessons/[id]/review (fire-and-forget with client-side
 *       retry on 5xx/network errors — defense in depth on top of the
 *       server's withRetry).
 *
 * 3. Session lifecycle:
 *    a. On mount: POST /api/lessons/[id]/sessions to create a SessionRecord
 *       (fire-and-forget; the session can proceed without it).
 *    b. On end: PATCH /api/sessions/[id] with final stats. This route also
 *       updates GlobalStats transactionally, so we just invalidate the
 *       ['lessons'] and ['stats'] queries afterward.
 *
 * Concurrency hardening (ported from Flashcards):
 * - sessionIdRef mirrors sessionId state (unmount cleanup fires before
 *   state settles).
 * - sessionCompleteRef guards against double-end.
 * - livesRemainingRef mirrors livesRemaining (so endSession doesn't depend
 *   on lives state and change identity on every life loss).
 * - endSessionSilent for unmount cleanup (PATCH only, no navigation) so
 *   React StrictMode's dev cycle doesn't yank the user to the summary screen.
 * - Client-side retry on 5xx for the review mutation (2 retries, 200/400ms
 *   backoff).
 */
export default function StudyView({ lesson, mode, onExit, debugFormat }: StudyViewProps) {
  const qc = useQueryClient();

  // Working copy of the lesson (deep clone) — we mutate this during the
  // session for synchronous reads by format components. The server is the
  // source of truth; this working copy is discarded when the session ends
  // and the ['lessons'] query is invalidated to refetch authoritative state.
  const [workingLesson, setWorkingLesson] = useState<Lesson>(() => {
    const clone: Lesson = JSON.parse(JSON.stringify(lesson));
    if (clone.lastStudyDate !== todayStr()) {
      clone.newWordsIntroducedToday = 0;
    }
    return clone;
  });

  const target = modeQuestionTarget(mode);
  const isRush = mode === "rush";

  const [questionsServed, setQuestionsServed] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [wordsStudied, setWordsStudied] = useState<Set<string>>(new Set());
  const [currentFormat, setCurrentFormat] = useState<FormatType | null>(null);
  const [formatKey, setFormatKey] = useState(0);
  const [recentFormats, setRecentFormats] = useState<FormatType[]>([]);
  const [usedFormatsThisSession, setUsedFormatsThisSession] = useState<Set<FormatType>>(
    new Set()
  );
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionRecord, setSessionRecord] = useState<SessionRecord | null>(null);

  // Rush mode state
  const [timeRemainingMs, setTimeRemainingMs] = useState(RUSH_DURATION_SEC * 1000);
  const [livesRemaining, setLivesRemaining] = useState(RUSH_LIVES);
  const startTimeRef = useRef<number>(Date.now());

  // --- Session ID management ---
  // sessionId is created on mount via POST /api/lessons/[id]/sessions.
  // It's stored in a ref (not state) because:
  // 1. We need it in endSession / handleResult, which are called from timers
  //    and deep callback chains where stale closures would be a problem.
  // 2. It doesn't need to trigger re-renders.
  const sessionIdRef = useRef<string | null>(null);
  const sessionEndedRef = useRef(false);
  const sessionStartedRef = useRef(false);

  // --- Refs for live state (avoids stale closures in timer / endSession) ---
  const questionsServedRef = useRef(0);
  const correctCountRef = useRef(0);
  const wrongCountRef = useRef(0);
  const livesRemainingRef = useRef(RUSH_LIVES);
  const wordsStudiedRef = useRef<Set<string>>(new Set());
  const workingLessonRef = useRef(workingLesson);
  const sessionCompleteRef = useRef(false);
  const lastSoundTimeRef = useRef(0); // debounce for correct/wrong sounds

  // Keep refs in sync with state
  useEffect(() => { questionsServedRef.current = questionsServed; }, [questionsServed]);
  useEffect(() => { correctCountRef.current = correctCount; }, [correctCount]);
  useEffect(() => { wrongCountRef.current = wrongCount; }, [wrongCount]);
  useEffect(() => { livesRemainingRef.current = livesRemaining; }, [livesRemaining]);
  useEffect(() => { wordsStudiedRef.current = wordsStudied; }, [wordsStudied]);
  useEffect(() => { workingLessonRef.current = workingLesson; }, [workingLesson]);
  useEffect(() => { sessionCompleteRef.current = sessionComplete; }, [sessionComplete]);

  // --- Session creation on mount (fire-and-forget with abort) ---
  useEffect(() => {
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    const controller = new AbortController();
    fetch(`/api/lessons/${lesson.id}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        if (!controller.signal.aborted && d?.session?.id) {
          sessionIdRef.current = d.session.id;
        }
      })
      .catch(() => {
        // Best-effort — the session can proceed without a server-side record.
        // Reviews will still update word states; only the session stats won't
        // be persisted.
      });
    return () => controller.abort();
  }, []);

  // Snapshot eligible words ONCE per format instance (not on every workingLesson change).
  // This prevents mid-format question regeneration.
  // In debug mode, ALL words are eligible regardless of mastery.
  const eligibleWords = useMemo(() => {
    if (!currentFormat) return [];
    if (debugFormat) {
      // Debug mode: all words are eligible
      return workingLessonRef.current.words.map((w) => {
        const k = wordKeyOf(w);
        const s = workingLessonRef.current.wordStates[k];
        return { word: w, state: s! };
      }).filter((ew) => ew.state);
    }
    return eligibleWordsForFormat(workingLessonRef.current, currentFormat);
  }, [currentFormat, formatKey, debugFormat]);

  // --- Submit a single review to the server (fire-and-forget with retry) ---
  const submitReview = useCallback(
    async (r: QuestionResult) => {
      const maxRetries = 2;
      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(`/api/lessons/${lesson.id}/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wordKey: r.wordKey,
              quality: r.quality,
              isIntroduction: r.isIntroduction ?? false,
            }),
          });
          if (!response.ok) {
            if (response.status >= 500 && attempt < maxRetries) {
              await new Promise((res) => setTimeout(res, 200 * Math.pow(2, attempt)));
              continue;
            }
            console.error(`Review submission failed (${response.status}) for wordKey=${r.wordKey}`);
            return;
          }
          return;
        } catch (e) {
          lastError = e;
          if (attempt < maxRetries) {
            await new Promise((res) => setTimeout(res, 200 * Math.pow(2, attempt)));
            continue;
          }
          console.error("Review submission failed (network error):", lastError);
          return;
        }
      }
    },
    [lesson.id]
  );

  // --- End the session via API (PATCH /api/sessions/[id]) ---
  const endSessionViaApi = useCallback(
    async (rec: SessionRecord) => {
      const sid = sessionIdRef.current;
      if (!sid) {
        // Session was never created on the server — just invalidate queries
        // so the client refetches authoritative state (word states were
        // updated incrementally via /api/review).
        qc.invalidateQueries({ queryKey: QUERY_KEYS.lessons });
        qc.invalidateQueries({ queryKey: QUERY_KEYS.stats });
        return;
      }
      try {
        await fetch(`/api/sessions/${sid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endedAt: new Date(),
            questionsServed: rec.questionsServed,
            correctCount: rec.correctCount,
            wrongCount: rec.wrongCount,
            livesUsed: rec.livesUsed,
            durationSec: rec.durationSec,
            wordsStudied: rec.wordsStudied,
            lessonId: rec.lessonId,
          }),
        });
      } catch (e) {
        console.error("Failed to end session via API:", e);
      } finally {
        // Invalidate queries so the client refetches the authoritative state.
        // The session PATCH updates GlobalStats transactionally, and the
        // word states were updated incrementally via /api/review.
        qc.invalidateQueries({ queryKey: QUERY_KEYS.lessons });
        qc.invalidateQueries({ queryKey: QUERY_KEYS.stats });
      }
    },
    [qc]
  );

  // --- Silent end for unmount cleanup (PATCH only, no navigation) ---
  const endSessionSilent = useCallback(() => {
    if (sessionEndedRef.current) return;
    sessionEndedRef.current = true;
    const sid = sessionIdRef.current;
    if (!sid) return;
    const endTime = Date.now();
    const durationSec = Math.round((endTime - startTimeRef.current) / 1000);
    const rec: SessionRecord = {
      id: sid,
      lessonId: lesson.id,
      mode,
      startedAt: startTimeRef.current,
      endedAt: endTime,
      questionsServed: questionsServedRef.current,
      correctCount: correctCountRef.current,
      wrongCount: wrongCountRef.current,
      livesUsed: isRush ? RUSH_LIVES - livesRemainingRef.current : undefined,
      durationSec,
      wordsStudied: Array.from(wordsStudiedRef.current),
    };
    // Fire-and-forget — don't block unmount
    void endSessionViaApi(rec);
  }, [lesson.id, mode, isRush, endSessionViaApi]);

  const endSessionSilentRef = useRef(endSessionSilent);
  useEffect(() => { endSessionSilentRef.current = endSessionSilent; }, [endSessionSilent]);

  // Unmount cleanup — end the session silently so progress is saved even
  // if the user navigates away mid-session.
  useEffect(() => {
    return () => {
      endSessionSilentRef.current();
    };
  }, []);

  // --- End the session (explicit — shows summary screen) ---
  const endSession = useCallback(() => {
    if (sessionCompleteRef.current) return;
    sessionCompleteRef.current = true;
    sessionEndedRef.current = true;
    setSessionComplete(true);
    playSound("complete");
    const endTime = Date.now();
    const durationSec = Math.round((endTime - startTimeRef.current) / 1000);
    const rec: SessionRecord = {
      id: sessionIdRef.current || "local",
      lessonId: lesson.id,
      mode,
      startedAt: startTimeRef.current,
      endedAt: endTime,
      questionsServed: questionsServedRef.current,
      correctCount: correctCountRef.current,
      wrongCount: wrongCountRef.current,
      livesUsed: isRush ? RUSH_LIVES - livesRemainingRef.current : undefined,
      durationSec,
      wordsStudied: Array.from(wordsStudiedRef.current),
    };
    setSessionRecord(rec);
    // Persist to server (fire-and-forget)
    void endSessionViaApi(rec);
  }, [mode, isRush, lesson.id, endSessionViaApi]);

  // Pick the first format on mount
  useEffect(() => {
    resumeAudio();
    playSound("start");
    // In debug mode, force the specified format
    const fmt = debugFormat || pickNextFormat(workingLessonRef.current, [], usedFormatsThisSession);
    if (fmt) {
      setCurrentFormat(fmt);
      setFormatKey((k) => k + 1);
      setRecentFormats([fmt]);
      if (!debugFormat) {
        setUsedFormatsThisSession((prev) => new Set(prev).add(fmt));
      }
    } else {
      endSession();
    }
  }, []);

  // Rush mode timer — reads live state via refs, so deps are minimal
  useEffect(() => {
    if (!isRush || sessionComplete) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = RUSH_DURATION_SEC * 1000 - elapsed;
      setTimeRemainingMs(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(interval);
        endSession();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isRush, sessionComplete, endSession]);

  // Check end conditions (uses refs for live values)
  const checkEndConditions = useCallback((): boolean => {
    if (isRush) {
      if (livesRemainingRef.current <= 0) return true;
      if (Date.now() - startTimeRef.current >= RUSH_DURATION_SEC * 1000) return true;
      return false;
    } else {
      if (questionsServedRef.current >= target) return true;
      return false;
    }
  }, [isRush, target]);

  // Handle a single question result
  const handleResult = useCallback(
    (r: QuestionResult) => {
      // Snapshot the wasUnseen flag BEFORE any state changes.
      // This is passed implicitly via the closure to submitReview —
      // the server determines wasUnseen from its own state, so we don't
      // need to pass it. But we DO need it locally to decide whether to
      // increment newWordsIntroducedToday.
      const oldState = workingLessonRef.current.wordStates[r.wordKey];
      const wasUnseen = oldState ? !oldState.seen && oldState.mastery === 0 : false;

      // Optimistically update the working copy (so eligibleWordsForFormat
      // sees the new state for the next format pick). This mirrors the
      // original localStorage behavior — the format components read word
      // states synchronously.
      setWorkingLesson((prev) => {
        const next: Lesson = { ...prev, wordStates: { ...prev.wordStates } };
        const currentState = next.wordStates[r.wordKey];
        if (currentState) {
          if (r.isIntroduction) {
            // Introduction: just mark as seen, don't run the algorithm.
            // This prevents mastery from jumping to 2+ on FSRS-5 (where
            // quality 5 = Easy would init stability to 5.0 → mastery 2).
            next.wordStates[r.wordKey] = introduceWord(currentState);
            if (wasUnseen) {
              next.newWordsIntroducedToday = prev.newWordsIntroducedToday + 1;
            }
          } else {
            const newState = applyAlgorithmResult(next, r.wordKey, r.quality);
            if (newState) {
              next.wordStates[r.wordKey] = newState;
              if (wasUnseen && newState.seen) {
                next.newWordsIntroducedToday = prev.newWordsIntroducedToday + 1;
              }
            }
          }
        }
        workingLessonRef.current = next; // sync ref immediately
        return next;
      });

      // Fire-and-forget: persist the review to the server.
      // The server runs the same algorithm (sm2Update / fsrs5Update) on the
      // authoritative WordState row. Client-side retry on 5xx/network errors
      // provides defense in depth on top of the server's withRetry.
      void submitReview(r);

      // Update counts (state + ref)
      // Debounce sound: formats like MatchPairs and Sentence formats emit
      // multiple results at once. Only play one sound per ~400ms window.
      const now = Date.now();
      const canPlaySound = now - lastSoundTimeRef.current > 400;
      // Introduction results don't play correct/wrong sounds — the format's
      // own "click" sound is the only feedback (intro is an acknowledgment,
      // not a quiz question, so "correct" would be misleading and would
      // double-play with the format's "click").
      const playResultSound = !r.isIntroduction && canPlaySound;
      if (r.correct) {
        setCorrectCount((c) => { correctCountRef.current = c + 1; return c + 1; });
        if (playResultSound) {
          playSound("correct");
          lastSoundTimeRef.current = now;
        }
      } else {
        setWrongCount((c) => { wrongCountRef.current = c + 1; return c + 1; });
        if (playResultSound) {
          playSound("wrong");
          lastSoundTimeRef.current = now;
        }
        if (isRush) {
          const newLives = Math.max(0, livesRemainingRef.current - 1);
          livesRemainingRef.current = newLives;
          setLivesRemaining(newLives);
          // Check lives end condition immediately (mid-format)
          if (newLives <= 0) {
            // Defer endSession to avoid setState-in-callback issues
            setTimeout(() => endSession(), 0);
          }
        }
      }
      setWordsStudied((prev) => {
        const next = new Set(prev);
        next.add(r.wordKey);
        wordsStudiedRef.current = next;
        return next;
      });
    },
    [isRush, endSession, submitReview]
  );

  // Handle format completion
  const handleFormatDone = useCallback(
    (_results: QuestionResult[], questionCount: number) => {
      const newQ = questionsServedRef.current + questionCount;
      questionsServedRef.current = newQ;
      setQuestionsServed(newQ);
      setCurrentFormat(null); // triggers next pick in useEffect
    },
    []
  );

  // When currentFormat becomes null (format done), check end conditions & pick next
  useEffect(() => {
    if (sessionComplete) return;
    if (currentFormat !== null) return;

    if (checkEndConditions()) {
      endSession();
      return;
    }

    // In debug mode, always force the same format — BUT only if it's actually
    // servable. If the user picked a debug format that can't run with the
    // current eligible words (e.g. Marble Game needs 6+ words at mastery but
    // the lesson only has 5), we'd otherwise loop forever: format mounts →
    // returns null → onDone → format re-mounts → ...
    let fmt: FormatType | null;
    if (debugFormat) {
      if (!isFormatServable(workingLessonRef.current, debugFormat)) {
        // Debug format can't run — end the session so the user sees a clean
        // exit instead of an infinite loop.
        endSession();
        return;
      }
      fmt = debugFormat;
    } else {
      fmt = pickNextFormat(workingLessonRef.current, recentFormats, usedFormatsThisSession);
    }
    if (!fmt) {
      endSession();
      return;
    }
    setCurrentFormat(fmt);
    setFormatKey((k) => k + 1);
    setRecentFormats((prev) => [...prev.slice(-4), fmt]);
    if (!debugFormat) {
      setUsedFormatsThisSession((prev) => new Set(prev).add(fmt));
    }
  }, [
    currentFormat,
    sessionComplete,
    recentFormats,
    usedFormatsThisSession,
    checkEndConditions,
    endSession,
    debugFormat,
  ]);

  const remainingBudget = useMemo(() => {
    if (isRush) return 1000;
    return Math.max(1, target - questionsServedRef.current);
  }, [isRush, target, currentFormat, formatKey]);

  // Handle exit — save progress before leaving (must be before any early return)
  const handleExit = useCallback(() => {
    if (!sessionCompleteRef.current && (questionsServedRef.current > 0 || correctCountRef.current > 0)) {
      endSession();
    }
    onExit();
  }, [endSession, onExit]);

  const renderFormat = () => {
    if (!currentFormat) return null;
    const props = {
      lesson: workingLessonRef.current,
      eligibleWords,
      onResult: handleResult,
      onDone: handleFormatDone,
      mode,
      remainingBudget,
    };
    switch (currentFormat) {
      case "introduction":
        return <IntroductionFormat key={formatKey} {...props} />;
      case "pickAnswer":
        return <PickAnswerFormat key={formatKey} {...props} />;
      case "spotTheLie":
        return <SpotTheLieFormat key={formatKey} {...props} />;
      case "matchPairs":
        return <MatchPairsFormat key={formatKey} {...props} />;
      case "wordScramble":
        return <WordScrambleFormat key={formatKey} {...props} />;
      case "fillGap":
        return <FillGapFormat key={formatKey} {...props} />;
      case "sentenceComprehension":
        return <SentenceComprehensionFormat key={formatKey} {...props} />;
      case "sentenceTranslation":
        return <SentenceTranslationFormat key={formatKey} {...props} />;
      case "shellGame":
        return <ShellGameFormat key={formatKey} {...props} />;
      case "cardGame":
        return <CardGameFormat key={formatKey} {...props} />;
      case "marbleGame":
        return <MarbleGameFormat key={formatKey} {...props} />;
      default:
        return null;
    }
  };

  // Session summary screen
  if (sessionComplete && sessionRecord) {
    const totalAnswered = sessionRecord.correctCount + sessionRecord.wrongCount;
    const accuracy = totalAnswered > 0 ? Math.round((sessionRecord.correctCount / totalAnswered) * 100) : 0;
    const isGood = accuracy >= 80;
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <Card className="p-8 text-center relative overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-b ${isGood ? "from-emerald-500/10" : "from-amber-500/10"} to-transparent`} />
            <div className="relative">
              <div className={`inline-flex h-16 w-16 items-center justify-center rounded-full ${isGood ? "bg-emerald-500/20" : "bg-amber-500/20"} mb-4`}>
                <Trophy className={`h-8 w-8 ${isGood ? "text-emerald-600" : "text-amber-600"}`} />
              </div>
              <h1 className="text-2xl font-bold mb-1">
                {isGood ? "Great work!" : "Session complete"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {mode === "daily" ? "Daily Review" : mode === "lesson" ? "Lesson" : "Rush"} · {Math.floor(sessionRecord.durationSec / 60)}m {sessionRecord.durationSec % 60}s
                {isRush && ` · ${RUSH_LIVES - (sessionRecord.livesUsed || 0)} lives left`}
              </p>
            </div>
          </Card>
        </motion.div>

        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <Target className="h-5 w-5 mx-auto mb-1 text-primary" />
            <div className="text-2xl font-bold">{accuracy}%</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Accuracy</div>
          </Card>
          <Card className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
            <div className="text-2xl font-bold">{sessionRecord.correctCount}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Correct</div>
          </Card>
          <Card className="p-4 text-center">
            <XCircle className="h-5 w-5 mx-auto mb-1 text-red-600" />
            <div className="text-2xl font-bold">{sessionRecord.wrongCount}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Wrong</div>
          </Card>
        </div>

        <Card className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Questions served</span>
          </div>
          <span className="text-sm font-medium">{sessionRecord.questionsServed}</span>
        </Card>

        <div className="flex flex-wrap gap-2 justify-center pt-2">
          <Button onClick={onExit} size="lg" className="gap-1">
            Back to Lesson
          </Button>
        </div>
      </div>
    );
  }

  const progressPct = isRush
    ? ((RUSH_DURATION_SEC * 1000 - timeRemainingMs) / (RUSH_DURATION_SEC * 1000)) * 100
    : target > 0
    ? Math.min(100, (questionsServed / target) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 sticky top-14 z-30 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2 -mx-2 px-2 rounded-lg">
        <Button variant="ghost" size="sm" onClick={handleExit} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Exit</span>
        </Button>
        <div className="flex items-center gap-3 text-sm">
          {isRush ? (
            <>
              <span className="flex items-center gap-1 font-mono">
                <Clock className="h-4 w-4" />
                {Math.floor(timeRemainingMs / 60000)}:
                {String(Math.floor((timeRemainingMs % 60000) / 1000)).padStart(2, "0")}
              </span>
              <span className="flex items-center gap-1">
                {Array.from({ length: RUSH_LIVES }).map((_, i) => (
                  <Heart
                    key={i}
                    className={`h-4 w-4 ${
                      i < livesRemaining
                        ? "fill-red-500 text-red-500"
                        : "text-muted-foreground"
                    }`}
                  />
                ))}
              </span>
            </>
          ) : (
            <span>
              {questionsServed} / {target}
            </span>
          )}
          {currentFormat && (
            <Badge variant="outline">{FORMAT_NAMES[currentFormat]}</Badge>
          )}
        </div>
      </div>

      <Progress value={progressPct} className="h-2" />

      {/* Current format */}
      <div className="pt-4">{renderFormat()}</div>
    </div>
  );
}
