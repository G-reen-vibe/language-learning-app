"use client";

import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UserDataProvider, useUserData } from "@/lib/user-data-context";
import { StudyMode, FormatType } from "@/lib/types";
import HomeView from "@/components/HomeView";
import LessonView from "@/components/LessonView";
import StudyView from "@/components/StudyView";
import { Header } from "@/components/Header";
import {
  THEMES,
  applyTheme,
  loadThemePref,
  saveThemePref,
  loadSoundPref,
  saveSoundPref,
  type ThemeId,
} from "@/lib/themes";
import { setSoundEnabled, playSound, resumeAudio } from "@/lib/sounds";

type View =
  | { type: "home" }
  | { type: "lesson"; lessonId: string }
  | { type: "study"; lessonId: string; mode: StudyMode }
  | { type: "debug"; lessonId: string; format: FormatType };

function AppContent() {
  const { data, getLesson } = useUserData();
  const [view, setView] = useState<View>({ type: "home" });

  // Theme & sound preferences (lifted to app level so Header can control them)
  const [theme, setTheme] = useState<ThemeId>("default");
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    const t = loadThemePref();
    setTheme(t);
    applyTheme(t);
    const s = loadSoundPref();
    setSoundOn(s);
    setSoundEnabled(s);
  }, []);

  const handleThemeChange = (t: ThemeId) => {
    setTheme(t);
    applyTheme(t);
    saveThemePref(t);
    resumeAudio();
    playSound("click");
  };

  const handleSoundToggle = (on: boolean) => {
    setSoundOn(on);
    setSoundEnabled(on);
    saveSoundPref(on);
    if (on) {
      resumeAudio();
      playSound("click");
    }
  };

  // If the lesson being viewed/studied no longer exists, go home
  useEffect(() => {
    if (view.type !== "home") {
      const exists = data.lessons.some((l) => l.id === view.lessonId);
      if (!exists) setView({ type: "home" });
    }
  }, [data.lessons, view]);

  const goHome = () => setView({ type: "home" });

  // Determine the animation key based on the current view
  const animKey =
    view.type === "home"
      ? "home"
      : view.type === "lesson"
      ? `lesson-${view.lessonId}`
      : view.type === "study"
      ? `study-${view.lessonId}-${view.mode}`
      : `debug-${view.lessonId}-${view.format}`;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header
        onGoHome={goHome}
        showHomeButton={view.type !== "home"}
        theme={theme}
        onThemeChange={handleThemeChange}
        soundOn={soundOn}
        onSoundToggle={handleSoundToggle}
      />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={animKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {view.type === "home" && (
              <HomeView
                onOpenLesson={(lessonId) => setView({ type: "lesson", lessonId })}
              />
            )}
            {view.type === "lesson" && (() => {
              const lesson = getLesson(view.lessonId);
              if (!lesson) return null;
              return (
                <LessonView
                  lesson={lesson}
                  onBack={goHome}
                  onStartStudy={(mode) =>
                    setView({ type: "study", lessonId: view.lessonId, mode })
                  }
                  onDebugFormat={(format) =>
                    setView({ type: "debug", lessonId: view.lessonId, format })
                  }
                />
              );
            })()}
            {view.type === "study" && (() => {
              const lesson = getLesson(view.lessonId);
              if (!lesson) return null;
              return (
                <StudyView
                  lesson={lesson}
                  mode={view.mode}
                  onExit={() => setView({ type: "lesson", lessonId: view.lessonId })}
                />
              );
            })()}
            {view.type === "debug" && (() => {
              const lesson = getLesson(view.lessonId);
              if (!lesson) return null;
              return (
                <StudyView
                  lesson={lesson}
                  mode="daily"
                  debugFormat={view.format}
                  onExit={() => setView({ type: "lesson", lessonId: view.lessonId })}
                />
              );
            })()}
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="mt-auto border-t border-border py-4 text-center text-xs text-muted-foreground">
        Linguo · FSRS-5 & SM-2 spaced repetition
      </footer>
    </div>
  );
}

export default function Page() {
  return (
    <UserDataProvider>
      <AppContent />
    </UserDataProvider>
  );
}
