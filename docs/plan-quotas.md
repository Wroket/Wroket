# Quotas volume — palier `free` (alignement code / ROADMAP)

Référence : [ROADMAP.md](../ROADMAP.md) (section Plan system, palier Free) et constantes dans `backend/src/services/freeTierQuotaConstants.ts`.

## Périmètre

- S’applique uniquement si `billingPlan` résolu est **`free`** et que **`earlyBird`** est faux.
- Comptes **sans** `billingPlan` stocké sont résolus en **`first`** ([`resolveBillingPlan`](backend/src/services/entitlementsService.ts)) : **pas** de quotas volume.
- **`earlyBird`** (admin) : **aucun** quota volume (même logique que pour les intégrations).

## Règles de comptage

| Ressource | Limite | Comptage |
|-----------|--------|----------|
| Tâches actives (perso) | 25 | Tâches `status === active`, propriétaire = utilisateur, et soit sans projet, soit projet **sans** `teamId` (hors workspace équipe). |
| Projets actifs (perso) | 3 | Projets `ownerUid` = utilisateur, `status === active`, **sans** `teamId` (y compris sous-projets). |
| Notes (perso) | 3 | Notes dont `teamId` est absent (pas de partage équipe sur la note). |
| Récurrence | Interdit | Création ou mise à jour d’une tâche avec `recurrence` non nulle. |
| Pièces jointes tâche / note | Interdit | Premier upload sur une tâche ou une note (y compris délégation note → tâche). |

Les tâches rattachées à un **projet d’équipe** (`teamId` défini) ne comptent **pas** dans le plafond des 25 tâches perso (travail sous couvert du plan équipe).

## Codes HTTP / API

- Dépassement de quota ou fonctionnalité interdite : **402** `PaymentRequiredError` avec `code` machine dans le corps JSON (`FREE_QUOTA_TASKS`, `FREE_QUOTA_PROJECTS`, `FREE_QUOTA_NOTES`, `FREE_QUOTA_RECURRENCE`, `FREE_QUOTA_ATTACHMENTS`).

## `GET /auth/me`

Si les quotas s’appliquent, la réponse inclut `freeQuotas` : limites + compteurs courants pour l’UI (bannières, désactivation des CTA).
