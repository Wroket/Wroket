# Microsoft Azure / Entra ID — Wroket

Référence pour SSO Microsoft et connecteur Outlook/Graph.

## Tenant (annuaire) Wroket

| Champ | Valeur |
|-------|--------|
| **Directory (tenant) ID** | `4d7ec8e5-e09d-439d-8954-0f90454b1b28` |
| Portail | [portal.azure.com](https://portal.azure.com) → Microsoft Entra ID |

Ce GUID identifie l’annuaire Entra où l’application **Wroket** est enregistrée (consentement admin, domaine personnalisé, secrets).

**Domaines** (Entra ID → Noms de domaine personnalisés) :

| Domaine | État |
|---------|------|
| `wroket.com` | Vérifié |
| `francoisbroudeur.onmicrosoft.com` | Disponible (tenant par défaut) |

## Application Wroket (inscription + entreprise)

| Champ | Valeur |
|-------|--------|
| **Nom** | Wroket |
| **Application (client) ID** | `e75f60be-547f-40fe-b910-5feb59a600bc` |
| **État** | Activé (Applications d’entreprise) |
| Portail | Entra ID → **Inscriptions d’applications** (même Client ID) |

→ Valeur à stocker dans GCP Secret Manager `MICROSOFT_CLIENT_ID` (et en local `backend/.env` si dev).

## Variables d’environnement API

| Variable | Prod (`cloudbuild.yaml`) | Rôle |
|----------|--------------------------|------|
| `MICROSOFT_CLIENT_ID` | Secret Manager `MICROSOFT_CLIENT_ID` | Application (client) ID |
| `MICROSOFT_CLIENT_SECRET` | Secret Manager `MICROSOFT_CLIENT_SECRET` | Secret client (Value, pas Secret ID) |
| `MICROSOFT_TENANT_ID` | `common` | **Endpoint OAuth** (`login.microsoftonline.com/{tenant}`) |
| `MICROSOFT_SSO_REDIRECT_URI` | `https://api.wroket.com/auth/microsoft/callback` | Connexion compte Wroket |
| `MICROSOFT_GRAPH_REDIRECT_URI` | `https://api.wroket.com/calendar/microsoft/callback` | Outlook / calendrier |

### Pourquoi `MICROSOFT_TENANT_ID=common` en prod ?

L’inscription d’app est **multi-tenant + comptes Microsoft personnels**. L’authority `common` permet la connexion de comptes perso et de toutes les organisations.  
Le **Directory tenant ID** ci-dessus sert au portail Azure (admin, DNS, consentement) — ne pas le confondre avec `MICROSOFT_TENANT_ID` sauf si vous basculez volontairement en **single-tenant** (uniquement votre annuaire).

## URI de redirection (Azure → Authentification → Web)

- `https://api.wroket.com/auth/microsoft/callback`
- `https://api.wroket.com/calendar/microsoft/callback`
- `http://localhost:3001/auth/microsoft/callback`
- `http://localhost:3001/calendar/microsoft/callback`

## Permissions Graph (déléguées)

`openid`, `email`, `profile`, `offline_access`, `User.Read`, `Calendars.Read`, `Calendars.ReadWrite`

## Teams+ (Bot Framework)

Pour l’intégration chat interactive (Adaptive Cards, `/wroket`), voir [teams-plus.md](./teams-plus.md) et [chat-integrations-clients.md](./chat-integrations-clients.md).

**Public cible :** tous les clients Wroket (Small teams+) avec Microsoft 365 / Teams — **pas** réservé au tenant Wroket ci-dessous.

| Variable | Rôle |
|----------|------|
| `TEAMS_BOT_APP_ID` (ou `MICROSOFT_BOT_APP_ID` / réutiliser `MICROSOFT_CLIENT_ID`) | App ID bot **partagé** (SaaS) |
| `TEAMS_BOT_APP_PASSWORD` (ou `MICROSOFT_BOT_APP_PASSWORD` / `MICROSOFT_CLIENT_SECRET`) | Secret bot |
| `TEAMS_REDIRECT_URI` | `https://api.wroket.com/integrations/teams/callback` |

Messaging endpoint Bot : `https://api.wroket.com/integrations/teams/interactions`

**Ops prod :** bot Azure **Multilocataire** + app Teams installable par chaque client (manifest `docs/assets/azure/teams-app/`). Le Directory tenant ID Wroket (`4d7ec8e5-…`) sert à l’administration Entra Wroket, pas à verrouiller les clients.

Checklist détaillée : [ops-chat-integrations.md](./ops-chat-integrations.md) §2.

### Passage Client unique → Multilocataire (obligatoire multi-clients)

1. Azure Bot `wroket-teams` → **Configuration** → Type de bot → **Multilocataire** → Appliquer  
2. Entra → Inscription **Wroket** → **Types de comptes** → Multilocataire (org)  
3. **Canaux** → Microsoft Teams activé  
4. Installer [`wroket-teams-app.zip`](./assets/azure/wroket-teams-app.zip) dans une org M365 de test  

Icônes : `docs/assets/azure/wroket-bot-color-192.png` (192) / `wroket-bot-outline-32.png` (32).

## Checklist opérationnelle

- [x] Application **Wroket** enregistrée — Client ID `e75f60be-547f-40fe-b910-5feb59a600bc`
- [x] Client ID / secret montés via Cloud Build (`MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` → `wroket-api`)
- [x] Redirect SSO + Graph dans `cloudbuild.yaml` (`MICROSOFT_SSO_REDIRECT_URI`, `MICROSOFT_GRAPH_REDIRECT_URI`)
- [ ] Vérifier en Azure : 4 redirect URIs Web + ID tokens (si login SSO échoue)
- [ ] Permissions Graph + consentement admin sur le tenant `4d7ec8e5-e09d-439d-8954-0f90454b1b28` (si calendrier Outlook)
- [x] Domaine `wroket.com` vérifié dans Entra ID
- [ ] **E2E humain** : checklist [`checklist-e2e-prod.md`](./checklist-e2e-prod.md) §B items 5–7 (Microsoft SSO)

## Liens

- [backend/.env.example](../backend/.env.example)
- [cloudbuild.yaml](../cloudbuild.yaml)
- Checklist E2E : [checklist-e2e-prod.md](./checklist-e2e-prod.md) §B (SSO) + §D (agenda / Microsoft)
