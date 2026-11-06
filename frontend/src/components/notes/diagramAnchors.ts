export interface AnchorBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Midpoints of the four sides — the blue handles on a zone. */
export function sideAnchors(node: AnchorBox): { x: number; y: number }[] {
  return [
    { x: node.x + node.w / 2, y: node.y },
    { x: node.x + node.w, y: node.y + node.h / 2 },
    { x: node.x + node.w / 2, y: node.y + node.h },
    { x: node.x, y: node.y + node.h / 2 },
  ];
}

/**
 * Side handle closest to the other point.
 * Arrows leave and arrive on a blue dot, so a rounded or oval shape has no corner gap.
 */
export function stickyAnchor(node: AnchorBox, towardX: number, towardY: number): { x: number; y: number } {
  const anchors = sideAnchors(node);
  let best = anchors[0]!;
  let bestDistance = Infinity;
  for (const anchor of anchors) {
    const dx = anchor.x - towardX;
    const dy = anchor.y - towardY;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }
  return best;
}
