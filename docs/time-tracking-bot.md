# Bot Wroket + time tracking — décision produit

## Verdict

**Oui**, un bot facilite la saisie des temps — **non**, ce n’est pas un clone Gryzzly.

| Décision | Détail |
|----------|--------|
| Cœur métier | Chronomètre + manuel + timesheet projet ([`timeSessionService.ts`](../backend/src/services/timeSessionService.ts)) |
| Rôle du bot | Canal d’**adoption** (`/wroket start\|stop\|log\|timer`) sur les **todos** Wroket |
| Statut | **MVP livré 2026-11-13** (slash partagé Slack / Teams / Chat / Discord) |
| Hors scope MVP | Budgets, CIR, dashboard rentabilité, rappels 1:1 type Gryzzly → **ROADMAP Later** (« Gryzzly-like ») |

Voir aussi : [chat-integrations-clients.md](./chat-integrations-clients.md) · [slack-plus.md](./slack-plus.md).

## Prérequis (ops) — remplis

1. ~~Slack+ smoke workspace (Lots 3–4)~~
2. ~~Teams+ multilocataire + secrets Cloud Run~~
3. ~~Google Chat+ secrets + smoke~~

## MVP (périmètre)

Commandes partagées dans [`slashCommands.ts`](../backend/src/services/chatChannel/slashCommands.ts) :

| Commande | Action |
|----------|--------|
| `/wroket tasks` | Liste ids pour démarrer / logger |
| `/wroket start <todoId>` | `startTimeTimer` |
| `/wroket stop` | `stopTimeTimer` |
| `/wroket log <todoId> <min> [note]` | `addManualTimeSession` |
| `/wroket timer` | Statut chronomètre actif |

- Pas de nouveau store ; SoftLock **Small teams+** (ou Early Bird) avec CTA `/pricing`.
- Help `/wroket` documente les verbes timer.
- Slack App Home : bouton **Arrêter** le chrono (`wroket_stop_timer`).
- Tests : `chatChannel.test.ts` (start/timer/stop/log + SoftLock Free) · `timeSessionService.test.ts`.

## Boutons de sélection (Slack) — livré 2026-11-14

- `/wroket tasks` → Block Kit *⏱️ Start* / *+15 min* (ephemeral).
- App Home : mêmes boutons + *Terminer* sur les tâches actives ; *Arrêter* si chrono en cours.
- Handlers : `wroket_start_timer`, `wroket_log_15`, `wroket_stop_timer`.

## Enrichissements ultérieurs (optionnel)

- Rappels quotidiens 1:1 si traction MVP.
- Boutons équivalents Teams / Discord.
- Smoke HTTP Slack dédié Lot timer (au-delà des unit tests).

## Alternative sans bot

Améliorer le timer UI (badge TaskList, start depuis Agenda) — moins de surface, indépendant des canaux chat.
