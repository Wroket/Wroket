# Radar — cohérence des vues (audit technique)

Document de référence : une **seule source de vérité** pour la classification « quadrant Radar » entre liste, cartes, vue Radar 360°, tableau de bord et agenda.

## Source canonique

| Élément | Implémentation |
|--------|------------------|
| Quadrant (FAIRE / PLANIFIER / EXPÉDIER / DIFFÉRER) | [`computeTaskScores`](../frontend/src/lib/taskScores.ts) → champ `quadrant` |
| API stable pour une `Todo` | [`classify(todo, nowMs?)`](../frontend/src/lib/classify.ts) = `computeTaskScores(...).quadrant` |
| Agenda (couleurs tâches Wroket) | [`classifyEvent`](../frontend/src/app/agenda/_utils/calendarUtils.ts) → réutilise la même logique de scores |

Ne pas recalculer un quadrant avec une heuristique différente dans une nouvelle vue : étendre `taskScores` / `classify` si les règles métier évoluent.

## Alignement UX vérifié

- **Liste / tableau** : tri et colonne « Classification » s’appuient sur les quadrants dérivés des mêmes entrées (priorité, effort, échéance, etc.).
- **Cartes par quadrant** : mêmes badges que la Radar (`badge.doFirst`, …).
- **Radar 360°** : placement des points via `radarDotPlacement` et `spreadRadarDots` à partir des scores — pas un second moteur parallèle.
- **Dashboard** : résumé par quadrant via [`classify`](../frontend/src/lib/classify.ts) ; mini Radar compact sans mode « lentille » (Eisenhower implicite pour le scatter dashboard si non contrôlé — même scores sous-jacents).

## Horizon produit (PMO)

La [roadmap projet / PMO](project-roadmap-pmo.md) ajoute la vue **stratégique** projet (santé, jalons). Le Radar reste **tactique** (quoi faire maintenant) ; tout niveau stratégique additionnel doit rester explicite dans l’UI pour ne pas contredire la grille sans l’expliquer.

**Dernière mise à jour** : 2026-05-01
