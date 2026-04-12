# P0 — Documentation par volet

Ordre recommandé : **1 → 2 → 3 → 4** (monitoring et stabilité avant E2E ; E2E avant gros changements auth ; unitaires en complément des E2E).

| Volet | Fichier | Thème |
|-------|---------|--------|
| 1 | [volet-1-monitoring.md](volet-1-monitoring.md) | Alertes GCP, uptime, doc monitoring, health profond |
| 2 | [volet-2-e2e.md](volet-2-e2e.md) | Playwright, secrets, CI, CORS |
| 3 | [volet-3-2fa-totp.md](volet-3-2fa-totp.md) | TOTP, API, SSO, UI |
| 4 | [volet-4-tests-unitaires.md](volet-4-tests-unitaires.md) | Vitest, cibles backend/frontend, CI |

Le fichier [monitoring.md](../monitoring.md) documente les endpoints `/health` et `/health/ready` (volet 1 côté code).
