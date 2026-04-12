# P0 — Volet 1 : Monitoring (GCP & observabilité)

Objectif : alertes sur erreurs, latence et usage Firestore ; documentation dans le dépôt ; optionnellement health check « profond ».

---

## 1. Alertes Cloud Monitoring (Console GCP)

| Qui | Actions |
|-----|---------|
| **Toi (humain)** | Ouvre [Google Cloud Console](https://console.cloud.google.com) → projet **involuted-reach-490718-h4** (Wroket). |
| **Toi** | **Monitoring** → **Alerting** → **Create policy**. Crée au minimum : |
| | • **Cloud Run** `wroket-api` : condition sur **requêtes 5xx** (taux ou count) sur une fenêtre (ex. 5 min) avec seuil adapté (ex. > 0 ou > N/min). |
| | • **Cloud Run** `wroket-web` : idem pour les erreurs client/serveur si pertinent. |
| | • **Latence** : p95 ou p99 request latency sur chaque service, seuil à calibrer (ex. > 2–5 s selon ton SLO). |
| **Toi** | **Firestore** : dans Monitoring, cherche les métriques **firestore.googleapis.com** (document reads/writes, errors). Ajoute une alerte si **erreurs** ou si tu veux un warning sur pic d’usage proche des quotas Free Tier. |
| **Toi** | Configure un **notification channel** (email, PagerDuty, Slack webhook GCP, etc.) pour chaque politique. |
| **Toi** | Nomme les politiques de façon lisible : ex. `wroket-api-5xx`, `wroket-api-latency-p95`. |

| Qui | Actions |
|-----|---------|
| **Assistant (code / repo)** | Crée ou met à jour [`docs/monitoring.md`](../monitoring.md) (voir volet 1 section 2) avec la liste des alertes, seuils, liens vers la console. |
| **Assistant** | Optionnel : endpoint ou paramètre health « profond » (section 3). |

---

## 2. Documentation dans le dépôt

| Qui | Actions |
|-----|---------|
| **Assistant** | Rédige [`docs/monitoring.md`](../monitoring.md) : objectif, liste des alertes (nom GCP + description), seuils indicatifs, comment les modifier, lien vers Cloud Monitoring. |
| **Toi** | Relis le fichier après merge ; complète avec **emails / canaux** réellement configurés si tu ne veux pas les versionner. |
| **Toi** | Garde une trace hors repo (notion interne) des **contacts on-call** si besoin. |

---

## 3. Uptime check (recommandé)

| Qui | Actions |
|-----|---------|
| **Toi** | **Monitoring** → **Uptime checks** → Create. URL : `https://api.wroket.com/health` (GET), fréquence raisonnable (1–5 min), régions adaptées. |
| **Toi** | Option : second check sur `https://wroket.com` (page d’accueil) pour le frontend. |
| **Assistant** | Aucune modification code obligatoire : [`GET /health`](../../backend/src/routes/healthRoutes.ts) existe déjà. |

---

## 4. Health check « readiness » (implémenté côté code)

| Qui | Actions |
|-----|---------|
| **Assistant** | Route **`GET /health/ready`** : ping Firestore via lecture `store/users` ; HTTP **503** si datastore inaccessible. Voir [`docs/monitoring.md`](../monitoring.md). |
| **Toi** | Optionnel : second **uptime check** GCP pointant vers `https://api.wroket.com/health/ready` (fréquence modérée pour limiter les lectures Firestore). Le check principal peut rester sur **`/health`** (sans coût Firestore). |

---

## 5. Synthèse des responsabilités

| Livrable | Toi | Assistant |
|----------|-----|-----------|
| Politiques d’alerte Cloud Run + Firestore | Création et réglage dans GCP | — |
| Canaux de notification | Configuration GCP | — |
| Uptime checks | Configuration GCP | — |
| `docs/monitoring.md` | Validation / complément | Rédaction + endpoints `/health` et `/health/ready` |
| Readiness Firestore (`/health/ready`) | Optionnel : uptime check GCP sur cette URL | Implémenté (`pingDatastore`) |

---

## Checklist de fin de volet

- [X] Au moins une alerte **5xx** et une **latence** sur `wroket-api` (et idéalement `wroket-web`).
- [X] Alerte ou veille **Firestore** documentée.
- [X] **Notification** testée (bouton « test » ou incident forcé en staging si possible).
- [x] **`docs/monitoring.md`** à jour dans le repo.
- [ ] **Uptime check** sur `/health` (recommandé) ; optionnel second sur `/health/ready`.
