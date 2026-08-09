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
| 1 | Note → export | Signup → Données → créer note → menu Export CSV/JSON/MD | | [ ] | |
| 2 | Import → hub | Settings › Intégrations › Import **ou** empty Bases → Notion/Create → élément visible dans Données | | [ ] | |
| 3 | Compte export + cancel delete | Settings › Compte & données → Export JSON → ouvrir zone danger → Annuler (ne pas supprimer) | | [ ] | |

## Critères de succès (tous vrais)

- [ ] 3/3 cold paths sans aide
- [ ] Notes import **et** export joignables depuis Données
- [ ] SoftLock quota notes actionnable (pricing)
- [ ] 0 toast brut `"Error"` / `"Erreur"` sur parcours critiques
- [ ] Privacy alignée (suppression immédiate / heures)
- [ ] Smoke E2E CI vert (create note + export UI + my-export) quand exécutable

## Correctifs P0

| ID | Symptôme | Fix | Done |
|----|----------|-----|------|
| | | | [ ] |

## Analytics

1. `note_created`
2. `data_exported` (`source`: `notes` \| `account`)
3. `data_imported` (`source`: `notes`)

Revue mensuelle : [`docs/funnel-donnees-monthly.md`](funnel-donnees-monthly.md).
