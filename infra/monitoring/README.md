# Cloud Monitoring — todos drift alert

Versioned descriptors for the GCP log-based metric and alert policy that
notify when the `todosDriftMonitor` (see
[`backend/src/services/todosDriftMonitor.ts`](../../backend/src/services/todosDriftMonitor.ts))
reports drift between the legacy todo store and `todos_v2`.

## Currently deployed (project `involuted-reach-490718-h4`)

| Resource | Identifier |
|---|---|
| Log-based metric | `logging.googleapis.com/user/todos_drift_events` |
| Alert policy | `projects/involuted-reach-490718-h4/alertPolicies/13398049412521343216` |
| Notification channel | `projects/involuted-reach-490718-h4/notificationChannels/12683066122650849013` (email → team@wroket.com) |

### Flush exhaustion (to deploy)

| Resource | Files |
|---|---|
| Log-based metric | `persistence_flush_exhausted_events` ← `log-metric-flush-exhausted.yaml` |
| Alert policy | `alert-policy-flush-exhausted.yaml` |

```powershell
gcloud logging metrics create persistence_flush_exhausted_events `
  --config-from-file=infra/monitoring/log-metric-flush-exhausted.yaml `
  --project=involuted-reach-490718-h4

gcloud alpha monitoring policies create `
  --policy-from-file=infra/monitoring/alert-policy-flush-exhausted.yaml `
  --project=involuted-reach-490718-h4
```

Use `update` instead of `create` if the metric or policy already exists.

The sections below are kept for future re-application from scratch or for
adapting to another project.

## Files

| File | Purpose |
|---|---|
| `log-metric-todos-drift.yaml` | Log-based metric counting `jsonPayload.event="todos-drift" status="drift"` lines. |
| `alert-policy-todos-drift.yaml` | Alert policy firing when the metric is > 0 over the last hour. |
| `log-metric-flush-exhausted.yaml` | Log-based metric for `jsonPayload.event="persistence-flush" status="exhausted"`. |
| `alert-policy-flush-exhausted.yaml` | Alert when flush exhaustion events occur in the last hour. |

## One-time apply

Run these from the repository root with `gcloud` authenticated against
the prod project (`involuted-reach-490718-h4`).

### 1. Create the log-based metric

```powershell
gcloud logging metrics create todos_drift_events `
  --config-from-file=infra/monitoring/log-metric-todos-drift.yaml `
  --project=involuted-reach-490718-h4
```

If the metric already exists, use `update` (idempotent):

```powershell
gcloud logging metrics update todos_drift_events `
  --config-from-file=infra/monitoring/log-metric-todos-drift.yaml `
  --project=involuted-reach-490718-h4
```

### 2. Pick or create a notification channel

List existing channels:

```powershell
gcloud alpha monitoring channels list `
  --project=involuted-reach-490718-h4 `
  --format='value(name,type,displayName)'
```

If you need a new email channel:

```powershell
gcloud alpha monitoring channels create `
  --display-name="Wroket prod alerts" `
  --type=email `
  --channel-labels=email_address=francois@broudeur.com `
  --project=involuted-reach-490718-h4
```

Note the returned channel id (the digits after `notificationChannels/`).

### 3. Patch and apply the alert policy

Open `alert-policy-todos-drift.yaml` and replace
`NOTIFICATION_CHANNEL_ID` with the id from step 2, then:

```powershell
gcloud alpha monitoring policies create `
  --policy-from-file=infra/monitoring/alert-policy-todos-drift.yaml `
  --project=involuted-reach-490718-h4
```

To later modify the policy, list and update:

```powershell
gcloud alpha monitoring policies list --project=involuted-reach-490718-h4 `
  --format='value(name,displayName)'

gcloud alpha monitoring policies update <POLICY_ID> `
  --policy-from-file=infra/monitoring/alert-policy-todos-drift.yaml `
  --project=involuted-reach-490718-h4
```

## Verifying

After creation, force a drift to confirm the wiring (only do this on a
non-prod project, or right before running the reconcile script if drift
already exists). The metric should tick up within ~1 minute of the next
`todosDriftMonitor` cycle (hourly).

You can also inspect recent metric samples:

```powershell
gcloud logging read 'jsonPayload.event="todos-drift" jsonPayload.status="drift"' `
  --project=involuted-reach-490718-h4 `
  --freshness=2d `
  --format='value(timestamp,jsonPayload.worstOwner)'
```

## Cleanup / rollback

```powershell
gcloud alpha monitoring policies delete <POLICY_ID> --project=involuted-reach-490718-h4
gcloud logging metrics delete todos_drift_events --project=involuted-reach-490718-h4
```
