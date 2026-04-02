import type { SortColumn, SortDirection } from "@/lib/todoConstants";

export default function SortArrow({ col, activeCol, dir }: { col: SortColumn; activeCol: SortColumn; dir: SortDirection }) {
  const active = col === activeCol;
  return (
    <span className="inline-flex flex-col ml-1 leading-none">
      <svg className={`w-3 h-3 ${active && dir === "asc" ? "text-zinc-900" : "text-zinc-300"}`} viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 2L10 7H2L6 2Z" />
      </svg>
      <svg className={`w-3 h-3 -mt-1 ${active && dir === "desc" ? "text-zinc-900" : "text-zinc-300"}`} viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 10L2 5H10L6 10Z" />
      </svg>
    </span>
  );
}
