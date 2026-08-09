# Cold path checklist — Collab Path to 9

Objectif : **3 parcours cold** réussis, médiane **&lt; 10 min**. Déclarer le **9/10 Collab** seulement si les 3/3 passent sans aide.

Complète Todos/Agenda, Projets, Données : [`docs/cold-path-first-slot.md`](cold-path-first-slot.md) · [`docs/cold-path-projects.md`](cold-path-projects.md) · [`docs/cold-path-donnees.md`](cold-path-donnees.md).

## Prérequis

- Deux comptes (owner + assignee) ou un parcours invite → accept.
- Plan Free ou Team ; pas de Stripe Checkout requis.

## Parcours chronométrés

| # | Parcours | Steps | Temps | OK | Notes |
|---|----------|-------|-------|----|-------|
| 1 | Invite collab | Signup A → Équipes → Inviter B → B accepte (notif ou /teams) | | [ ] | |
| 2 | Assign → Accept | A assigne tâche à B → B voit badge En attente → Accepte (liste, board ou /notifications) | | [ ] | |
| 3 | Notif deep-link | B ouvre `task_assigned` → Accept/Decline in-app → statut visible ; ou lien → `/todos?task=` | | [ ] | |

## Critères de succès

- [ ] 3/3 cold paths sans aide
- [ ] Badge `pending` / accepted / declined visible hors modal (liste, cartes)
- [ ] `/notifications` : Accept/Decline sur `task_assigned` et `team_invite`
- [ ] 0 toast brut `"Error"` / `"Erreur"` sur parcours critiques
- [ ] Empty collab avec CTA (inviter / créer équipe / tâches)
- [ ] Smoke E2E CI `collab.path-to-9` vert quand exécutable

## Correctifs P0

| ID | Symptôme | Fix | Done |
|----|----------|-----|------|
| | | | [ ] |

## Analytics (optionnel)

Revue mensuelle : [`docs/funnel-collab-monthly.md`](funnel-collab-monthly.md) — taux acceptation assign à 48 h.
