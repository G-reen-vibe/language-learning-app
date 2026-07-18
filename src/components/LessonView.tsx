"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Trash2,
  RotateCcw,
  Settings,
  BookOpen,
  Zap,
  Calendar,
  Heart,
  Bug,
  TrendingUp,
  Clock,
  CheckCircle2,
  Flame,
  Layers,
} from "lucide-react";
import { useUserData } from "@/lib/user-data-context";
import { Lesson, StudyMode, FormatType, FORMAT_NAMES, FORMAT_DIFFICULTY } from "@/lib/types";
import { wordKeyOf } from "@/lib/aspects";
import { format, formatDistanceToNow } from "date-fns";

interface LessonViewProps {
  lesson: Lesson;
  onBack: () => void;
  onStartStudy: (mode: StudyMode) => void;
  onDebugFormat: (format: FormatType) => void;
}

const MODE_META: Record<
  StudyMode,
  { icon: React.ComponentType<{ className?: string }>; label: string; desc: string; accent: string; iconBg: string }
> = {
  daily: {
    icon: Calendar,
    label: "Daily Review",
    desc: "30 questions. Balanced mix of new words and review.",
    accent: "text-emerald-600",
    iconBg: "bg-emerald-500/10",
  },
  lesson: {
    icon: BookOpen,
    label: "Lesson",
    desc: "100 questions. Deep practice session.",
    accent: "text-blue-600",
    iconBg: "bg-blue-500/10",
  },
  rush: {
    icon: Zap,
    label: "Rush",
    desc: "5 minutes, 3 lives. Fast-paced challenge.",
    accent: "text-rose-600",
    iconBg: "bg-rose-500/10",
  },
};

export default function LessonView({ lesson, onBack, onStartStudy, onDebugFormat }: LessonViewProps) {
  const {
    updateLessonSettings,
    updateLessonName,
    deleteLesson,
    resetLessonProgress,
  } = useUserData();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(lesson.name);
  const [showSettings, setShowSettings] = useState(false);

  const stats = useMemo(() => {
    const states = Object.values(lesson.wordStates);
    const totalWords = lesson.words.length;
    const seenWords = states.filter((s) => s.seen).length;
    const masteredWords = states.filter((s) => s.mastery >= 5).length;
    const avgMastery =
      states.length > 0 ? states.reduce((s, w) => s + w.mastery, 0) / states.length : 0;
    const masteryDistribution = [0, 0, 0, 0, 0, 0];
    for (const s of states) {
      const m = Math.max(0, Math.min(5, s.mastery | 0));
      masteryDistribution[m]++;
    }
    const totalReviews = states.reduce((s, w) => s + w.totalReviews, 0);
    const totalCorrect = states.reduce((s, w) => s + w.totalCorrect, 0);
    const accuracy = totalReviews > 0 ? (totalCorrect / totalReviews) * 100 : 0;
    return {
      totalWords,
      seenWords,
      masteredWords,
      avgMastery,
      masteryDistribution,
      totalReviews,
      accuracy,
      sessions: lesson.sessions,
    };
  }, [lesson]);

  const recentSessions = useMemo(
    () => [...lesson.sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 10),
    [lesson.sessions]
  );

  const handleSaveName = () => {
    updateLessonName(lesson.id, nameDraft.trim() || "Untitled Lesson");
    setEditingName(false);
  };

  const masteryPct = Math.round((stats.avgMastery / 5) * 100);
  const progressPct = stats.totalWords > 0 ? Math.round((stats.seenWords / stats.totalWords) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Title row */}
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                autoFocus
                className="text-2xl font-bold"
              />
              <Button onClick={handleSaveName}>Save</Button>
              <Button variant="outline" onClick={() => setEditingName(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="text-2xl font-bold tracking-tight cursor-pointer hover:bg-accent px-2 py-1 rounded -ml-2 truncate"
                  onClick={() => {
                    setNameDraft(lesson.name);
                    setEditingName(true);
                  }}
                >
                  {lesson.name}
                </h1>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {lesson.settings.algorithm}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {stats.totalWords} words
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 px-2 -ml-2">
                Created {format(new Date(lesson.createdAt), "MMM d, yyyy")}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings((s) => !s)}
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Reset progress">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset lesson progress?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will clear all word states, session history, and mastery. The word list
                  itself is kept. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => resetLessonProgress(lesson.id)}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-red-600" aria-label="Delete lesson">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this lesson?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the lesson, all words, and all progress. This cannot
                  be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    deleteLesson(lesson.id);
                    onBack();
                  }}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lesson Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Spaced Repetition Algorithm</Label>
              <Select
                value={lesson.settings.algorithm}
                onValueChange={(v) =>
                  updateLessonSettings(lesson.id, { algorithm: v as "SM-2" | "FSRS-5" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SM-2">SM-2 (classic)</SelectItem>
                  <SelectItem value="FSRS-5">FSRS-5 (modern)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                SM-2 is the classic algorithm (Anki-style). FSRS-5 is a newer, more
                efficient scheduler.
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                Max new words per day:{" "}
                <span className="font-semibold">{lesson.settings.maxNewWordsPerDay}</span>
              </Label>
              <Slider
                min={1}
                max={50}
                step={1}
                value={[lesson.settings.maxNewWordsPerDay]}
                onValueChange={(v) =>
                  updateLessonSettings(lesson.id, { maxNewWordsPerDay: v[0] })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>
                Min mastery for new words:{" "}
                <span className="font-semibold">{lesson.settings.minMasteryForNewWords}</span>
              </Label>
              <Slider
                min={1}
                max={5}
                step={1}
                value={[lesson.settings.minMasteryForNewWords]}
                onValueChange={(v) =>
                  updateLessonSettings(lesson.id, { minMasteryForNewWords: v[0] })
                }
              />
              <p className="text-xs text-muted-foreground">
                Existing words must reach this mastery before new words are introduced.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Mastery"
          value={`${masteryPct}%`}
          progress={masteryPct}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Introduced"
          value={`${stats.seenWords}/${stats.totalWords}`}
          sub={`${progressPct}% seen`}
          accent={stats.seenWords > 0}
        />
        <StatCard
          icon={<Flame className="h-4 w-4" />}
          label="Mastered"
          value={stats.masteredWords}
          sub="mastery ≥ 5"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Accuracy"
          value={`${stats.accuracy.toFixed(0)}%`}
          sub={`${stats.totalReviews} reviews`}
        />
      </div>

      {/* Mode picker */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-3">Choose a practice mode</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(Object.keys(MODE_META) as StudyMode[]).map((mode) => {
            const meta = MODE_META[mode];
            const Icon = meta.icon;
            return (
              <motion.button
                key={mode}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onStartStudy(mode)}
                className="text-left rounded-xl border border-border p-4 hover:border-primary/40 hover:shadow-sm transition-all bg-card"
              >
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${meta.iconBg} mb-3`}>
                  <Icon className={`h-5 w-5 ${meta.accent}`} />
                </div>
                <h3 className="font-semibold text-sm">{meta.label}</h3>
                <p className="text-xs text-muted-foreground mt-1 mb-3">{meta.desc}</p>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  {mode === "rush" ? (
                    <>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> 5 min
                      </span>
                      <span className="flex items-center gap-1 text-rose-600">
                        <Heart className="h-3 w-3" /> 3 lives
                      </span>
                    </>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {mode === "daily" ? "30" : "100"} questions
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </Card>

      {/* Mastery distribution */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4" /> Mastery distribution
        </h2>
        <div className="space-y-2">
          {stats.masteryDistribution.map((count, level) => {
            const pct = stats.totalWords > 0 ? (count / stats.totalWords) * 100 : 0;
            const labels = [
              "Never seen",
              "Introduced",
              "Basic",
              "Intermediate",
              "Advanced",
              "Mastered",
            ];
            return (
              <div key={level} className="flex items-center gap-3">
                <div className="w-28 text-sm">{labels[level]}</div>
                <div className="flex-1">
                  <Progress value={pct} className="h-4" />
                </div>
                <div className="w-12 text-right text-sm font-mono">{count}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold mb-3">Recent sessions</h2>
          <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
            {recentSessions.map((s) => {
              const totalAnswered = s.correctCount + s.wrongCount;
              const accuracy =
                totalAnswered > 0 ? Math.round((s.correctCount / totalAnswered) * 100) : 0;
              const modeIcon =
                s.mode === "daily" ? (
                  <Calendar className="h-4 w-4" />
                ) : s.mode === "lesson" ? (
                  <BookOpen className="h-4 w-4" />
                ) : (
                  <Zap className="h-4 w-4" />
                );
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {modeIcon}
                    <span className="capitalize">{s.mode}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(s.startedAt), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span>{s.questionsServed} Q</span>
                    <span className="text-green-600">{s.correctCount}✓</span>
                    <span className="text-red-600">{s.wrongCount}✗</span>
                    <span className="font-mono">{accuracy}%</span>
                    {s.livesUsed !== undefined && (
                      <span className="text-xs">
                        <Heart className="h-3 w-3 inline" /> {3 - s.livesUsed}/3
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Word list */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-3">Words ({lesson.words.length})</h2>
        <div className="space-y-1.5 max-h-96 overflow-y-auto scrollbar-thin">
          {lesson.words.map((w, i) => {
            const key = wordKeyOf(w);
            const state = lesson.wordStates[key];
            const mastery = state ? state.mastery : 0;
            const masteryColors = [
              "bg-gray-300",
              "bg-red-400",
              "bg-orange-400",
              "bg-yellow-400",
              "bg-lime-500",
              "bg-green-600",
            ];
            return (
              <div
                key={i}
                className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-muted/30"
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${masteryColors[mastery]} shrink-0`}
                >
                  {mastery}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium truncate">{w.word}</span>
                  {w.translation && (
                    <span className="text-xs text-muted-foreground truncate ml-2">
                      — {w.translation}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0">
                  {state?.totalReviews || 0} reviews
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Debug panel */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bug className="h-5 w-5 text-orange-500" />
            Debug: Test Game Modes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Click any format below to launch a test session using ALL words in this lesson
            (mastery requirements are ignored). Useful for verifying each game mode works.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {(Object.keys(FORMAT_NAMES) as FormatType[]).map((fmt) => {
              const diff = FORMAT_DIFFICULTY[fmt];
              const diffColors = [
                "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
                "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
                "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
              ];
              return (
                <button
                  key={fmt}
                  onClick={() => onDebugFormat(fmt)}
                  className="flex flex-col items-start gap-1 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-accent transition-all text-left"
                >
                  <span className="font-medium text-sm">{FORMAT_NAMES[fmt]}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${diffColors[diff]}`}>
                    Diff {diff}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  progress?: number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={accent ? "text-primary" : ""}>{icon}</span>
      </div>
      <div className={`text-2xl font-bold mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      {progress !== undefined && <Progress value={progress} className="h-1 mt-2" />}
    </Card>
  );
}
