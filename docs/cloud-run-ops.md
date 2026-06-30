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
| `TODOS_STORAGE_MODE` | `v2` | Todos en collection `todos_v2` (prod) |
| `TODOS_READ_SOURCE` | `firestore` (défaut), `ram`, `shadow` | Source des listes cross-user/projet ; `shadow` logue `todo_read_drift` sans changer la réponse |
| `TODOS_BOOT_HYDRATION` | `lazy` (défaut), `full` | `lazy` = pas de scan collection au boot ; chargement owner à la première requête |

## Sync todos multi-instance (v2)

Les lectures **assignées** (`listAssignedToMe`) et **projet** (`listProjectTodos`) interrogent Firestore directement, puis fusionnent le cache RAM. Le listener `todos_v2.invalidation.received` garde le cache chaud entre requêtes.

### Index Firestore requis

Déployer [`firestore.indexes.json`](../firestore.indexes.json) avant le code :

```bash
# Bash / Linux — une ligne par index ; ajouter --async pour ne pas bloquer
gcloud firestore indexes composite create --project=involuted-reach-490718-h4 \
  --collection-group=todos_v2 --query-scope=collection \
  --field-config=field-path=assignedTo,order=ascending \
  --field-config=field-path=status,order=ascending --async

gcloud firestore indexes composite create --project=involuted-reach-490718-h4 \
  --collection-group=todos_v2 --query-scope=collection \
  --field-config=field-path=projectId,order=ascending \
  --field-config=field-path=createdAt,order=descending --async
```

**PowerShell** : quoter chaque `--field-config` → voir [`reliability-remediation-plan.md`](reliability-remediation-plan.md).

(`--file` n'est pas supporté par `gcloud` ; [`firestore.indexes.json`](../firestore.indexes.json) = référence / Firebase CLI.)

### Checklist multi-instance (obligatoire avant `max-instances` > 1)

1. **Assignation** : user A crée une tâche et l'assigne à user B → B voit la tâche dans « Assignées » sans F5 (tester idéalement depuis 2 sessions / cold start d'une 2e instance).
2. **Projet équipe** : tâche créée par A visible dans le Kanban projet chez B (membre équipe).
3. **Cold start** : forcer une nouvelle instance (`gcloud run services update wroket-api --max-instances=2` + trafic) → première requête `GET /todos/assigned` OK pour un compte avec assignations existantes.
4. **Logs** : `todos_v2.invalidation.received` après mutation ; pas de `todos_v2.query.index_missing`.
5. **Shadow (optionnel)** : `TODOS_READ_SOURCE=shadow` 7 j → aucun `todo_read_drift` significatif dans Cloud Logging.

### Logs todos_v2

```jsonl
{ "event": "todos_v2.invalidation.received", "added": 1, "modified": 0, "removed": 0 }
{ "event": "todos_v2.invalidation.error", "attempt": 1 }
{ "event": "todos_v2.invalidation.reconnect_scheduled", "delayMs": 1000, "attempt": 1 }
{ "event": "todo_read_drift", "scope": "listAssignedToMe", "onlyFirestore": ["..."], "onlyRam": [] }
```

## Rollback

Si les listeners posent problème (ex. surcharge Firestore), revenir à `max-instances=1` suffit comme palliatif immédiat. Les listeners peuvent être désactivés sans redéployment en ajoutant une variable d'env `STORE_LIVE_INVALIDATION=0` si ce guard est implémenté à terme.

## Vérification post-déploiement (checklist obligatoire)

1. Ouvrir Chrome desktop et Chrome Android, connectés au même compte.
2. Sur le mobile, modifier le statut d'une tâche (ex. la marquer "complétée").
3. Sur le desktop (sans F5) : la tâche doit passer à "complétée" en moins de 5 secondes.
4. Dans Cloud Logging (filtrer `wroket-api`) : chercher `"store.invalidation.received"` avec le bon `domain` ou `shard`.
5. Si le log n'apparaît pas et que les deux replicas sont actifs : vérifier que `attachLiveInvalidation` a bien été appelé (`"store.invalidation.attached"` présent au démarrage).
