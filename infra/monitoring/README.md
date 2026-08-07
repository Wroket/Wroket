# Cloud Monitoring — Wroket prod

Descriptors versionnés pour les métriques log-based, uptime checks et politiques d’alerte du projet `involuted-reach-490718-h4`.

**Canal de notification** : `projects/involuted-reach-490718-h4/notificationChannels/12683066122650849013` (email → team@wroket.com)

Doc produit : [`docs/monitoring.md`](../../docs/monitoring.md).

## Currently deployed

### Log-based metrics

| Metric | File |
|--------|------|
| `todos_drift_events` | `log-metric-todos-drift.yaml` |
| `persistence_flush_exhausted_events` | `log-metric-flush-exhausted.yaml` |

### Uptime checks

| Display name | Path | Check id |
|--------------|------|----------|
| `api-wroket-uptime` | `/health` | `api-wroket-uptime-hkzqZzc_Eu4` |
| `api-wroket-ready` | `/health/ready` | `api-wroket-ready-cczQkYwsIps` |
| `wroket.com-uptime` | `/` | `wroket-com-uptime-jlydLulMAQk` |

### Alert policies

| Display name | Policy id | File |
|--------------|-----------|------|
| `api-wroket-uptime uptime failure` | `10026712680771985574` | `alert-policy-api-uptime.yaml` |
| `api-wroket-ready uptime failure` | `9792630388000427188` | `alert-policy-api-ready-uptime.yaml` |
| `wroket.com-uptime uptime failure` | `6873619614913231142` | `alert-policy-web-uptime.yaml` |
| `wroket-api-5xx` | `13274497411039534632` | `alert-policy-api-5xx.yaml` |
| `wroket-web-5xx` | `8336745397785806469` | `alert-policy-web-5xx.yaml` |
| `wroket-api-latency-p99` | `17801212932068925771` | `alert-policy-api-latency-p99.yaml` |
| `wroket-web-latency-p99` | `13417397610361527654` | `alert-policy-web-latency-p99.yaml` |
| `wroket-api-memory-high` | `3813343145813666779` | `alert-policy-api-memory.yaml` |
| `firestore-api-errors` | `7395269505368247320` | `alert-policy-firestore-errors.yaml` |
| `Todos drift detected (legacy <-> todos_v2)` | `13398049412521343216` | `alert-policy-todos-drift.yaml` |
| `Firestore flush exhausted (store/* not persisted)` | `8422222024565883659` | `alert-policy-flush-exhausted.yaml` |
| `wroket-consumed-API` (**disabled**) | `6405248621142152044` | — |

### Billing budget

| Display name | Budget id | Amount | File |
|--------------|-----------|--------|------|
| `Wroket prod monthly` | `f6d3b04c-68e7-4b75-a3e8-c0fc8ced3048` | 15 EUR / month | `billing-budget-wroket.yaml` |

Billing account : `01AEE7-096FA9-3A56A3`. Thresholds at 50 % / 90 % / 100 % current + 100 % forecasted → `team@wroket.com`.

```powershell
gcloud services enable billingbudgets.googleapis.com --project=involuted-reach-490718-h4

gcloud billing budgets create `
  --billing-account=01AEE7-096FA9-3A56A3 `
  --display-name="Wroket prod monthly" `
  --budget-amount=15EUR `
  --calendar-period=month `
  --filter-projects=projects/involuted-reach-490718-h4 `
  --threshold-rule="percent=0.5" `
  --threshold-rule="percent=0.9" `
  --threshold-rule="percent=1.0" `
  --threshold-rule="percent=1.0,basis=forecasted-spend" `
  --notifications-rule-monitoring-notification-channels=projects/involuted-reach-490718-h4/notificationChannels/12683066122650849013
```

## Re-apply / update

```powershell
# Example: refine an existing policy
gcloud monitoring policies update 13274497411039534632 `
  --policy-from-file=infra/monitoring/alert-policy-api-5xx.yaml `
  --project=involuted-reach-490718-h4

# Example: create a new policy
gcloud monitoring policies create `
  --policy-from-file=infra/monitoring/alert-policy-api-latency-p99.yaml `
  --project=involuted-reach-490718-h4

# Uptime path / create
gcloud monitoring uptime update api-wroket-uptime-hkzqZzc_Eu4 `
  --path=/health --project=involuted-reach-490718-h4
```

### Windows : erreur « alpha / beta » ou droits SDK

Les **politiques d’alerte** et **uptime** n’utilisent **pas** `gcloud alpha/beta` : commandes stables `gcloud monitoring policies …` et `gcloud monitoring uptime …`.

Si une commande demande d’installer `beta` (ex. `gcloud beta monitoring channels list`) :

1. Ouvrir **Google Cloud SDK Shell** en administrateur, puis `gcloud components install beta`
2. **Ou** ignorer beta : le canal email prod est déjà référencé dans les YAML
3. **Ou** gérer via la [console Monitoring](https://console.cloud.google.com/monitoring/alerting?project=involuted-reach-490718-h4)

## Log-based metrics (create / update)

```powershell
gcloud logging metrics create todos_drift_events `
  --config-from-file=infra/monitoring/log-metric-todos-drift.yaml `
  --project=involuted-reach-490718-h4

gcloud logging metrics update todos_drift_events `
  --config-from-file=infra/monitoring/log-metric-todos-drift.yaml `
  --project=involuted-reach-490718-h4
```

Idem pour `persistence_flush_exhausted_events`.

## Verifying

```powershell
gcloud monitoring policies list --project=involuted-reach-490718-h4 `
  --format="table(displayName,enabled,name)"

gcloud monitoring uptime list-configs --project=involuted-reach-490718-h4 `
  --format="table(displayName,httpCheck.path,period)"

gcloud logging read 'jsonPayload.event="todos-drift" jsonPayload.status="drift"' `
  --project=involuted-reach-490718-h4 --freshness=2d `
  --format='value(timestamp,jsonPayload.worstOwner)'
```

## Cleanup / rollback

```powershell
gcloud monitoring policies delete <POLICY_ID> --project=involuted-reach-490718-h4
gcloud logging metrics delete todos_drift_events --project=involuted-reach-490718-h4
```

Pour réactiver l’ancienne alerte consommée (déconseillé) :

```powershell
gcloud monitoring policies update 6405248621142152044 --enabled --project=involuted-reach-490718-h4
```
