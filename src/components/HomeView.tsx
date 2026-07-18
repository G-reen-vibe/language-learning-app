"use client";

import React, { useState, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Plus,
  Download,
  Upload,
  BookOpen,
  Clock,
  Trash2,
  Sparkles,
  Target,
  CheckCircle2,
  Flame,
  Layers,
} from "lucide-react";
import { useUserData } from "@/lib/user-data-context";
import { Lesson } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface HomeViewProps {
  onOpenLesson: (lessonId: string) => void;
}

const SAMPLE_LESSON = `[
  {
    "word": "gato",
    "definition": "un animal doméstico de la familia de los felinos",
    "synonym": "=minino",
    "translation": "cat",
    "explanation": "Un gato es un animal pequeño que maúlla y caza ratones.",
    "alt1": "gata",
    "sentences": [
      {
        "exert": "El [the] gato [cat] duerme [sleeps] en [on] el [the] sofá [couch].",
        "translation": "The cat sleeps on the couch."
      },
      {
        "exert": "Mi [my] gato [cat] es [is] muy [very] negro [black].",
        "translation": "My cat is very black."
      }
    ]
  },
  {
    "word": "perro",
    "definition": "un animal doméstico que ladra",
    "synonym": "=can",
    "translation": "dog",
    "explanation": "Un perro es el mejor amigo del hombre.",
    "alt1": "perra",
    "sentences": [
      {
        "exert": "El [the] perro [dog] come [eats] carne [meat].",
        "translation": "The dog eats meat."
      }
    ]
  },
  {
    "word": "casa",
    "definition": "un edificio para vivir",
    "synonym": "=hogar",
    "translation": "house",
    "explanation": "Una casa es donde vives con tu familia.",
    "alt1": "casas",
    "sentences": [
      {
        "exert": "La [the] casa [house] es [is] grande [big].",
        "translation": "The house is big."
      }
    ]
  },
  {
    "word": "agua",
    "definition": "líquido transparente esencial para la vida",
    "translation": "water",
    "explanation": "El agua es importante para beber.",
    "sentences": [
      {
        "exert": "Bebo [I drink] agua [water] todos [every] los [the] días [days].",
        "translation": "I drink water every day."
      }
    ]
  },
  {
    "word": "comer",
    "definition": "poner comida en la boca y tragarla",
    "synonym": "=alimentarse",
    "translation": "to eat",
    "explanation": "Comer es necesario para vivir.",
    "alt1": "como",
    "alt2": "come",
    "sentences": [
      {
        "exert": "Yo [I] como [eat] pan [bread] por [for] la [the] mañana [morning].",
        "translation": "I eat bread in the morning."
      }
    ]
  }
]`;

export default function HomeView({ onOpenLesson }: HomeViewProps) {
  const { data, isLoading, createLessonFromJson, importData, exportData, deleteLesson } = useUserData();
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [lessonName, setLessonName] = useState("");
  const [lessonJson, setLessonJson] = useState("");
  const [importJson, setImportJson] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const lessonFileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    setCreateError(null);
    const result = createLessonFromJson(lessonName, lessonJson);
    if (!result.ok) {
      setCreateError(result.error || "Failed to create lesson");
      return;
    }
    setShowCreate(false);
    setLessonName("");
    setLessonJson("");
  };

  const handleImport = async () => {
    setImportError(null);
    setImporting(true);
    try {
      const result = await importData(importJson);
      if (!result.ok) {
        setImportError(result.error || "Failed to import");
        return;
      }
      setShowImport(false);
      setImportJson("");
    } catch (e) {
      setImportError("Import failed: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const json = await exportData();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `language-learning-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Export failed: " + (e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleImportFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportJson(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleLessonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setLessonJson(text);
      if (!lessonName) setLessonName(file.name.replace(/\.json$/i, ""));
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleLoadSample = () => {
    setCreateError(null);
    setLessonJson(SAMPLE_LESSON);
    setLessonName("Spanish Sample");
    setShowCreate(true);
  };

  const totalWords = data.lessons.reduce((s, l) => s + l.words.length, 0);
  const totalSeen = data.lessons.reduce(
    (s, l) => s + Object.values(l.wordStates).filter((ws) => ws.seen).length,
    0
  );

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-background to-accent/30 p-6 sm:p-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <Badge variant="secondary" className="gap-1 w-fit">
              <Sparkles className="h-3 w-3" /> FSRS-5 · SM-2
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Learn a language, remember it forever.
            </h1>
            <p className="text-muted-foreground text-base">
              Import a word list with translations, sentences, and alt forms, then practice
              with eleven mastery-driven game modes — from introductions to marble games.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="lg" className="gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> New Lesson
            </Button>
            <Button size="lg" variant="outline" onClick={handleLoadSample}>
              Load Sample
            </Button>
            <Button size="lg" variant="outline" onClick={() => setShowImport(true)} className="gap-2">
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button size="lg" variant="outline" onClick={handleExport} disabled={exporting} className="gap-2">
              <Download className="h-4 w-4" /> {exporting ? "Exporting..." : "Export"}
            </Button>
          </div>
        </div>
      </section>

      {/* Global stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<BookOpen className="h-4 w-4" />} label="Lessons" value={data.lessons.length} />
        <StatCard icon={<Layers className="h-4 w-4" />} label="Total Words" value={totalWords} />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Introduced"
          value={totalSeen}
          accent={totalSeen > 0}
        />
        <StatCard
          icon={<Flame className="h-4 w-4" />}
          label="Day Streak"
          value={data.stats.currentStreak}
          accent={data.stats.currentStreak > 0}
        />
      </section>

      {/* Lessons grid */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl font-semibold">Your lessons</h2>
          {data.lessons.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {data.lessons.length} lesson{data.lessons.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : data.lessons.length === 0 ? (
          <EmptyState onCreate={() => setShowCreate(true)} onLoadSample={handleLoadSample} />
        ) : (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.lessons.map((lesson) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                onOpen={() => onOpenLesson(lesson.id)}
                onDelete={() => deleteLesson(lesson.id)}
              />
            ))}
          </motion.div>
        )}
      </section>

      {/* Create lesson dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Lesson</DialogTitle>
            <DialogDescription>
              Paste your JSON word list below, or upload a .json file. See the sample format
              below the input.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lesson-name">Lesson Name</Label>
              <Input
                id="lesson-name"
                value={lessonName}
                onChange={(e) => setLessonName(e.target.value)}
                placeholder="e.g. Spanish Basics"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="lesson-json">Word List JSON</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => lessonFileInputRef.current?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Upload File
                </Button>
                <input
                  ref={lessonFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleLessonFileUpload}
                />
              </div>
              <Textarea
                id="lesson-json"
                value={lessonJson}
                onChange={(e) => setLessonJson(e.target.value)}
                placeholder="Paste JSON here..."
                className="min-h-48 font-mono text-xs"
              />
            </div>
            {createError && <div className="text-sm text-red-600">{createError}</div>}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                View sample format
              </summary>
              <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
                {SAMPLE_LESSON}
              </pre>
            </details>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create Lesson</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import data dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import User Data</DialogTitle>
            <DialogDescription>
              Paste a previously-exported backup JSON, or upload a backup file. This will
              REPLACE all current data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="import-json">Backup JSON</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => importFileInputRef.current?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Upload File
                </Button>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportFileUpload}
                />
              </div>
              <Textarea
                id="import-json"
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder="Paste backup JSON here..."
                className="min-h-48 font-mono text-xs"
              />
            </div>
            {importError && <div className="text-sm text-red-600">{importError}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)} disabled={importing}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={importing} className="bg-orange-500 hover:bg-orange-600">
              {importing ? "Importing..." : "Import & Replace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={accent ? "text-primary" : ""}>{icon}</span>
      </div>
      <div className={`text-2xl font-bold mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}

function EmptyState({
  onCreate,
  onLoadSample,
}: {
  onCreate: () => void;
  onLoadSample: () => void;
}) {
  return (
    <Card className="p-10 text-center border-dashed">
      <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <BookOpen className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-lg font-semibold mb-1">No lessons yet</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
        Create your first lesson by pasting a JSON word list, or load the sample Spanish
        lesson to try it out.
      </p>
      <div className="flex justify-center gap-2">
        <Button onClick={onCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Create Lesson
        </Button>
        <Button onClick={onLoadSample} variant="outline">
          Load Sample
        </Button>
      </div>
    </Card>
  );
}

function LessonCard({
  lesson,
  onOpen,
  onDelete,
}: {
  lesson: Lesson;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const stats = useMemo(() => {
    const states = Object.values(lesson.wordStates);
    const total = lesson.words.length;
    const seen = states.filter((s) => s.seen).length;
    // "Mastered" = mastery >= 0.90 (top of the continuous scale).
    const mastered = states.filter((s) => s.mastery >= 0.90).length;
    // avgMastery is now continuous [0,1].
    const avgMastery =
      states.length > 0 ? states.reduce((s, w) => s + w.mastery, 0) / states.length : 0;
    const totalReviews = states.reduce((s, w) => s + w.totalReviews, 0);
    const lastSession =
      lesson.sessions.length > 0
        ? lesson.sessions[lesson.sessions.length - 1]
        : null;
    return { total, seen, mastered, avgMastery, totalReviews, lastSession };
  }, [lesson]);

  // Mastery is continuous [0,1] — convert directly to a percentage.
  const masteryPct = Math.round(stats.avgMastery * 100);
  const progressPct = stats.total > 0 ? Math.round((stats.seen / stats.total) * 100) : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <Card
        className="p-5 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group relative overflow-hidden"
        onClick={onOpen}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="space-y-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{lesson.name}</h3>
            <p className="text-xs text-muted-foreground">
              {stats.total} words · {lesson.settings.algorithm}
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &ldquo;{lesson.name}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the lesson and all {stats.total} words with
                  their progress. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Progress (seen / total) */}
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {stats.seen}/{stats.total} seen ({progressPct}%)
            </span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
        </div>

        {/* Mastery */}
        <div className="space-y-1.5 mb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Avg Mastery</span>
            <span className="font-medium">{masteryPct}%</span>
          </div>
          <Progress value={masteryPct} className="h-1.5" />
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniStat label="Words" value={stats.total} />
          <MiniStat label="Mastered" value={stats.mastered} accent={stats.mastered > 0} />
          <MiniStat label="Reviews" value={stats.totalReviews} />
        </div>

        {/* Footer: last session */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {stats.lastSession
              ? `${stats.lastSession.correctCount}/${stats.lastSession.correctCount + stats.lastSession.wrongCount} correct · ${formatDistanceToNow(new Date(stats.lastSession.startedAt), { addSuffix: true })}`
              : "No sessions yet"}
          </span>
        </div>
      </Card>
    </motion.div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className={`text-base font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
