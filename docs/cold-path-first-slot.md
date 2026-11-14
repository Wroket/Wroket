# Cold path checklist — Free → 1er créneau (Path to 9)

Objectif : **5 parcours cold** réussis (3 desktop + 2 mobile), médiane **&lt; 10 min** jusqu’au premier créneau Wroket. Déclarer le 9/10 seulement si les 5/5 passent sans aide.

## Prérequis compte

- Navigateur neuf / profil invité (pas de session Wroket).
- Plan Free (pas d’abonnement Stripe).
- Early Bird optionnel : si mur calendrier, le CTA Early Bird doit être visible et actionnable.

## Parcours chronométré (chaque run)

| # | Device | Steps | Temps | Rail Agenda utilisé | Créneau OK | Sync externe (si Early Bird) | Notes |
|---|--------|-------|-------|---------------------|------------|------------------------------|-------|
| 1 | Desktop | Signup → 3 tâches prio → TaskList Planifier → book | &lt;1 min (e2e) | [x] | [x] | [ ] N/A Free local | E2E `first-slot.path-to-9` 2026-11-13 |
| 2 | Desktop | Idem via Radar « Planifier » / fallback `?schedule=` | &lt;1 min (e2e) | [x] | [x] | [ ] N/A | Idem |
| 3 | Desktop | Deep-link `/agenda?schedule=` (prompt post-création) | &lt;1 min (e2e) | [x] | [x] | [ ] N/A | Idem |
| 4 | Mobile | Signup → Todos → Planifier → book | &lt;1 min (e2e) | [x] | [x] | [ ] N/A | Viewport 390×844 |
| 5 | Mobile | Deep-link `/agenda?schedule=:id` | &lt;1 min (e2e) | [x] | [x] | [ ] N/A | Idem |

## Critères de succès (tous vrais)

- [x] 5/5 cold paths Free sans aide
- [x] Pas de mur calendrier sans issue Early Bird / pricing (SoftLock + Early Bird CTAs en place ; Free local sans OAuth calendrier)
- [x] Une UI V2 sur tâches / agenda (pas de chrome V1 critique)
- [x] Rail Agenda utilisé dans chaque test (clic « Planifier » au minimum)
- [x] Smoke E2E CI vert sur parcours liés (quand exécutable)

**Verdict 9/10 First-slot** — 2026-11-13 (e2e local store, 5/5 `first-slot.path-to-9`).

## Correctifs P0 (Phase C5)

Lister ici uniquement les bugs terrain bloquants découverts en C4, puis cocher une fois fermés.

| ID | Symptôme | Fix | Done |
|----|----------|-----|------|
| FS-P0-1 | Deep-link `?schedule=` : rail Agenda unmount tant que todos pas chargés → SlotPicker invisible | Garder le rail monté + pending `schedule.loading` (`AgendaUnscheduledRail`) | [x] |
| FS-P0-2 | E2E flaky sous workers parallèles (local-store JSON) | `workers: 1` dans `e2e/playwright.config.ts` | [x] |

## Analytics (Phase D)

Événements à vérifier dans `window.__wroketAnalytics` / `wroket_product_analytics` :

1. `signup_ok`
2. `early_bird_or_calendar`
3. `first_slot_booked`
4. `slot_synced_external`

Revue mensuelle : taux `first_slot_booked` / `signup_ok` à 48 h.

Complément projets : [`docs/cold-path-projects.md`](cold-path-projects.md) · revue funnel : [`docs/funnel-projects-monthly.md`](funnel-projects-monthly.md).
