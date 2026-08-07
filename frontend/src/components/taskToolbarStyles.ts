/**
 * Styles partagés pour {@link TaskIconToolbar}, {@link TaskRowActionsV2}
 * et le trigger {@link SlotPicker}.
 * Dual wash calme : ghost slate par défaut ; emerald seulement si lié ou hover « accomplir ».
 */

/** Accomplir, Annuler, Refuser/Accepter assignation, Supprimer */
export const toolbarNeutralButton =
  "w-6 h-6 rounded flex items-center justify-center border border-zinc-300 dark:border-slate-600 bg-white/90 dark:bg-slate-800/80 text-zinc-500 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-700/90 hover:border-zinc-400 dark:hover:border-slate-500 transition-colors";

/** Accomplir — ghost slate, accent emerald au hover uniquement */
export const toolbarCompleteButton =
  "w-6 h-6 rounded flex items-center justify-center border border-zinc-300 dark:border-slate-600 bg-white/90 dark:bg-slate-800/80 text-zinc-500 dark:text-slate-400 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors";

/** Créneau / sous-tâche / Meet / PJ / note / commentaires — rien de lié encore */
export const toolbarAffordanceEmpty =
  "w-6 h-6 rounded flex items-center justify-center border border-zinc-300 dark:border-slate-600 bg-white/90 dark:bg-slate-800/80 text-zinc-500 dark:text-slate-400 hover:bg-zinc-50 dark:hover:bg-slate-700/90 hover:border-zinc-400 dark:hover:border-slate-500 transition-colors";

/** Au moins un lien présent pour cette dimension */
export const toolbarAffordanceLinked =
  "w-6 h-6 rounded flex items-center justify-center border border-emerald-300 dark:border-emerald-600 bg-emerald-50/90 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 hover:border-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors ring-1 ring-inset ring-emerald-200/50 dark:ring-emerald-400/20";

export function toolbarAffordanceClass(linked: boolean): string {
  return linked ? toolbarAffordanceLinked : toolbarAffordanceEmpty;
}
