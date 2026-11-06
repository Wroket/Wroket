/** Flipping hourglass shown while an import is still working. */
export function HourglassIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M6 2h12v2.1c0 1.6-.7 3.1-1.8 4.1L13.4 12l2.8 3.8c1.1 1 1.8 2.5 1.8 4.1V22H6v-2.1c0-1.6.7-3.1 1.8-4.1L10.6 12 7.8 8.2C6.7 7.2 6 5.7 6 4.1V2zm2 1.5v.6c0 .8.4 1.6 1 2.2L12 9.1l3-2.8c.6-.6 1-1.4 1-2.2v-.6H8zm0 17h8v-.6c0-.8-.4-1.6-1-2.2L12 14.9l-3 2.8c-.6.6-1 1.4-1 2.2v.6z" />
    </svg>
  );
}

/** Status row for a long import. The icon flips so the wait is visible. */
export function HourglassStatus({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
    >
      <span className="hourglass-flip text-emerald-700 dark:text-emerald-300">
        <HourglassIcon />
      </span>
      {label}
    </div>
  );
}
