# Bot Wroket + time tracking — décision produit

## Verdict (2026-08)

**Oui**, un bot peut faciliter la saisie des temps — **non**, ce n’est pas un clone Gryzzly et **pas maintenant**.

| Décision | Détail |
|----------|--------|
| Cœur métier | Déjà livré : chronomètre + manuel + timesheet projet ([`timeSessionService.ts`](../backend/src/services/timeSessionService.ts)) |
| Rôle du bot | Canal d’**adoption** (`/wroket start\|stop\|log`) sur les **todos** Wroket |
| Quand | **Later / P3bis** — après ops Slack+ / Teams+ / Chat+ stables |
| Hors scope | Budgets, CIR, dashboard rentabilité, rappels 1:1 type Gryzzly (tant que PMO chat n’est pas stable) |

Voir aussi : [chat-integrations-clients.md](./chat-integrations-clients.md).

## Prérequis (ops)

1. Slack+ smoke workspace (Lots 3–4)
2. Teams+ : bot **multilocataire**, secrets Cloud Run, replies via Bot Connector, app installable par org client
3. Google Chat+ secrets + smoke Workspace

## MVP Later (périmètre minimal)

Commandes partagées dans [`slashCommands.ts`](../backend/src/services/chatChannel/slashCommands.ts) :

| Commande | Action |
|----------|--------|
| `/wroket start <todoId>` | `startTimeTimer` |
| `/wroket stop` | `stopTimeTimer` |
| `/wroket log <todoId> <durée>` | `addManualTimeSession` |
| `/wroket timer` | Statut chronomètre actif |

- Pas de nouveau store ; même SoftLock Small+.
- Help `/wroket` + smoke Slack puis Teams.
- UX tâche : s’appuyer sur `/wroket tasks` (ids) ; boutons de sélection = enrichissement ultérieur.
- Rappels quotidiens 1:1 = **optionnel**, seulement si traction MVP.

## Alternative sans bot

Améliorer le timer UI (badge TaskList, start depuis Agenda) — moins de surface, indépendant des canaux chat.
