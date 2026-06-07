---
name: project-dnd-constraints
description: >-
  Guide DnD projet (Kanban, Board, Gantt) : endpoint move, modales contraintes,
  patterns Agenda. Utiliser avant toute modification de déplacement de tâches en projet.
---

# DnD projet — contraintes et solutions

## Quand utiliser ce skill

- Drag-and-drop Kanban / Board / Gantt (liste ou barres)
- Changement de phase, dates, créneau booké
- Modales de résolution de conflit

## Fichiers obligatoires

| Fichier | Rôle |
|---------|------|
| `backend/src/services/todoService.ts` | `moveTodo`, validations phase/slot |
| `backend/src/controllers/todoController.ts` | `POST /todos/:id/move` |
| `frontend/src/app/projects/_components/ProjectDetailView.tsx` | Handlers DnD |
| `frontend/src/app/projects/_components/TaskMoveConstraintModal.tsx` | Modale light/rich |
| `frontend/src/lib/analyzeMoveConstraints.ts` | Pré-check client |
| `frontend/src/lib/phaseSlotBounds.ts` | Bornes phase (client) |
| `frontend/src/lib/api/todos.ts` | `moveTodo()` client |
| `frontend/src/app/agenda/page.tsx` | Pattern 409 + force |

## Ordre d'implémentation

1. **Backend `moveTodo`** avant enrichissement UI.
2. **Modale** branchée sur codes `422` / `409`.
3. **Parité Kanban** = aligner sur Board handlers.
4. **Gantt barres** : backlog — panneau rapide (E2) avant drag timeline complet (E1).

## Matrice contrainte → UX

| Contrainte | Code API | UX |
|------------|----------|-----|
| Dates hors phase cible | `TASK_PHASE_DATE_MISMATCH` (422) | Modale light : clamp / annuler |
| Slot hors phase après move | `TASK_PHASE_SLOT_MISMATCH` (422) | Modale light : clear slot / annuler |
| Chevauchement calendrier | `TASK_MOVE_CONFLICT` (409) | Liste conflits + Forcer |
| Projet archivé | 403 | Message + lien réactivation si possible |
| Non propriétaire (phase) | 403 | Tooltip / désactiver drag |

## Stratégies `moveTodo`

- `default` : valide ; retourne 422 si incompatible.
- `clampDatesToPhase` : ajuste `startDate`/`deadline` aux bornes phase.
- `clearScheduledSlot` : efface le créneau puis move.
- `keepDates` : tente avec dates actuelles (échoue en 422 si invalide).
- `rescheduleSlot` : réservation avec check conflit (409).

## Anti-patterns

- Toast seul sur 422 récupérable.
- `updateTodo({ phaseId })` sans revalidation slot.
- Modale calendrier complète sur simple drop Kanban colonne.

## Règle associée

[`.cursor/rules/constraint-solutions-ux.mdc`](../../rules/constraint-solutions-ux.mdc)
