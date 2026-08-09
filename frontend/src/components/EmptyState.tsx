"use client";

import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Shared empty-state chrome for Archives / Settings (title + optional hint + CTA).
 */
export default function EmptyState({ title, hint, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`text-center py-8 px-4 space-y-2 ${className}`}>
      <p className="text-sm font-medium text-zinc-600 dark:text-slate-300">{title}</p>
      {hint ? <p className="text-xs text-zinc-500 dark:text-slate-400 max-w-md mx-auto">{hint}</p> : null}
      {action ? <div className="pt-2 flex justify-center">{action}</div> : null}
    </div>
  );
}
