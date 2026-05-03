# Cloud Run Ops — cohérence des données et multi-instance

## Contexte

Le backend `wroket-api` utilise un cache RAM (`cachedStore` dans `backend/src/persistence.ts`) chargé **une seule fois** au démarrage via Firestore. Toutes les lectures API passent par cette RAM ; les écritures y sont appliquées immédiatement, puis persistées vers Firestore en débounce (500 ms).

En cas de **plusieurs replicas Cloud Run simultanés**, chaque instance a sa propre RAM : une écriture sur le replica A met à jour sa RAM et Firestore, mais le replica B reste **stale jusqu'à son prochain démarrage** → divergence cross-device.

## Solution court terme (kill switch)

Forcer un seul replica actif :

```bash
gcloud run services update wroket-api \
  --region=europe-west1 \
  --max-instances=1
```

Vérification :

```bash
gcloud run services describe wroket-api --region=europe-west1 \
  --format="value(spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'])"
# doit retourner 1
```

**Effet** : toutes les requêtes atterrissent sur le même processus → même `cachedStore` → plus de divergence.  
**Limite** : si le trafic augmente, on bute sur la limite. À relever après validation de la solution permanente (voir ci-dessous).

## Solution permanente (Firestore onSnapshot)

Depuis la version incluant `attachLiveInvalidation` dans `backend/src/persistence.ts`, chaque replica s'abonne aux documents Firestore via `onSnapshot`. Quand un autre replica écrit, le snapshot arrive dans la seconde et met à jour la RAM locale — sans redémarrage.

Séquence :

```
Replica A écrit store/notes     → Firestore snapshot → Replica B reçoit
                                                        → _applyDomainSnapshot("notes", data)
                                                        → cachedStore.notes = data (moins de 2 s)
```

### Logs à surveiller dans Cloud Logging

```jsonl
{ "event": "store.invalidation.attached", "listenerCount": 144 }
{ "event": "store.invalidation.received",  "domain": "notes", "ts": 1746263... }
{ "event": "store.invalidation.received",  "shard": "todos_7", "ts": 1746263... }
{ "event": "store.invalidation.error",     "domain": "notes",  "error": "..." }
```

### Relever max-instances après validation

Une fois que les logs `store.invalidation.received` confirment que les replicas se synchronisent :

```bash
gcloud run services update wroket-api \
  --region=europe-west1 \
  --max-instances=3
```

## Variables d'environnement concernées

| Variable | Valeur | Effet |
|---|---|---|
| `USE_LOCAL_STORE` | `"true"` | Désactive Firestore ET les listeners live (dev local) |
| `GOOGLE_CLOUD_PROJECT` | `involuted-reach-490718-h4` | Projet GCP ciblé |

## Rollback

Si les listeners posent problème (ex. surcharge Firestore), revenir à `max-instances=1` suffit comme palliatif immédiat. Les listeners peuvent être désactivés sans redéployment en ajoutant une variable d'env `STORE_LIVE_INVALIDATION=0` si ce guard est implémenté à terme.

## Vérification post-déploiement (checklist obligatoire)

1. Ouvrir Chrome desktop et Chrome Android, connectés au même compte.
2. Sur le mobile, modifier le statut d'une tâche (ex. la marquer "complétée").
3. Sur le desktop (sans F5) : la tâche doit passer à "complétée" en moins de 5 secondes.
4. Dans Cloud Logging (filtrer `wroket-api`) : chercher `"store.invalidation.received"` avec le bon `domain` ou `shard`.
5. Si le log n'apparaît pas et que les deux replicas sont actifs : vérifier que `attachLiveInvalidation` a bien été appelé (`"store.invalidation.attached"` présent au démarrage).
