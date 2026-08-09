# Cold path checklist — Free → 1er créneau (Path to 9)

Objectif : **5 parcours cold** réussis (3 desktop + 2 mobile), médiane **&lt; 10 min** jusqu’au premier créneau Wroket. Déclarer le 9/10 seulement si les 5/5 passent sans aide.

## Prérequis compte

- Navigateur neuf / profil invité (pas de session Wroket).
- Plan Free (pas d’abonnement Stripe).
- Early Bird optionnel : si mur calendrier, le CTA Early Bird doit être visible et actionnable.

## Parcours chronométré (chaque run)

| # | Device | Steps | Temps | Rail Agenda utilisé | Créneau OK | Sync externe (si Early Bird) | Notes |
|---|--------|-------|-------|---------------------|------------|------------------------------|-------|
| 1 | Desktop | Signup → 3 tâches prio → Agenda rail ou `?schedule=` → book | | [ ] | [ ] | [ ] | |
| 2 | Desktop | Idem via Radar « Planifier » | | [ ] | [ ] | [ ] | |
| 3 | Desktop | Idem via prompt post-création → Agenda | | [ ] | [ ] | [ ] | |
| 4 | Mobile | Signup → Todos → Agenda rail → book | | [ ] | [ ] | [ ] | |
| 5 | Mobile | Deep-link `/agenda?schedule=:id` depuis prompt | | [ ] | [ ] | [ ] | |

## Critères de succès (tous vrais)

- [ ] 5/5 cold paths Free sans aide
- [ ] Pas de mur calendrier sans issue Early Bird / pricing
- [ ] Une UI V2 sur tâches / agenda (pas de chrome V1 critique)
- [ ] Rail Agenda utilisé dans chaque test (clic « Planifier » au minimum)
- [ ] Smoke E2E CI vert sur parcours liés (quand exécutable)

## Correctifs P0 (Phase C5)

Lister ici uniquement les bugs terrain bloquants découverts en C4, puis cocher une fois fermés.

| ID | Symptôme | Fix | Done |
|----|----------|-----|------|
| | | | [ ] |

## Analytics (Phase D)

Événements à vérifier dans `window.__wroketAnalytics` / `wroket_product_analytics` :

1. `signup_ok`
2. `early_bird_or_calendar`
3. `first_slot_booked`
4. `slot_synced_external`

Revue mensuelle : taux `first_slot_booked` / `signup_ok` à 48 h.

Complément projets : [`docs/cold-path-projects.md`](cold-path-projects.md) · revue funnel : [`docs/funnel-projects-monthly.md`](funnel-projects-monthly.md).
