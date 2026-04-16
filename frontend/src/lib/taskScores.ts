import type { Effort, Priority, Todo } from "@/lib/api";
import { getEffectiveDaysLeft } from "./effectiveDue";

export type EisenhowerQuadrant = "do-first" | "schedule" | "delegate" | "eliminate";

/** All derived metrics are 0–100 unless noted. */
export type TaskScores = {
  /** Urgency from deadline (continuous) or heuristics when no date. */
  U: number;
  /** Strategic importance from priority + effort tweak. */
  I: number;
  /** Cognitive load (effort). */
  C: number;
  /** Delegatibility: high when low importance + light effort. */
  D_del: number;
  /** Composite pressure for triage / optional radar mode. */
  P: number;
  /** ROI-style importance per unit load. */
  R: number;
  /** Days until deadline; negative if overdue; null if no deadline. */
  daysLeft: number | null;
  quadrant: EisenhowerQuadrant;
};

export type RadarMode = "eisenhower" | "pressure" | "roi" | "load";

const U_STAR = 50;
const I_STAR = 50;

const EFFORT_LOAD: Record<Effort, number> = {
  light: 28,
  medium: 52,
  heavy: 78,
};

const PRIORITY_IMPORTANCE: Record<Priority, number> = {
  low: 24,
  medium: 50,
  high: 78,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Urgency from days left: logistic on log(d+1) for d >= 0; higher when overdue.
 */
function urgencyFromDaysLeft(d: number): number {
  if (d < 0) {
    return clamp(72 + 4.5 * Math.min(8, Math.abs(d)), 72, 100);
  }
  const m = 2.35;
  const s = 0.58;
  const x = Math.log(d + 1);
  return 100 / (1 + Math.exp((x - m) / s));
}

/** No deadline: urgency from priority + effort (matches legacy radar-quadrant intent). */
function urgencyNoDeadline(priority: Priority, effort: Effort): number {
  const effortBonus: Record<Effort, number> = { light: 30, medium: 12, heavy: 0 };
  const priorityBonus: Record<Priority, number> = { high: 26, medium: 12, low: 8 };
  return clamp(22 + effortBonus[effort] + priorityBonus[priority], 8, 92);
}

function importanceRaw(priority: Priority, effort: Effort): number {
  let i = PRIORITY_IMPORTANCE[priority];
  if (priority === "high" && effort === "heavy") i += 6;
  else if (priority === "medium" && effort === "heavy") i += 4;
  else if (priority === "low" && effort === "light") i -= 6;
  return clamp(i, 0, 100);
}

// scheduledSlotUrgencyBonus has been folded into computeTaskScores via
// getEffectiveDaysLeft, which takes the minimum of deadline and slot days.

function delegatability(I: number, C: number): number {
  const lowI = (100 - I) / 100;
  const lightBoost = (100 - C) / 100;
  return clamp(100 * lowI * (0.35 + 0.65 * lightBoost), 0, 100);
}

function mapToQuadrant(U: number, I: number, D_del: number): EisenhowerQuadrant {
  const highU = U >= U_STAR;
  const highI = I >= I_STAR;

  if (highU && highI) return "do-first";
  if (!highU && highI) return "schedule";
  if (highU && !highI) {
    if (D_del < 28 && I < 42) return "eliminate";
    return "delegate";
  }
  return "eliminate";
}

export function computeTaskScores(todo: Todo, nowMs: number = Date.now()): TaskScores {
  const effort = todo.effort ?? "medium";
  const C = EFFORT_LOAD[effort];

  let U: number;
  // daysLeft uses the effective due (min of deadline day and slot instant)
  // so radar urgency reflects whichever commitment comes first.
  const daysLeft = getEffectiveDaysLeft(todo, nowMs);

  if (daysLeft !== null) {
    U = urgencyFromDaysLeft(daysLeft);
  } else {
    U = urgencyNoDeadline(todo.priority, effort);
  }

  const I = importanceRaw(todo.priority, effort);
  const D_del = delegatability(I, C);
  const P = clamp(0.42 * U + 0.38 * I + 0.2 * C, 0, 100);
  const R = clamp((I / Math.max(18, C)) * 42, 0, 100);

  let quadrant = mapToQuadrant(U, I, D_del);

  /* Far deadline + low importance should stay Q4 even if U hovers at threshold */
  if (daysLeft != null && daysLeft > 21 && todo.priority === "low" && quadrant === "delegate") {
    quadrant = "eliminate";
  }

  return { U, I, C, D_del, P, R, daysLeft, quadrant };
}

export function radarXY(
  scores: TaskScores,
  mode: RadarMode,
): { x: number; y: number } {
  switch (mode) {
    case "pressure":
      return { x: scores.P, y: scores.I };
    case "roi":
      return { x: scores.R, y: scores.I };
    case "load":
      return { x: scores.U, y: scores.C };
    case "eisenhower":
    default:
      return { x: scores.U, y: scores.I };
  }
}

/**
 * Raw horizontal `left` (0–100): importance I, or charge C (load mode), before UI mirror.
 * `EisenhowerRadar` applies `leftCss = 100 - left` so the **first column** (left) = Important / heavy load.
 */
export function radarPlotPercentages(
  scores: TaskScores,
  mode: RadarMode,
): { left: number; bottom: number } {
  const xy = radarXY(scores, mode);
  return { left: xy.y, bottom: xy.x };
}

const QUADRANT_ORDER: Record<EisenhowerQuadrant, number> = {
  "do-first": 1,
  schedule: 2,
  delegate: 3,
  eliminate: 4,
};

const PRIORITY_ORDER: Record<Priority, number> = {
  high: 1,
  medium: 2,
  low: 3,
};

function cmpTodoId(a: Todo, b: Todo): number {
  return a.id.localeCompare(b.id);
}

/**
 * Ordre de tri pour la colonne « Priorités » (vue radar) : aligné sur les axes du mode
 * ({@link radarXY}) — Vue Radar par quadrant puis U+I ; Pression par P ; ROI par R ; Charge × urgence par U puis C.
 */
export function compareTodosForRadarList(a: Todo, b: Todo, mode: RadarMode, nowMs = Date.now()): number {
  const sA = computeTaskScores(a, nowMs);
  const sB = computeTaskScores(b, nowMs);

  const tieDeadline = (): number => {
    const dA = a.deadline ? new Date(a.deadline).getTime() : Infinity;
    const dB = b.deadline ? new Date(b.deadline).getTime() : Infinity;
    if (dA !== dB) return dA - dB;
    return cmpTodoId(a, b);
  };

  const tiePriorityDeadline = (): number => {
    const pA = PRIORITY_ORDER[a.priority];
    const pB = PRIORITY_ORDER[b.priority];
    if (pA !== pB) return pA - pB;
    return tieDeadline();
  };

  switch (mode) {
    case "pressure": {
      if (sB.P !== sA.P) return sB.P - sA.P;
      const sumA = sA.U + sA.I;
      const sumB = sB.U + sB.I;
      if (sumB !== sumA) return sumB - sumA;
      return tiePriorityDeadline();
    }
    case "roi": {
      if (sB.R !== sA.R) return sB.R - sA.R;
      if (sB.I !== sA.I) return sB.I - sA.I;
      if (sB.U !== sA.U) return sB.U - sA.U;
      return tiePriorityDeadline();
    }
    case "load": {
      if (sB.U !== sA.U) return sB.U - sA.U;
      if (sB.C !== sA.C) return sB.C - sA.C;
      if (sB.I !== sA.I) return sB.I - sA.I;
      return tiePriorityDeadline();
    }
    case "eisenhower":
    default: {
      const q = QUADRANT_ORDER[sA.quadrant] - QUADRANT_ORDER[sB.quadrant];
      if (q !== 0) return q;
      const ui = sB.U + sB.I - (sA.U + sA.I);
      if (ui !== 0) return ui;
      return tiePriorityDeadline();
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** CSS % box for each quadrant: left = importance (mirrored), bottom = urgency (high = top). */
const QUADRANT_BOUNDS: Record<
  EisenhowerQuadrant,
  { l0: number; l1: number; b0: number; b1: number }
> = {
  "do-first": { l0: 8, l1: 46, b0: 54, b1: 94 },
  delegate: { l0: 54, l1: 94, b0: 54, b1: 94 },
  schedule: { l0: 8, l1: 46, b0: 6, b1: 46 },
  eliminate: { l0: 54, l1: 94, b0: 6, b1: 46 },
};

/**
 * Places the dot inside the cell that matches `scores.quadrant`, so fill color and zone stay aligned.
 * Mode vue Radar (quadrants): U/I lerp inside the cell. Other modes: raw plot + mirror, then clamp to the same cell.
 */
export function radarDotPlacement(
  todoId: string,
  scores: TaskScores,
  mode: RadarMode,
): { left: number; bottom: number } {
  const jx = (seededRandom(`${todoId}:jx`) - 0.5) * 5;
  const jy = (seededRandom(`${todoId}:jy`) - 0.5) * 5;
  const { U, I, quadrant: q } = scores;
  const box = QUADRANT_BOUNDS[q];

  if (mode === "eisenhower") {
    let left = 50;
    let bottom = 50;
    switch (q) {
      case "do-first": {
        const tI = (I - 50) / 50;
        const tU = (U - 50) / 50;
        left = lerp(46, 10, tI);
        bottom = lerp(56, 92, tU);
        break;
      }
      case "delegate": {
        const tI = I / 50;
        const tU = (U - 50) / 50;
        left = lerp(56, 92, tI);
        bottom = lerp(56, 92, tU);
        break;
      }
      case "schedule": {
        const tI = (I - 50) / 50;
        const tU = U / 50;
        left = lerp(46, 10, tI);
        bottom = lerp(44, 10, tU);
        break;
      }
      case "eliminate": {
        const tI = I / 50;
        const tU = U / 50;
        left = lerp(56, 92, tI);
        bottom = lerp(44, 10, tU);
        break;
      }
    }
    return {
      left: clamp(left + jx, box.l0, box.l1),
      bottom: clamp(bottom + jy, box.b0, box.b1),
    };
  }

  const plot = radarPlotPercentages(scores, mode);
  let left = 100 - plot.left + jx;
  let bottom = plot.bottom + jy;
  left = clamp(left, box.l0, box.l1);
  bottom = clamp(bottom, box.b0, box.b1);
  return { left, bottom };
}

/** Seeded 0–1 for stable jitter (presentation only). */
export function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return ((h & 0x7fffffff) % 1000) / 1000;
}

/** Dot radius (px) from load C; clamped for readability. */
export function radarDotRadiusPx(C: number, compact: boolean): number {
  const minR = compact ? 4 : 5;
  const maxR = compact ? 9 : 12;
  return minR + (C / 100) * (maxR - minR);
}

/**
 * Ring stroke "heat" 0–1 from deadline (full ring when very soon / overdue).
 */
export function deadlineRingIntensity(daysLeft: number | null): number {
  if (daysLeft == null) return 0.15;
  if (daysLeft < 0) return 1;
  if (daysLeft <= 1) return 0.92;
  if (daysLeft <= 3) return 0.75;
  if (daysLeft <= 14) return 0.45;
  if (daysLeft <= 45) return 0.28;
  return 0.12;
}

/** Bin size (~%) for clustering nearby dots before fan-out. */
const RADAR_CLUSTER_BIN = 3.5;

export type RadarSpreadItem = {
  id: string;
  left: number;
  bottom: number;
  quadrant: EisenhowerQuadrant;
};

/**
 * Spreads dots that land in the same coarse cell so they remain readable without leaving the quadrant.
 */
export function spreadRadarDots(items: RadarSpreadItem[]): Map<string, { left: number; bottom: number }> {
  const out = new Map<string, { left: number; bottom: number }>();
  if (items.length === 0) return out;

  const clusters = new Map<string, RadarSpreadItem[]>();
  for (const it of items) {
    const key = `${it.quadrant}-${Math.round(it.left / RADAR_CLUSTER_BIN)}-${Math.round(it.bottom / RADAR_CLUSTER_BIN)}`;
    const arr = clusters.get(key) ?? [];
    arr.push(it);
    clusters.set(key, arr);
  }

  for (const group of clusters.values()) {
    if (group.length === 1) {
      const g = group[0];
      out.set(g.id, { left: g.left, bottom: g.bottom });
      continue;
    }
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const n = sorted.length;
    const seed = seededRandom(sorted.map((x) => x.id).join("|"));
    const baseAngle = seed * Math.PI * 2;
    const radiusPct = Math.min(5.5, 2.1 + 0.5 * (n - 1));

    for (let i = 0; i < n; i++) {
      const it = sorted[i];
      const angle = baseAngle + (2 * Math.PI * i) / n;
      const dL = radiusPct * Math.cos(angle);
      const dB = radiusPct * Math.sin(angle);
      const b = QUADRANT_BOUNDS[it.quadrant];
      out.set(it.id, {
        left: clamp(it.left + dL, b.l0 + 0.5, b.l1 - 0.5),
        bottom: clamp(it.bottom + dB, b.b0 + 0.5, b.b1 - 0.5),
      });
    }
  }

  return out;
}

/** Orange-centric halos: hue per quadrant + transparency tier (schedule/eliminate = softer). */
const QUADRANT_HALO_RGB: Record<EisenhowerQuadrant, { r: number; g: number; b: number }> = {
  "do-first": { r: 234, g: 88, b: 12 },
  delegate: { r: 245, g: 158, b: 11 },
  schedule: { r: 251, g: 146, b: 60 },
  eliminate: { r: 168, g: 120, b: 72 },
};

const QUADRANT_HALO_WEIGHT: Record<EisenhowerQuadrant, number> = {
  "do-first": 1,
  delegate: 0.82,
  schedule: 0.58,
  eliminate: 0.4,
};

/** Multiplier on alpha so “Planifier / Éliminer” stay more transparent than “Faire”. */
const QUADRANT_HALO_ALPHA_TIER: Record<EisenhowerQuadrant, number> = {
  "do-first": 1,
  delegate: 0.88,
  schedule: 0.55,
  eliminate: 0.38,
};

export type RadarRingVisual = {
  stroke: string;
  strokeWidth: number;
  opacity: number;
  /** SVG circle radius = dotR + ringPaddingPx */
  ringPaddingPx: number;
  /** Soft glow under the dot (CSS filter) */
  dropShadow: string;
};

/**
 * Halo: orange-leaning tones per quadrant, transparency from deadline + pressure + tier.
 * Overdue shifts to red-orange so “hot” stays obvious.
 */
export function radarRingVisual(scores: TaskScores, q: EisenhowerQuadrant): RadarRingVisual {
  const time = deadlineRingIntensity(scores.daysLeft);
  const w = QUADRANT_HALO_WEIGHT[q];
  const tier = QUADRANT_HALO_ALPHA_TIER[q];
  const p = scores.P / 100;
  const blend = clamp(0.14 + 0.48 * time * w + 0.38 * p, 0.1, 0.96);

  let { r, g, b } = QUADRANT_HALO_RGB[q];
  if (scores.daysLeft != null && scores.daysLeft < 0) {
    r = 220;
    g = 38;
    b = 38;
  }

  const opacity = clamp((0.14 + blend * 0.58) * tier, 0.08, 0.88);
  const stroke = `rgb(${r}, ${g}, ${b})`;
  const strokeWidth = 1 + blend * 2.2;
  /** Gap dot → ring centerline: keep tight; high blend adds more glow via blur, not a huge radius. */
  const ringPaddingPx = 0.45 + blend * 2.4;
  const blurPx = 1.8 + blend * 5.5;
  const shadowAlpha = clamp((0.1 + blend * 0.42) * tier, 0.06, 0.48);
  const dropShadow = `0 0 ${blurPx}px rgba(${r}, ${g}, ${b}, ${shadowAlpha})`;

  return { stroke, strokeWidth, opacity, ringPaddingPx, dropShadow };
}
