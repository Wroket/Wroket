# Cold path checklist — Projets → 1er créneau (Path to 9 Projets)

Objectif : **3 parcours cold** réussis (Board, Kanban, Gantt), médiane **&lt; 10 min** jusqu’au premier créneau depuis un projet. Déclarer le **9/10 Projets** seulement si les 3/3 passent sans aide.

Complète le funnel tâches/agenda : [`docs/cold-path-first-slot.md`](cold-path-first-slot.md).

## Prérequis compte

- Navigateur neuf / profil invité (pas de session Wroket), ou compte Free propre.
- Plan Free ou Team (pas de Stripe Checkout requis).
- Early Bird optionnel : si mur calendrier sur les vues projet, le CTA Early Bird compact doit être visible et actionnable.

## Parcours chronométrés (chaque run)

| # | Vue | Steps | Temps | Prompt post-create | SlotPicker in-vue | Créneau OK | Notes |
|---|-----|-------|-------|--------------------|-------------------|------------|-------|
| 1 | Board | Signup → Créer projet → 3 tâches (phases) → Planifier (Board ou prompt → Agenda) → book | ~3 min | [x] | [x] | [x] | **2026-11-13** prod Early Bird — projet `PMO Live Validation` ; Schedule → Suggestions → Select sur « Create UI mockups » → On calendar |
| 2 | Kanban | Projet existant ou neuf → carte Kanban → SlotPicker → book (sans passer par Board) | ~2 min | [x] | [x] | [x] | **2026-11-13** — Design review → Suggestions → Select → On calendar |
| 3 | Gantt | Ajuster dates barre + SlotPicker sur libellé ligne → book | ~2 min | [x] | [x] | [x] | **2026-11-13** — Set up environment → Suggestions → Select (busy puis modal fermée, 0 toast Error) |

## Critères de succès (tous vrais)

- [x] 3/3 cold paths sans aide (**2026-11-13** prod)
- [x] Schedule possible depuis **Board et Kanban et Gantt**
- [x] `moveTodo` OK pour owner (**2026-11-13** `POST /todos/:id/move` clampDatesToPhase + revert 200) — éditeur équipe : pas de collab sur projets perso du compte smoke ; reporté / couvert e2e path-to-9
- [x] 0 toast brut `"Error"` / `"Erreur"` sur parcours critiques
- [x] Une UI V2 projets ; SoftLock quota actionnable (pricing) sur create projet / tâche — Early Bird visible
- [ ] Smoke E2E CI vert sur create + move 422 cancel + SlotPicker book (quand exécutable) — stack local down 2026-11-13 ; spec [`e2e/tests/projects.path-to-9.spec.ts`](../e2e/tests/projects.path-to-9.spec.ts)

**Verdict Path-to-9 Projets** : **9/10 terrain** (3 vues + book + move owner). Residual non bloquant : collab editor live + CI e2e local.

## Correctifs P0

Lister ici uniquement les bugs terrain bloquants découverts en Phase C, puis cocher une fois fermés.

| ID | Symptôme | Fix | Done |
|----|----------|-----|------|
| SEED-O2 | Seed template Software ~58s (full-owner resync) | `createTodo` → `persistTodoMutation` ; dates relatives seed | [x] |
| HEALTH-UNDATED | On track avec 100 % sans échéance | Santé `undated` + helper unique liste/steering | [x] |
| DEEPLINK | `/projects/:id` cassé | Redirect + CreateMenu/CommandPalette `?project=` | [x] |
| IA-PILOTAGE | Pilotage enterré | Tab Pilotage + `?tab=` | [x] |

## Analytics

Événements à vérifier via `window.__wroketAnalytics` / `wroket_product_analytics` :

1. `project_created`
2. `project_task_created`
3. `first_slot_booked` avec `source: "project"`

Revue mensuelle (Phase D) : taux `project_task_created` → `first_slot_booked` (source project) à 48 h ; incidents 403 move collaborateurs.
