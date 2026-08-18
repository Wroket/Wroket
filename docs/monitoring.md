# Monitoring Wroket (API)

Ce document complète les actions manuelles dans la console GCP (alertes, uptime). Il décrit les **endpoints de santé** exposés par `wroket-api` et comment les utiliser pour le monitoring.

**Console** : [Cloud Monitoring — Alerting](https://console.cloud.google.com/monitoring/alerting?project=involuted-reach-490718-h4)  
**Projet** : `involuted-reach-490718-h4`  
**Canal** : email `team@wroket.com` (`notificationChannels/12683066122650849013`)

## Endpoints

| URL | Rôle | Code HTTP | Quand l’utiliser |
|-----|------|-----------|------------------|
| `GET https://api.wroket.com/` | Message simple | 200 | Smoke test minimal |
| `GET https://api.wroket.com/health` | **Liveness** — process Node vivant, pas d’accès datastore | 200 | Uptime checks très fréquents, coût Firestore nul |
| `GET https://api.wroket.com/health/ready` | **Readiness** — une lecture Firestore sur `store/users` (ou OK en local) | 200 si datastore OK, **503** si Firestore injoignable ou non initialisé | Alertes « API inutilisable », second uptime check, SLO données |

### Détails

- **`/health`** : retourne `{ "status": "ok", "uptime", "timestamp" }`. Ne vérifie pas Firestore — l’API peut répondre 200 même si la base est inaccessible (tant que le process tourne).
- **`/health/ready`** : exécute un `get()` sur le document Firestore `store/users`. En `USE_LOCAL_STORE=true`, considère le magasin local comme disponible sans lecture réseau.
- En cas d’échec Firestore, corps JSON du type : `{ "status": "degraded", "store": { "ok": false, "backend": "firestore" }, ... }` avec HTTP **503**.

## Uptime checks GCP

| Display name | URL | Période | Alerte associée |
|--------------|-----|---------|-----------------|
| `api-wroket-uptime` | `https://api.wroket.com/health` | 300s | `api-wroket-uptime uptime failure` |
| `api-wroket-ready` | `https://api.wroket.com/health/ready` | 300s | `api-wroket-ready uptime failure` |
| `wroket.com-uptime` | `https://wroket.com/` | 300s | `wroket.com-uptime uptime failure` |

Descriptors versionnés : `infra/monitoring/uptime-*.yaml`.

## Alertes email admin (intégrées)

En **production**, si SMTP est configuré, l’API envoie un email aux adresses **`ADMIN_EMAILS`** lorsque :

| Incident | Déclencheur |
|----------|-------------|
| Persistance Firestore | Échec flush `store/*` (`consecutiveFlushFailures > 0`) |
| Flush stale | Sonde 15 min : dirty **continûment** non vide depuis > 10 min (`dirtyAgeMs`, pas `lastFlushAt`) |
| Drift todos | Monitor horaire `todosDriftMonitor` |
| Firestore injoignable | Sonde readiness toutes les 15 min (si ping échoue) |
| SMTP dégradé | ≥ 3 échecs SMTP / 1 h sans succès, ou taux d'échec > 80 % (≥ 5 tentatives) |

- Cooldown par défaut : **1 h** par type d’alerte (`ADMIN_OPS_ALERT_COOLDOWN_MINUTES`).
- Seuil flush stale : `ADMIN_OPS_FLUSH_STALE_MINUTES=10`.
- Désactiver : `ADMIN_OPS_ALERTS_ENABLED=false`.
- Destinataires alternatifs : `ADMIN_OPS_ALERT_TO=email1,email2`.

## Alertes Cloud Monitoring (GCP)

### Métriques log-based

| Métrique log-based | Fichiers | Événement source |
|--------------------|----------|------------------|
| `todos_drift_events` | `infra/monitoring/log-metric-todos-drift.yaml` | `jsonPayload.event="todos-drift"` |
| `persistence_flush_exhausted_events` | `infra/monitoring/log-metric-flush-exhausted.yaml` | `jsonPayload.event="persistence-flush" status="exhausted"` |

Déploiement : voir [`infra/monitoring/README.md`](../infra/monitoring/README.md).

### Politiques actives (prod)

| Politique | ID | Seuil / condition | Sévérité |
|-----------|----|-------------------|----------|
| `api-wroket-uptime uptime failure` | `10026712680771985574` | Uptime `/health` failed | CRITICAL |
| `api-wroket-ready uptime failure` | `9792630388000427188` | Uptime `/health/ready` failed | CRITICAL |
| `wroket.com-uptime uptime failure` | `6873619614913231142` | Uptime `wroket.com/` failed | CRITICAL |
| `wroket-api-5xx` | `13274497411039534632` | > **2** 5xx / 5 min | ERROR |
| `wroket-web-5xx` | `8336745397785806469` | > **3** 5xx / 5 min | WARNING |
| `wroket-api-latency-p99` | `17801212932068925771` | p99 > **3 s** pendant **5 min** | WARNING |
| `wroket-web-latency-p99` | `13417397610361527654` | p99 > **3 s** pendant **5 min** | WARNING |
| `wroket-api-memory-high` | `3813343145813666779` | mem p95 > **85 %** pendant **10 min** | WARNING |
| `firestore-api-errors` | `7395269505368247320` | > **5** erreurs graves / 5 min (`unavailable`, `deadline_exceeded`, `internal`, `resource_exhausted`, `aborted`) | ERROR |
| `Todos drift detected` | `13398049412521343216` | `todos_drift_events` > 0 / 1 h | ERROR |
| `Firestore flush exhausted` | `8422222024565883659` | `persistence_flush_exhausted_events` > 0 / 1 h | ERROR |

### Désactivée (bruit)

| Politique | Raison |
|-----------|--------|
| `wroket-consumed-API` (`6405248621142152044`) | Déclenchait dès qu’un appel API Google dépassait ~0,05 req/s — quasi permanent en prod. Remplacée fonctionnellement par `firestore-api-errors` + uptime ready. |

YAML versionnés sous `infra/monitoring/alert-policy-*.yaml`.

## Budget billing (coût)

| Champ | Valeur |
|-------|--------|
| Display name | `Wroket prod monthly` |
| Budget id | `f6d3b04c-68e7-4b75-a3e8-c0fc8ced3048` |
| Montant | **15 EUR / mois** (compte `01AEE7-096FA9-3A56A3`) |
| Périmètre | projet `involuted-reach-490718-h4` uniquement |
| Seuils | 50 %, 90 %, 100 % (spend actuel) + 100 % forecasted |
| Notification | canal Monitoring → `team@wroket.com` (+ destinataires IAM billing par défaut) |

Descriptor : `infra/monitoring/billing-budget-wroket.yaml`.  
Ajuster le plafond : `gcloud billing budgets update f6d3b04c-68e7-4b75-a3e8-c0fc8ced3048 --billing-account=01AEE7-096FA9-3A56A3 --budget-amount=20EUR`.

---

*Dernière mise à jour : audit alertes GCP + budget mensuel 15 EUR.*
