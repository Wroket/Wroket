# Priorité canaux chat Wroket (étude 2026-11-08)

Décision produit validée : **ne pas** lancer Google Workspace Marketplace public ni Microsoft Teams Store en premier.

## Ordre

1. **Slack+** — golden path (ROI, fluidité OAuth déjà en prod, standard PMO).
2. **Teams+** — stratégique (M365), parcours **pragmatique** : OAuth + deep link / sideload zip / catalogue org. **Pas** Partner Center tant que le bot Azure reste Client unique sans stratégie multi-clients claire.
3. **Google Chat+** — utile pour clients Workspace ; listing **privé / domaine** ; Marketplace **public différé**. Scope cible : `chat.messages.create` (pas `chat.messages` restricted).
4. **Discord+** — **optionnel / niche** maker-communauté ; ne remplace pas Teams ni Chat pour l’ICP Small teams+.

## Différé explicitement

- Google Workspace Marketplace public (nouveau projet GCP requis).
- Microsoft Partner Center / Teams Store.
- Audit CASA Google (évité si scope create-only).

## Références marché (ordres de grandeur)

- Teams / M365 : leader seats collab.
- Slack : chat-first + écosystème apps ; priorité des outils type Asana / Monday / Linear.
- Google Chat : part via Workspace, Marketplace 3rd-party limité.
- Discord : adoption pro très faible vs Slack.

Détail clients : [chat-integrations-clients.md](./chat-integrations-clients.md).  
Ops : [ops-chat-integrations.md](./ops-chat-integrations.md).
