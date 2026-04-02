export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-zinc-300 dark:border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    </div>
  );
}
