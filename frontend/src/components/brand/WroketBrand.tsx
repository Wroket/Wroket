"use client";

type BrandTheme = "light" | "dark" | "auto";

interface WroketMarkProps {
  size?: number;
  className?: string;
}

interface WroketWordmarkProps {
  theme?: BrandTheme;
  className?: string;
}

interface WroketLockupProps {
  theme?: BrandTheme;
  markSize?: number;
  className?: string;
  markContainerClassName?: string;
}

function wordmarkThemeClasses(theme: BrandTheme): { wro: string; ket: string } {
  if (theme === "light") return { wro: "text-slate-100", ket: "text-emerald-400" };
  if (theme === "dark") return { wro: "text-slate-800", ket: "text-emerald-500" };
  return { wro: "text-slate-800 dark:text-slate-100", ket: "text-emerald-500 dark:text-emerald-400" };
}

export function WroketMark({ size = 40, className = "" }: WroketMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Wroket"
    >
      <path d="M2 13l4 4 4.5-6" stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11 13l4 4 4.5-6" stroke="#4f46e5" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.4 8l0.7-1" stroke="#10b981" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M21.4 8l0.7-1" stroke="#4f46e5" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function WroketWordmark({ theme = "auto", className = "" }: WroketWordmarkProps) {
  const cls = wordmarkThemeClasses(theme);
  return (
    <span className={`text-xl font-bold ${className}`}>
      <span className={cls.wro}>Wro</span>
      <span className={cls.ket}>ket</span>
    </span>
  );
}

export function WroketLockup({
  theme = "auto",
  markSize = 40,
  className = "",
  markContainerClassName = "",
}: WroketLockupProps) {
  const markContainer =
    markContainerClassName ||
    (theme === "light"
      ? "w-11 h-11 rounded-xl bg-slate-800 flex items-center justify-center"
      : theme === "dark"
        ? "w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center"
        : "w-11 h-11 rounded-xl bg-slate-800 dark:bg-slate-100 flex items-center justify-center");

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className={markContainer}>
        <WroketMark size={markSize} />
      </span>
      <WroketWordmark theme={theme} />
    </span>
  );
}

