# Slack App Directory — dossier optionnel (non soumis)

> **Statut 2026-11-15** : **ne pas soumettre** sans go produit explicite.  
> Déjà en prod : **Manage Distribution** public (app `A0ASUUQ8DQE`) — install multi-workspaces via OAuth Wroket.  
> Directory = découverte dans le catalogue Slack ; ce n’est **pas** requis pour le golden path.

## Pourquoi c’est optionnel

| Capacité | Aujourd’hui | Directory |
|----------|-------------|-----------|
| Install client (Small teams+) | Lien OAuth Paramètres | Oui aussi |
| Multi-workspaces | Oui (distribution publique) | Oui |
| Découverte « chercher Wroket » dans Slack | Non | Oui (après review) |
| Charge review / assets / sécurité | — | Élevée |

Références : [slack-plus.md](./slack-plus.md), [ops-chat-integrations.md](./ops-chat-integrations.md) §1, [chat-channel-priority.md](./chat-channel-priority.md).

## Prérequis avant soumission

- [x] Secrets Cloud Run + smoke Connect / Test / boutons / `/wroket my-week`
- [x] Guide in-app à jour (`/docs/integrations/slack`)
- [ ] Go produit + entité légale / trader (aligné dépôt statuts si listing EEA)
- [ ] Privacy policy + Terms URLs stables (`wroket.com`)
- [ ] Support email monitoré (`team@wroket.com`)
- [ ] Screenshots / icônes conformes guidelines Slack Directory
- [ ] Security questionnaire Slack rempli (scopes justifiés, data retention)
- [ ] SoftLock / pricing copy : Small teams+ clair sur le listing

## Contenu listing (brouillon)

- **Name** : Wroket
- **Short description** : Capture tasks, PMO digests, and time tracking from Slack (`/wroket`).
- **Long description** : pointer vers guide in-app ; mentionner digests `my-week` / `overdue` / `team-risk`, timer, Assist preview.
- **Categories** : Productivity / Project management
- **Install** : OAuth + bot scopes documentés dans [slack-plus.md](./slack-plus.md)
- **Pricing** : freemium via Wroket Small teams+ (pas free Slack-only illimité)

## Scopes à déclarer (bot)

`chat:write`, `channels:read`, `groups:read`, `incoming-webhook`, `users:read`, `users:read.email`, `commands`

Chaque scope : justification « poster notifications / résoudre e-mail → uid / webhook channel / slash ».

## Go / no-go

| Décision | Action |
|----------|--------|
| **No-go** (défaut) | Rester OAuth install-link ; ne pas revendiquer Directory en marketing |
| **Go** | Remplir questionnaire Slack → soumettre → suivre review ; cocher ici + ROADMAP |

## Après approbation (si go)

1. Mettre à jour copy marketing (retirer « pas via App Directory »).
2. Ajouter lien Directory dans Paramètres / guide in-app.
3. Re-smoke install depuis Directory sur un workspace neuf.
