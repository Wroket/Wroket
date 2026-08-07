/**
 * Centralized tag / badge color tokens (light + dark).
 * Dual wash calme (A): couleur = urgence + Eisenhower + effort emerald ;
 * priorité medium/low et échéances « ok » = zinc.
 */

/**
 * Single urgency hue (rose); intensity = severity (mirrors TAG_EFFORT emerald ladder).
 * High stays strongest; Low is soft wash — not zinc (was colliding with Medium).
 */
export const TAG_PRIORITY = {
  high:
    "rounded-sm bg-rose-200 text-rose-950 dark:bg-rose-800/55 dark:text-rose-100",
  medium:
    "rounded-sm bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  low:
    "rounded-sm bg-rose-50 text-rose-600 dark:bg-rose-950/25 dark:text-rose-400",
} as const;

/** Single Dual-wash hue (emerald); intensity = charge, not a new color. */
export const TAG_EFFORT = {
  light:
    "rounded-sm bg-emerald-50 text-emerald-700 dark:bg-emerald-950/25 dark:text-emerald-400",
  medium:
    "rounded-sm bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  heavy:
    "rounded-sm bg-emerald-200 text-emerald-950 dark:bg-emerald-800/55 dark:text-emerald-100",
} as const;

export const TAG_QUADRANT = {
  "do-first": "rounded-sm bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  /** Indigo — Dual wash (important / schedule). */
  schedule: "rounded-sm bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
  delegate: "rounded-sm bg-amber-50 text-amber-900 dark:bg-amber-950/35 dark:text-amber-200",
  eliminate: "rounded-sm bg-zinc-100 text-zinc-700 dark:bg-slate-800/80 dark:text-slate-300",
} as const;

export const TAG_DEADLINE = {
  overdue: "rounded-sm bg-rose-100 text-rose-900 dark:bg-rose-900/35 dark:text-rose-200",
  today: "rounded-sm bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  /** Zinc — no chromatic ladder for « ok » deadlines. */
  tomorrow: "rounded-sm bg-zinc-100 text-zinc-700 dark:bg-slate-700/50 dark:text-slate-300",
  week: "rounded-sm bg-zinc-100 text-zinc-700 dark:bg-slate-700/50 dark:text-slate-300",
  far: "rounded-sm bg-zinc-100 text-zinc-600 dark:bg-slate-600/40 dark:text-slate-400",
} as const;

export const TAG_AUX = {
  subtask:
    "rounded-sm bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/45",
  slot: "rounded-sm bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
  userTag: "rounded-sm bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
} as const;

/**
 * Soft card / plot washes — same hues as TAG_QUADRANT (translucent surfaces).
 */
export const QUADRANT_SURFACE = {
  "do-first":
    "bg-[rgb(244_63_94/0.08)] dark:bg-[rgb(244_63_94/0.12)] border-[rgb(244_63_94/0.22)] dark:border-[rgb(244_63_94/0.28)]",
  schedule:
    "bg-[rgb(99_102_241/0.07)] dark:bg-[rgb(99_102_241/0.12)] border-[rgb(99_102_241/0.2)] dark:border-[rgb(99_102_241/0.28)]",
  delegate:
    "bg-[rgb(245_158_11/0.08)] dark:bg-[rgb(245_158_11/0.12)] border-[rgb(245_158_11/0.22)] dark:border-[rgb(245_158_11/0.28)]",
  eliminate:
    "bg-[rgb(148_163_184/0.06)] dark:bg-[rgb(148_163_184/0.1)] border-[rgb(148_163_184/0.2)] dark:border-[rgb(148_163_184/0.25)]",
} as const;

/** RGB channels for constellation sky washes / star halos (do-first / schedule / …). */
export const QUADRANT_RGB = {
  "do-first": { r: 244, g: 63, b: 94 },
  schedule: { r: 99, g: 102, b: 241 },
  delegate: { r: 245, g: 158, b: 11 },
  eliminate: { r: 148, g: 163, b: 184 },
} as const;
