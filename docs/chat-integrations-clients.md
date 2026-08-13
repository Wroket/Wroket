# Slack+, Teams+, Google Chat+ — public cible (tous les clients Wroket)

## Principe produit

Les intégrations **Slack+**, **Teams+** et **Google Chat+** sont des connexions **SaaS multi-clients** :

- **Chaque client Wroket** (palier **Small teams+** ou Early Bird) connecte **son propre** espace de travail.
- Wroket opère **une seule** app Slack / bot Azure / app Google Chat partagée — le client n’a **pas** à créer sa propre app développeur.
- Aucune restriction au tenant ou à l’organisation **Wroket** (`wroket.com`, `4d7ec8e5-…`) dans le code applicatif.

Ce document évite la confusion entre **ops Wroket** (une fois, côté plateforme) et **usage client** (chaque compte payant).

---

## Par canal

| Intégration | Espace client requis | Ce que le client fait | Limites connues |
|-------------|----------------------|------------------------|-----------------|
| **Slack+** | Workspace Slack (Free ou payant) | Paramètres → Connecter Slack ; choisir le canal | Droits d’installation d’apps sur le workspace ; email Slack = email Wroket |
| **Teams+** | **Microsoft 365 / Teams** (école ou entreprise) | OAuth Wroket + **installer l’app Wroket** dans un canal Teams | Compte perso sans org Teams : pas de canal d’équipe ; certaines orgs bloquent les apps custom (admin IT) |
| **Google Chat+** | **Google Workspace** (pas Gmail seul) | OAuth Wroket + ajouter l’app dans un espace Chat | Google Chat bot = Workspace uniquement (limitation Google) |

---

## Ops Wroket (une fois — pas par client)

| Canal | Console opérateur | Multilocataire |
|-------|-------------------|----------------|
| Slack+ | [api.slack.com](https://api.slack.com/apps) — app distribuée (pas « Internal only ») | Oui (chaque workspace) |
| Teams+ | Azure Bot + Entra — **bot multilocataire** + app Teams publiée / sideload | Oui (`MICROSOFT_TENANT_ID=common` en prod) |
| Google Chat+ | Google Cloud — app Chat HTTP + OAuth | Oui (chaque domaine Workspace) |

**Important Teams :** un bot Azure en **Client unique** (tenant Wroket seulement) **ne sert pas** les autres clients. En prod, le bot doit être **Multilocataire** (Entra : comptes org + perso si souhaité).

Secrets prod : `SLACK_*` (montés), `TEAMS_BOT_*` / `GOOGLE_CHAT_*` (à monter dans `cloudbuild.yaml` quand créés).

---

## Prérequis communs côté client

1. Palier **Small teams+** (ou siège équipe équivalent).
2. **Même email** (ou compte lié) entre Wroket et le canal (Slack / Entra / Google).
3. Permissions pour **installer** l’app / bot dans l’espace cible.

---

## Ce qui n’est **pas** inclus

- Compte **Microsoft personnel** sans Teams organisationnel → pas de parcours canal Teams+ complet (webhook texte possible).
- **Gmail seul** → pas Google Chat+ (Workspace requis).
- Clients **Free** Wroket → SoftLock ; pas d’OAuth Slack+/Teams+/Chat+.
- **Clone Gryzzly** (time tracking = produit principal, budgets, CIR, rappels quotidiens 1:1) — hors scope tant que PMO chat n’est pas stable. Un MVP bot time **Later** peut écrire dans le time tracking Wroket existant : [`time-tracking-bot.md`](./time-tracking-bot.md).

---

## Liens

- [ops-chat-integrations.md](./ops-chat-integrations.md) — **checklist propriétaire Slack / Azure / Google**
- [slack-plus.md](./slack-plus.md)
- [teams-plus.md](./teams-plus.md)
- [google-chat-plus.md](./google-chat-plus.md)
- [microsoft-azure.md](./microsoft-azure.md)
- [time-tracking-bot.md](./time-tracking-bot.md)
