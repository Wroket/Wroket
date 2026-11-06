"use client";

import { diagramPaint, DIAGRAM_COLORS, DIAGRAM_SHAPES, type DiagramColor, type DiagramShape } from "@/components/notes/diagramStyle";
import { useLocale } from "@/lib/LocaleContext";

interface DiagramStyleBarProps {
  shape: DiagramShape;
  color: DiagramColor;
  onShape: (shape: DiagramShape) => void;
  onColor: (color: DiagramColor) => void;
}

/** Shape and color for the selected zone, or for the next zone drawn on the paper. */
export default function DiagramStyleBar({ shape, color, onShape, onColor }: DiagramStyleBarProps) {
  const { t } = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t("notes.diagram.shape")}>
        {DIAGRAM_SHAPES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={shape === item}
            onClick={() => onShape(item)}
            className={`rounded border px-2 py-1 text-xs ${
              shape === item
                ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "border-zinc-200 text-zinc-600 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            {t(`notes.diagram.shape.${item}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1" role="group" aria-label={t("notes.diagram.color")}>
        {DIAGRAM_COLORS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={color === item}
            aria-label={t(`notes.diagram.color.${item}`)}
            onClick={() => onColor(item)}
            className={`h-5 w-5 rounded-full border-2 border-white dark:border-slate-900 ${color === item ? "ring-2 ring-zinc-500 ring-offset-1 dark:ring-offset-slate-900" : ""}`}
            style={{ background: diagramPaint(item).border }}
          />
        ))}
      </div>
    </div>
  );
}
