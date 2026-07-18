"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PromptCardProps {
  label?: string;
  text: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses: Record<NonNullable<PromptCardProps["size"]>, string> = {
  sm: "text-base min-h-[80px] p-4",
  md: "text-lg min-h-[120px] p-5",
  lg: "text-2xl min-h-[160px] p-6",
  xl: "text-3xl min-h-[200px] p-8",
};

/**
 * A bordered card displaying a prompt (question text) with an optional label
 * badge in the top-left corner. Used by quiz formats to show the question side.
 */
export function PromptCard({ label, text, size = "md", className }: PromptCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative rounded-xl border bg-card text-card-foreground flex flex-col items-center justify-center text-center break-words border-primary/30",
        sizeClasses[size],
        className
      )}
    >
      {label && (
        <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wide text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted/60">
          {label}
        </span>
      )}
      <span className="font-medium leading-snug">{text}</span>
    </motion.div>
  );
}

/** Shared feedback color classes for correct/wrong/selected states. */
export const feedbackColors = {
  correct: "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  wrong: "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  selected: "border-primary bg-primary/10 ring-2 ring-primary/30",
  matched: "border-primary/50 bg-primary/5",
  default: "border-border bg-card hover:border-primary/40",
};
