"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface BigTileProps {
  label?: string;
  emoji?: string;
  state?: "default" | "correct" | "wrong" | "selected";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function BigTile({
  label,
  emoji,
  state = "default",
  onClick,
  disabled = false,
  className,
}: BigTileProps) {
  const stateStyles = {
    default:
      "bg-card border-border hover:border-primary/50 hover:bg-accent hover:text-accent-foreground text-card-foreground",
    correct:
      "bg-green-100 border-green-500 text-green-900 dark:bg-green-950/60 dark:border-green-500 dark:text-green-200",
    wrong:
      "bg-amber-100 border-amber-500 text-amber-950 dark:bg-amber-950/60 dark:border-amber-500 dark:text-amber-100",
    selected:
      "bg-primary/10 border-primary text-primary shadow-sm",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer select-none text-center min-w-[96px] min-h-[96px] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm",
        stateStyles[state],
        className
      )}
    >
      {emoji && <span className="text-4xl leading-none mb-1">{emoji}</span>}
      {label && <span className="text-sm font-semibold tracking-tight">{label}</span>}
    </button>
  );
}
