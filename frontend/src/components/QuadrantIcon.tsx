"use client";

import type { QuadrantIconId } from "@/lib/todoConstants";

/**
 * Line icons for Eisenhower quadrants (replaces emoji chrome).
 */
export default function QuadrantIcon({
  id,
  className = "w-3.5 h-3.5",
}: {
  id: QuadrantIconId;
  className?: string;
}) {
  const common = {
    className,
    fill: "none" as const,
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.75,
  };

  switch (id) {
    case "priority":
      return (
        <svg {...common} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M8 8l4-4 4 4M8 16l4 4 4-4" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 3L6 14h5l-1 7 7-11h-5l1-7z" />
        </svg>
      );
    case "defer":
      return (
        <svg {...common} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 5v14M14 5v14" />
        </svg>
      );
    default:
      return null;
  }
}
