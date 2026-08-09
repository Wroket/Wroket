"use client";

type MockProps = { fr: boolean };

/**
 * Full-bleed product previews for SEO satellite pages (not interactive).
 */
export function AgendaProductMock({ fr }: MockProps) {
  return (
    <div className="w-full rounded-xl bg-[#1c1917] text-stone-100 ring-1 ring-white/10 overflow-hidden shadow-[0_24px_48px_-28px_rgba(15,118,110,0.55)]">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-stone-900/80">
        <span className="flex gap-1.5" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-stone-600" />
          <span className="w-2.5 h-2.5 rounded-full bg-stone-600" />
          <span className="w-2.5 h-2.5 rounded-full bg-stone-600" />
        </span>
        <span className="text-[10px] font-mono text-teal-300/90 tracking-wide">wroket · agenda</span>
      </div>
      <div className="p-4 sm:p-5 space-y-2">
        {["09:00", "10:00", "11:00", "14:00"].map((h, i) => (
          <div key={h} className="flex items-center gap-3">
            <span className="text-[11px] text-stone-500 w-10 shrink-0 font-mono">{h}</span>
            {i === 1 ? (
              <div className="flex-1 rounded-md px-3 py-2 text-xs font-medium bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40 border-l-2 border-teal-400">
                {fr ? "Focus — Revue brief client" : "Focus — Client brief review"}
              </div>
            ) : i === 3 ? (
              <div className="flex-1 rounded-md px-3 py-2 text-xs font-medium bg-stone-800 text-stone-300 ring-1 ring-white/5">
                {fr ? "Sync Google Calendar" : "Google Calendar sync"}
              </div>
            ) : (
              <div className="flex-1 rounded-md border border-dashed border-stone-600/70 h-9" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamProductMock({ fr }: MockProps) {
  return (
    <div className="w-full rounded-xl bg-[#1c1917] text-stone-100 ring-1 ring-white/10 overflow-hidden shadow-[0_24px_48px_-28px_rgba(15,118,110,0.55)]">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-stone-900/80">
        <span className="flex gap-1.5" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-stone-600" />
          <span className="w-2.5 h-2.5 rounded-full bg-stone-600" />
          <span className="w-2.5 h-2.5 rounded-full bg-stone-600" />
        </span>
        <span className="text-[10px] font-mono text-teal-300/90 tracking-wide">wroket · team</span>
      </div>
      <div className="p-4 sm:p-5 flex flex-col gap-2.5">
        <div className="flex items-start gap-2.5 rounded-xl bg-stone-950/55 ring-1 ring-white/10 px-3 py-2.5">
          <span className="w-8 h-8 rounded-full bg-teal-700 text-[11px] font-bold text-white flex items-center justify-center shrink-0">
            J
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-stone-100">Julie</span>
              <span className="text-[10px] text-stone-500">2m</span>
            </div>
            <p className="text-[11px] text-stone-300 leading-snug mt-0.5">
              {fr ? "vous a assigné « Revue brief client »" : "assigned you “Client brief review”"}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-xl bg-teal-950/40 ring-1 ring-teal-500/30 px-3 py-2.5 ml-3 sm:ml-6">
          <span className="w-8 h-8 rounded-full bg-stone-600 text-[11px] font-bold text-white flex items-center justify-center shrink-0">
            M
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-teal-100">Marc</span>
              <span className="text-[10px] text-stone-500">now</span>
            </div>
            <p className="text-[11px] text-teal-50/90 leading-snug mt-0.5">
              {fr ? "OK, je m’en occupe avant 16h." : "On it — done before 4pm."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {["Slack", "Teams", "Discord"].map((p) => (
            <span
              key={p}
              className="text-[10px] font-medium text-stone-300 ring-1 ring-white/10 rounded-md px-2 py-1 bg-stone-950/40"
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EisenhowerProductMock({ fr }: MockProps) {
  const cells = [
    { label: fr ? "Urgent + Important" : "Urgent + Important", bg: "bg-red-500/20", text: "text-red-200", ring: "ring-red-400/30" },
    { label: fr ? "Important" : "Important", bg: "bg-amber-500/20", text: "text-amber-200", ring: "ring-amber-400/30" },
    { label: fr ? "Urgent" : "Urgent", bg: "bg-sky-500/20", text: "text-sky-200", ring: "ring-sky-400/30" },
    { label: fr ? "Différer" : "Defer", bg: "bg-stone-500/20", text: "text-stone-300", ring: "ring-stone-400/20" },
  ];
  return (
    <div className="w-full rounded-xl bg-[#1c1917] text-stone-100 ring-1 ring-white/10 overflow-hidden shadow-[0_24px_48px_-28px_rgba(15,118,110,0.55)]">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/10 bg-stone-900/80">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden>
            <span className="w-2.5 h-2.5 rounded-full bg-stone-600" />
            <span className="w-2.5 h-2.5 rounded-full bg-stone-600" />
            <span className="w-2.5 h-2.5 rounded-full bg-stone-600" />
          </span>
          <span className="text-[10px] font-mono text-teal-300/90 tracking-wide">wroket · radar</span>
        </div>
        <span className="text-[10px] text-stone-500">{fr ? "Eisenhower auto" : "Auto Eisenhower"}</span>
      </div>
      <div className="p-4 sm:p-5 grid grid-cols-2 gap-2">
        {cells.map((q) => (
          <div
            key={q.label}
            className={`${q.bg} ring-1 ${q.ring} rounded-lg p-3 sm:p-4 flex flex-col items-center justify-center min-h-[72px]`}
          >
            <span className={`text-[11px] sm:text-xs font-semibold ${q.text} text-center leading-tight`}>{q.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
