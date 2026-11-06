/** Limited palette for the in-note diagram. Stored as a token, never as free CSS. */
export const DIAGRAM_SHAPES = ["rect", "round", "ellipse", "diamond"] as const;
export const DIAGRAM_COLORS = ["emerald", "sky", "amber", "rose", "violet", "zinc"] as const;

export type DiagramShape = (typeof DIAGRAM_SHAPES)[number];
export type DiagramColor = (typeof DIAGRAM_COLORS)[number];

export function diagramShape(value: unknown): DiagramShape {
  return DIAGRAM_SHAPES.includes(value as DiagramShape) ? (value as DiagramShape) : "rect";
}

export function diagramColor(value: unknown): DiagramColor {
  return DIAGRAM_COLORS.includes(value as DiagramColor) ? (value as DiagramColor) : "emerald";
}

export function diagramPaint(color: DiagramColor): { border: string; fill: string } {
  switch (color) {
    case "sky":
      return { border: "#0369a1", fill: "rgba(14,165,233,0.22)" };
    case "amber":
      return { border: "#b45309", fill: "rgba(245,158,11,0.28)" };
    case "rose":
      return { border: "#be123c", fill: "rgba(244,63,94,0.2)" };
    case "violet":
      return { border: "#6d28d9", fill: "rgba(139,92,246,0.2)" };
    case "zinc":
      return { border: "#3f3f46", fill: "rgba(255,255,255,0.88)" };
    default:
      return { border: "#047857", fill: "rgba(16,185,129,0.2)" };
  }
}

export function diagramShapeClass(shape: DiagramShape): string {
  if (shape === "ellipse") return "rounded-full";
  if (shape === "round") return "rounded-2xl";
  if (shape === "diamond") return "[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]";
  return "rounded-md";
}
