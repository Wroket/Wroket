export interface ApplyDiagramNode {
  id: string;
  label: string;
  column?: string;
}

export interface ApplyDiagramRow {
  id: string;
  label: string;
  column: string;
  included: boolean;
  existed: boolean;
}

const MAX_ROWS = 25;

/**
 * Rows shown before creating tasks from a saved diagram.
 * A box that already became a task starts unchecked.
 */
export function rowsForApply(nodes: ApplyDiagramNode[], existingNodeIds: ReadonlySet<string>): ApplyDiagramRow[] {
  const rows: ApplyDiagramRow[] = [];
  for (const node of nodes) {
    if (rows.length >= MAX_ROWS) break;
    const label = node.label.replace(/\s+/g, " ").trim();
    if (!label) continue;
    const existed = existingNodeIds.has(node.id);
    rows.push({
      id: node.id,
      label,
      column: node.column?.trim() ?? "",
      included: !existed,
      existed,
    });
  }
  return rows;
}
