# Runbook fiabilite Agenda + Todos

Ce runbook couvre les incidents "agenda/taches visibles incoherentes" et "drift `todos_v2`".

## 1) Detection rapide

- Verifier la readiness:
  - `GET /health/ready`
  - attendre `status: "ok"`
- Signaux critiques:
  - `persistence.consecutiveFlushFailures > 0`
  - `todosDrift.status` egal a `drift` ou `error`
  - logs avec `event: "todos-drift"` et `severity: "ERROR"`

## 2) Diagnostic

1. Verifier le mode de stockage:
   - `TODOS_STORAGE_MODE` doit etre connu (`legacy`, `dual`, `v2`).
2. Verifier la couche persistence:
   - timestamps `lastFlushAt`, duree `lastFlushDurationMs`, compteurs d'echec.
3. Identifier l'utilisateur impacte:
   - lire `worstOwner.uid` dans le log `todos-drift`.

## 3) Remediation

### A. Drift identifie pour un utilisateur

Executer la reconciliation ciblee:

```bash
RUN_MIGRATION=reconcile_legacy_v2 npx ts-node backend/src/scripts/reconcileLegacyV2Drift.ts --uid <uid>
```

### B. Drift global

Executer la reconciliation globale:

```bash
RUN_MIGRATION=reconcile_legacy_v2 npx ts-node backend/src/scripts/reconcileLegacyV2Drift.ts --all
```

## 4) Verification post-correctif

1. Relancer `GET /health/ready` et verifier:
   - `status: "ok"`
   - `todosDrift.status: "ok"` (ou `skipped` en mode `legacy`)
2. Valider un parcours utilisateur E2E:
   - creer une tache
   - reserver un creneau agenda
   - rafraichir la page
   - verifier la presence de la tache et du creneau
3. Verifier les erreurs fonctionnelles:
   - conflit de creneau retourne `code: CALENDAR_SLOT_CONFLICT`
   - absence de calendrier par defaut retourne `code: CALENDAR_DEFAULT_BOOKING_REQUIRED`

## 5) Prevention

- Surveiller `GET /health/ready` via uptime check.
- Alerter sur:
  - `status = degraded`
  - `todosDrift.status in ["drift", "error"]`
- Garder la frequence du monitor drift horaire active en production.
