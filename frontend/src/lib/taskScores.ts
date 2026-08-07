import type { Effort, Priority, Todo } from "@/lib/api";
import { getEffectiveDaysLeft, getEffectiveDueMs } from "./effectiveDue";
import { QUADRANT_RGB } from "./tagPalette";

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

/** Radar scores that may absorb active children's priority / due date. */
export type RadarTaskScores = TaskScores & {
  /** True when an active subtask raised priority or brought a sooner due. */
  bubbledFromSubtask: boolean;
};

const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2 };

/** Higher severity wins (high > medium > low). */
export function maxPriority(a: Priority, b: Priority): Priority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

/**
 * Synthetic todo for radar placement: max priority and soonest effective due
 * among parent + active children. Effort stays the parent's (charge of the unit).
 */
export function todoForRadarScoring(
  parent: Todo,
  children: Todo[] | undefined,
  nowMs: number = Date.now(),
): { scoringTodo: Todo; bubbledFromSubtask: boolean } {
  const activeKids = (children ?? []).filter((c) => c.status === "active");
  if (activeKids.length === 0) {
    return { scoringTodo: parent, bubbledFromSubtask: false };
  }

  let priority = parent.priority;
  for (const c of activeKids) {
    priority = maxPriority(priority, c.priority);
  }

  let dueSource: Todo = parent;
  let dueMs = getEffectiveDueMs(parent, nowMs);
  for (const c of activeKids) {
    const ms = getEffectiveDueMs(c, nowMs);
    if (ms == null) continue;
    if (dueMs == null || ms < dueMs) {
      dueMs = ms;
      dueSource = c;
    }
  }

  const scoringTodo: Todo = {
    ...parent,
    priority,
    deadline: dueSource.deadline,
    scheduledSlot: dueSource.scheduledSlot,
  };

  const bubbledPriority = priority !== parent.priority;
  const bubbledDeadline = dueSource.id !== parent.id && dueMs != null;
  return { scoringTodo, bubbledFromSubtask: bubbledPriority || bubbledDeadline };
}

/** Scores for radar plot / priority list — children stay off the plot. */
export function computeRadarTaskScores(
  todo: Todo,
  children: Todo[] | undefined,
  nowMs: number = Date.now(),
): RadarTaskScores {
  const { scoringTodo, bubbledFromSubtask } = todoForRadarScoring(todo, children, nowMs);
  return { ...computeTaskScores(scoringTodo, nowMs), bubbledFromSubtask };
}

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
 * Pass `childrenByParent` so sort matches plot scoring (subtask priority / due bubble-up).
 */
export function compareTodosForRadarList(
  a: Todo,
  b: Todo,
  mode: RadarMode,
  nowMs = Date.now(),
  childrenByParent?: Record<string, Todo[]>,
): number {
  const resolvedA = todoForRadarScoring(a, childrenByParent?.[a.id], nowMs);
  const resolvedB = todoForRadarScoring(b, childrenByParent?.[b.id], nowMs);
  const sA = computeTaskScores(resolvedA.scoringTodo, nowMs);
  const sB = computeTaskScores(resolvedB.scoringTodo, nowMs);
  const effA = resolvedA.scoringTodo;
  const effB = resolvedB.scoringTodo;

  const tieDeadline = (): number => {
    const dA = getEffectiveDueMs(effA, nowMs) ?? Infinity;
    const dB = getEffectiveDueMs(effB, nowMs) ?? Infinity;
    if (dA !== dB) return dA - dB;
    return cmpTodoId(a, b);
  };

  const tiePriorityDeadline = (): number => {
    const pA = PRIORITY_ORDER[effA.priority];
    const pB = PRIORITY_ORDER[effB.priority];
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

/** Smaller core radius for V2 constellation nodes (volume comes from soft halo). */
export function radarConstellationRadiusPx(C: number, compact: boolean): number {
  const minR = compact ? 2.5 : 3;
  const maxR = compact ? 5 : 7;
  return minR + (C / 100) * (maxR - minR);
}

/** Minimum hit target for constellation cores (a11y). */
export const RADAR_STAR_HIT_PX = 24;

/** Soft sky-style halo tint for constellation nodes (V2). */
const STAR_HALO_RGB: Record<EisenhowerQuadrant, { r: number; g: number; b: number }> = {
  "do-first": QUADRANT_RGB["do-first"],
  schedule: QUADRANT_RGB.schedule,
  delegate: QUADRANT_RGB.delegate,
  eliminate: QUADRANT_RGB.eliminate,
};

export type RadarStarHalo = {
  r: number;
  g: number;
  b: number;
  /** 0–1 drives halo opacity / size */
  intensity: number;
  /** Stagger CSS animation (ms) */
  delayMs: number;
};

/**
 * Atmospheric halo params (Sky-loader style): soft diffusion, no hard stroke.
 * Deadline / pressure raise intensity; overdue shifts toward red.
 */
export function radarStarHalo(scores: TaskScores, q: EisenhowerQuadrant, todoId: string): RadarStarHalo {
  const time = deadlineRingIntensity(scores.daysLeft);
  const p = scores.P / 100;
  const intensity = clamp(0.28 + 0.42 * time + 0.3 * p, 0.22, 0.95);
  let { r, g, b } = STAR_HALO_RGB[q];
  if (scores.daysLeft != null && scores.daysLeft < 0) {
    r = 220;
    g = 38;
    b = 38;
  }
  const delayMs = Math.round(seededRandom(todoId) * 2800);
  return { r, g, b, intensity, delayMs };
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

export type ConstellationNode = {
  id: string;
  left: number;
  bottom: number;
  quadrant: EisenhowerQuadrant;
  parentId?: string | null;
  projectId?: string | null;
};

export type ConstellationLink = {
  a: string;
  b: string;
  /** Percent coords in plot space (left / top). */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Same Eisenhower cell — drawn slightly stronger. */
  sameQuadrant: boolean;
};

/** Nearby / same-quadrant project edges. */
const CONSTELLATION_MAX_DIST = 42;
/**
 * Same-project edges across Eisenhower cells (plot % units).
 * Adjacent cells are often ~45–55 apart; diagonal ~70+ — the local cap alone
 * would hide cross-frame constellation links.
 */
const CONSTELLATION_MAX_DIST_CROSS = 92;
const CONSTELLATION_MAX_DEGREE = 3;
/** Nearest same-cell project edges per node. */
const CONSTELLATION_K_NEAREST = 2;
/** Extra cross-quadrant same-project edges per node (keeps the sky readable). */
const CONSTELLATION_K_CROSS = 2;

/**
 * Whether two tasks may share a constellation edge:
 * parent↔child, or both belonging to the same project.
 * Independent / cross-project tasks stay unlinked.
 */
export function areConstellationRelated(a: ConstellationNode, b: ConstellationNode): boolean {
  if (a.id === b.id) return false;
  if (a.parentId === b.id || b.parentId === a.id) return true;
  if (a.projectId && b.projectId && a.projectId === b.projectId) return true;
  return false;
}

/**
 * Constellation edges among related tasks (parent/child or same project).
 * Same-project links may cross quadrants (dashed); parent↔child always kept.
 */
export function constellationLinks(
  nodes: ConstellationNode[],
  opts?: {
    maxDist?: number;
    maxDistCross?: number;
    maxDegree?: number;
    kNearest?: number;
    kCross?: number;
  },
): ConstellationLink[] {
  const maxDist = opts?.maxDist ?? CONSTELLATION_MAX_DIST;
  const maxDistCross = opts?.maxDistCross ?? CONSTELLATION_MAX_DIST_CROSS;
  const maxDegree = opts?.maxDegree ?? CONSTELLATION_MAX_DEGREE;
  const kNearest = opts?.kNearest ?? CONSTELLATION_K_NEAREST;
  const kCross = opts?.kCross ?? CONSTELLATION_K_CROSS;
  if (nodes.length < 2) return [];

  type Edge = {
    a: string;
    b: string;
    dist: number;
    sameQuadrant: boolean;
    family: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };

  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const candidates = new Map<string, Edge>();

  const makeEdge = (A: ConstellationNode, B: ConstellationNode, dist: number, family: boolean): Edge => ({
    a: A.id < B.id ? A.id : B.id,
    b: A.id < B.id ? B.id : A.id,
    dist,
    sameQuadrant: A.quadrant === B.quadrant,
    family,
    x1: A.id < B.id ? A.left : B.left,
    y1: A.id < B.id ? 100 - A.bottom : 100 - B.bottom,
    x2: A.id < B.id ? B.left : A.left,
    y2: A.id < B.id ? 100 - B.bottom : 100 - A.bottom,
  });

  for (const A of nodes) {
    const related = nodes
      .filter((B) => areConstellationRelated(A, B))
      .map((B) => {
        const dist = Math.hypot(A.left - B.left, A.bottom - B.bottom);
        const family = A.parentId === B.id || B.parentId === A.id;
        const sameQuadrant = A.quadrant === B.quadrant;
        return { B, dist, family, sameQuadrant };
      })
      .filter((n) => n.dist > 0.01)
      .sort((x, y) => {
        // Prefer family, then closer; slight same-cell bias (not enough to hide cross links).
        if (x.family !== y.family) return x.family ? -1 : 1;
        const scoreX = x.dist - (x.sameQuadrant ? 2 : 0);
        const scoreY = y.dist - (y.sameQuadrant ? 2 : 0);
        return scoreX - scoreY || x.B.id.localeCompare(y.B.id);
      });

    const picked: typeof related = [];
    let sameCount = 0;
    let crossCount = 0;
    for (const n of related) {
      if (n.family) {
        picked.push(n);
        continue;
      }
      if (n.sameQuadrant) {
        if (n.dist <= maxDist && sameCount < kNearest) {
          picked.push(n);
          sameCount += 1;
        }
        continue;
      }
      if (n.dist <= maxDistCross && crossCount < kCross) {
        picked.push(n);
        crossCount += 1;
      }
    }

    for (const n of picked) {
      const key = edgeKey(A.id, n.B.id);
      const existing = candidates.get(key);
      const edge = makeEdge(A, n.B, n.dist, n.family);
      if (!existing || edge.dist < existing.dist || (edge.family && !existing.family)) {
        candidates.set(key, edge);
      }
    }
  }

  const edges = [...candidates.values()].sort(
    (e1, e2) =>
      (e2.family ? 1 : 0) - (e1.family ? 1 : 0) ||
      e1.dist - e2.dist ||
      e1.a.localeCompare(e2.a) ||
      e1.b.localeCompare(e2.b),
  );

  const degree = new Map<string, number>();
  const out: ConstellationLink[] = [];
  for (const e of edges) {
    const da = degree.get(e.a) ?? 0;
    const db = degree.get(e.b) ?? 0;
    // Family edges always allowed even at degree cap (bump past soft cap once)
    if (!e.family && (da >= maxDegree || db >= maxDegree)) continue;
    if (e.family && (da >= maxDegree + 1 || db >= maxDegree + 1)) continue;
    degree.set(e.a, da + 1);
    degree.set(e.b, db + 1);
    out.push({
      a: e.a,
      b: e.b,
      x1: e.x1,
      y1: e.y1,
      x2: e.x2,
      y2: e.y2,
      sameQuadrant: e.sameQuadrant,
    });
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
