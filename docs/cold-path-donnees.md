# Cold path checklist — Données Path to 9

Objectif : **3 parcours cold** réussis, médiane **&lt; 10 min**. Déclarer le **9/10 Données** seulement si les 3/3 passent sans aide.

Complète Todos/Agenda et Projets : [`docs/cold-path-first-slot.md`](cold-path-first-slot.md) · [`docs/cold-path-projects.md`](cold-path-projects.md).

## Prérequis compte

- Navigateur neuf / profil invité, ou compte Free propre.
- Pas de Stripe Checkout requis.
- Early Bird optionnel pour migrate Notion/Monday OAuth.

## Parcours chronométrés

| # | Parcours | Steps | Temps | OK | Notes |
|---|----------|-------|-------|----|-------|
| 1 | Note → export | Signup → Données → créer note → menu Export CSV/JSON/MD | &lt;1 min (e2e) | [x] | `donnees.path-to-9` 2026-11-13 |
| 2 | Import → hub | Settings › Compte & données → lien Import → Intégrations (Notion/Monday/CSV) | &lt;1 min (e2e) | [x] | Idem |
| 3 | Compte export + cancel delete | Settings › Compte & données → Export JSON → zone danger → Annuler | &lt;1 min (e2e) | [x] | `role="dialog"` + Annuler |

## Critères de succès (tous vrais)

- [x] 3/3 cold paths sans aide
- [x] Notes import **et** export joignables depuis Données
- [x] SoftLock quota notes actionnable (pricing) — `SoftLockHint` sur création note
- [x] 0 toast brut `"Error"` / `"Erreur"` sur parcours critiques
- [x] Privacy alignée (suppression immédiate / heures)
- [x] Smoke E2E CI vert (create note + export UI + my-export) quand exécutable

**Verdict 9/10 Données** — 2026-11-13 (e2e local store, 3/3 `donnees.path-to-9`).

## Correctifs P0

| ID | Symptôme | Fix | Done |
|----|----------|-----|------|
| DN-P0-1 | Cancel delete compte sans `role="dialog"` (a11y + e2e) | Panneau confirmation delete = dialog `aria-modal` | [x] |

## Analytics

1. `note_created`
2. `data_exported` (`source`: `notes` \| `account`)
3. `data_imported` (`source`: `notes`)

Revue mensuelle : [`docs/funnel-donnees-monthly.md`](funnel-donnees-monthly.md).
