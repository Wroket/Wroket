# Revue mensuelle — funnel Données

Mesure post Path to 9 Données (Phase D).

## KPI

| Mois | `note_created` | `data_exported` (notes) | `data_exported` (account) | `data_imported` | Taux note→export 48 h | Incidents delete / orphelins GCS | Notes |
|------|----------------|-------------------------|---------------------------|-----------------|----------------------|----------------------------------|-------|
| | | | | | | | |

## Sources

- `window.__wroketAnalytics` / `wroket_product_analytics`
- Checklist : [`docs/cold-path-donnees.md`](cold-path-donnees.md)
- Backend : `rgpdService` delete/export ; script `cleanup:orphan-attachments`

## Actions si taux bas ou incidents

1. Vérifier menu Export/Import sur hub Données
2. SoftLock quota notes + liens Compte & données
3. Logs purge note GCS / externalConnections sur delete
