# Triage npm audit (2026-11-14)

Passe sécu deps — plan Secu → E2E → Doc. Objectif : **0 high/critical non justifié**.

## Résumé

| Package | Avant | Après correctifs | High/Critical restants |
|---------|-------|------------------|------------------------|
| `backend/` | 28 (14 high, 1 critical) | 9 moderate | **0** |
| `frontend/` | 23 (9 high, 2 critical) | 7 moderate | **0** |
| `e2e/` | 0 | 0 | **0** |

## Correctifs appliqués

- **backend** : `npm audit fix` (sans `--force`) + bumps ciblés :
  - `nodemailer` → `^10.5.0` (CVEs high ≤10.1.3 ; usage limité à `createTransport` / `sendMail`)
  - `adm-zip` → `0.6.1` (ZIP DoS / extraction ; import Notion)
- **frontend** : `npm audit fix` + `next` **16.2.6 → 16.4.6** (même majeur ; CVEs critical/high App Router, image opt, middleware)

## Résiduels acceptés (moderate only)

| Chaîne | Raison d’acceptation |
|--------|----------------------|
| `@google-cloud/storage@7` → `uuid` / `teeny-request` (backend) | Fix = major `storage@9` (`npm audit fix --force`). Hors scope upgrade majeurs non bloquants ; surface limitée au SA Cloud Run. |
| `typescript-eslint` / tooling (frontend) | Dépendances **dev** ; pas exposées au runtime Cloud Run. |

Réévaluer au prochain bump GCP Storage ou ESLint majeur.

## Hors scope

- `npm audit fix --force` (breaking Next 17 / Storage 9 non demandé)
- Pentest externe
