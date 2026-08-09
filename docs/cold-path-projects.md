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
| 1 | Board | Signup → Créer projet → 3 tâches (phases) → Planifier (Board ou prompt → Agenda) → book | | [ ] | [ ] | [ ] | |
| 2 | Kanban | Projet existant ou neuf → carte Kanban → SlotPicker → book (sans passer par Board) | | [ ] | [ ] | [ ] | |
| 3 | Gantt | Ajuster dates barre + SlotPicker sur libellé ligne → book | | [ ] | [ ] | [ ] | |

## Critères de succès (tous vrais)

- [ ] 3/3 cold paths sans aide
- [ ] Schedule possible depuis **Board et Kanban et Gantt**
- [ ] `moveTodo` OK pour owner **et** éditeur équipe (cas nominal collab)
- [ ] 0 toast brut `"Error"` / `"Erreur"` sur parcours critiques
- [ ] Une UI V2 projets ; SoftLock quota actionnable (pricing) sur create projet / tâche
- [ ] Smoke E2E CI vert sur create + move 422 cancel + SlotPicker book (quand exécutable)

## Correctifs P0

Lister ici uniquement les bugs terrain bloquants découverts en Phase C, puis cocher une fois fermés.

| ID | Symptôme | Fix | Done |
|----|----------|-----|------|
| | | | [ ] |

## Analytics

Événements à vérifier via `window.__wroketAnalytics` / `wroket_product_analytics` :

1. `project_created`
2. `project_task_created`
3. `first_slot_booked` avec `source: "project"`

Revue mensuelle (Phase D) : taux `project_task_created` → `first_slot_booked` (source project) à 48 h ; incidents 403 move collaborateurs.
