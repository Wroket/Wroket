# Wroket — Extrait roadmap et jalons datés

**Document préparé pour dépôt e-Soleau INPI**  
**Version :** 2026-06-15  
**Source :** `ROADMAP.md` (extrait)

---

## Objectif produit

Rendre Wroket **fiable en production**, **agréable au quotidien**, **crédible pour les équipes**, puis **monétisable** — avec intégrations Notion/Monday et fonctionnalités PMO.

---

## Phases produit

| Phase | Focus |
|-------|--------|
| **P0** | Confiance & stabilité — monitoring, E2E, 2FA TOTP |
| **P1** | Revenus — Stripe, plans Free/Pro/Team, Microsoft SSO/Outlook |
| **P2** | Usage quotidien — PWA, Web Push, Gantt, import Notion |
| **P3** | Intégrations — Slack, sync, features Notion/Monday avancées |
| **P4** | Scale — time tracking, API publique, analytics |

---

## Jalons livrés (chronologie)

| Date | Jalon |
|------|--------|
| **2026-05-30** | Audit complétude feature-completeness-gate ; run E2E prod initial |
| **2026-06-07** | **GO E2E prod** — parcours critiques validés (checklist §A–I) |
| **2026-06-07** | Error UX Standard (`apiErrors.ts`), PWA (manifest + service worker) |
| **2026-06-07** | Web Push Android ; billing/gating/pricing ; polish abonnement |
| **2026-06-08** | **Gantt interactif** (drag, resize) — E2E prod validé |
| **2026-06-08** | Alignement 3 priorités produit : PMO / Notion-Like / Monday-Like |
| **2026-06-15** | Hub documentation `/docs` ; flipcard intégrations homepage |
| **2026-06-15** | Fix persistance Firestore todos v2 (sanitize undefined) |

---

## P0 — Terminé

- Monitoring Cloud Monitoring (drift todos, alertes)
- 2FA TOTP
- E2E prod validé (2026-06-07)
- Todo persistence v2 + invalidation cross-replica

---

## P1 — ~95 %

- Plans Free/Pro/Team + entitlements
- Webhooks Stripe, portail client
- Page `/pricing`
- Microsoft Outlook + Teams (booking, invités externes)
- Stripe Checkout self-service : **en pause**

---

## P2 — En cours / livré partiel

- PWA installable
- Web Push multi-appareil
- Gantt interactif + quadrillage
- Import Notion ZIP (vague 1)
- Liens partageables projet, portfolio équipe (vague 2)

---

## Intégrations (2026)

- Notion OAuth + import bases/contacts + migration
- Monday.com OAuth + import boards
- Google Calendar + Microsoft Graph (multi-comptes)
- Documentation guides FR/EN (`/docs/integrations/…`)

---

## Infrastructure

- Production : **Cloud Run** (pas VM)
- Firestore persistance production
- Cloud Build déploiement automatique `main`
- GitHub Actions CI (lint, type-check, smoke E2E)

---

_Cet extrait atteste de l'évolution continue du logiciel Wroket à la date du dépôt. Export PDF recommandé pour l'INPI._
