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

## Checklist opérationnelle

- [x] Application **Wroket** enregistrée — Client ID `e75f60be-547f-40fe-b910-5feb59a600bc`
- [ ] Client ID copié dans Secret Manager `MICROSOFT_CLIENT_ID` (+ IAM `wroket-run`)
- [ ] Secret client créé — **Value** dans Secret Manager `MICROSOFT_CLIENT_SECRET`
- [ ] 4 redirect URIs + ID tokens
- [ ] Permissions Graph + consentement admin sur le tenant `4d7ec8e5-e09d-439d-8954-0f90454b1b28`
- [x] Domaine `wroket.com` vérifié dans Entra ID
- [ ] Deploy `wroket-api` avec secrets montés

## Liens

- [backend/.env.example](../backend/.env.example)
- [cloudbuild.yaml](../cloudbuild.yaml)
- Checklist E2E : [checklist-e2e-prod.md](./checklist-e2e-prod.md) §D (agenda / Microsoft)
