# Monitoring Wroket (API)

Ce document complète les actions manuelles dans la console GCP (alertes, uptime). Il décrit les **endpoints de santé** exposés par `wroket-api` et comment les utiliser pour le monitoring.

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

## Recommandations GCP

1. **Uptime check principal** : `GET /health` toutes les 1–5 min — détecte les arrêts complets du service.
2. **Uptime check secondaire (optionnel)** : `GET /health/ready` avec fréquence moindre (ex. 5 min) — détecte les pannes Firestore ou mauvaise config IAM.
3. **Alertes Cloud Monitoring** : sur les métriques Cloud Run (erreurs 5xx, latence) pour `wroket-api` ; sur les métriques Firestore (erreurs, quota) si configurées.

## À compléter (manuel)

Renseigne ici les noms et seuils **réels** de tes politiques d’alerte pour l’équipe :

- Politique alerte 5xx `wroket-api` : …
- Politique latence p95 : …
- Politique Firestore : …
- Canaux de notification : …

---

*Dernière mise à jour : alignée sur le code backend (`healthRoutes`, `healthService`, `pingDatastore` dans `persistence`).*
