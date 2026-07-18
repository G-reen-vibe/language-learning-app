"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Languages, Home, Palette, Volume2, VolumeX } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { THEMES, type ThemeId } from "@/lib/themes";

interface HeaderProps {
  onGoHome: () => void;
  showHomeButton: boolean;
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  soundOn: boolean;
  onSoundToggle: (on: boolean) => void;
}

export function Header({
  onGoHome,
  showHomeButton,
  theme,
  onThemeChange,
  soundOn,
  onSoundToggle,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <button
          onClick={onGoHome}
          className="flex items-center gap-2 group"
          aria-label="Linguo home"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Languages className="h-4 w-4" />
          </span>
          <span className="font-semibold text-lg tracking-tight">Linguo</span>
        </button>
        <div className="flex items-center gap-1">
          {showHomeButton && (
            <Button variant="ghost" size="sm" onClick={onGoHome} className="gap-1">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          )}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent transition-colors">
            <Palette className="h-4 w-4 text-muted-foreground" />
            <Select value={theme} onValueChange={(v) => onThemeChange(v as ThemeId)}>
              <SelectTrigger className="w-28 h-7 text-xs border-0 px-1 bg-transparent focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEMES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={soundOn ? "Mute sound effects" : "Unmute sound effects"}
            onClick={() => onSoundToggle(!soundOn)}
            className="h-9 w-9"
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
