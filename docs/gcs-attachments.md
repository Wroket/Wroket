# Pièces jointes — stockage Google Cloud Storage

Jusqu'ici, les pièces jointes étaient stockées sur le disque éphémère de Cloud
Run (`backend/uploads/`), ce qui causait deux bugs :

- **500 Internal Error à l'upload** : `appuser` (non-root) ne peut pas créer
  `/app/uploads/` dans l'image Docker (le dossier appartient à `root`).
- **Fichiers perdus au redéploiement** : le disque Cloud Run est remis à zéro
  à chaque révision / autoscaling à 0.

La solution est un bucket GCS dédié, non-public, accessible **uniquement** via
l'API (streaming authentifié). Voici la procédure one-shot pour le provisionner.

## 1. Créer le bucket

```bash
PROJECT_ID=involuted-reach-490718-h4
BUCKET=wroket-attachments
REGION=europe-west1

gcloud storage buckets create gs://$BUCKET \
  --project=$PROJECT_ID \
  --location=$REGION \
  --uniform-bucket-level-access \
  --public-access-prevention \
  --default-storage-class=STANDARD
```

- `--uniform-bucket-level-access` : interdit les ACL par objet (IAM uniquement,
  plus simple à auditer).
- `--public-access-prevention` : empêche définitivement tout partage public,
  même accidentel (un `allUsers` sur l'IAM sera refusé).

## 2. Donner accès au service account Cloud Run (et à lui seul)

```bash
SA=wroket-run@$PROJECT_ID.iam.gserviceaccount.com

gcloud storage buckets add-iam-policy-binding gs://$BUCKET \
  --member="serviceAccount:$SA" \
  --role="roles/storage.objectAdmin"
```

`objectAdmin` suffit (create/read/delete sur les objets ; pas d'accès aux
paramètres du bucket). **Ne jamais** accorder `roles/storage.admin` ni
`allUsers`/`allAuthenticatedUsers`.

## 3. Durée de rétention & soft-delete (recommandé)

```bash
# Soft-delete 7 jours — permet de restaurer un fichier supprimé par erreur.
gcloud storage buckets update gs://$BUCKET \
  --soft-delete-duration=7d

# Optionnel : bloquer l'objet pendant 1h après création (anti-écrasement).
# Désactivé par défaut pour garder les tests faciles.
```

## 4. Variables d'environnement Cloud Run

Appliquées automatiquement via `cloudbuild.yaml` :

- `ATTACHMENTS_BUCKET=wroket-attachments`
- `ATTACHMENTS_BACKEND=gcs`

Pour un redéploiement manuel :

```bash
gcloud run services update wroket-api \
  --region=europe-west1 \
  --update-env-vars ATTACHMENTS_BUCKET=wroket-attachments,ATTACHMENTS_BACKEND=gcs
```

## 5. Modèle de clé d'objet (isolation utilisateur)

Les clés sont **dérivées côté serveur** (jamais acceptées du client) :

```
attachments/<ownerUid>/<todoId>/<attachmentId><ext>
```

- `ownerUid` provient de `getTodoStoreOwnerId(todoId)` — le vrai propriétaire
  de la tâche, pas l'uploader (important pour les tâches déléguées).
- `attachmentId` est un UUID v4 fraîchement généré à chaque upload.
- L'upload utilise `ifGenerationMatch: 0` pour rejeter toute collision de clé.

Résultat : un utilisateur ne peut ni lire ni écraser un fichier d'un autre
utilisateur, même :

- en connaissant un `attachmentId` valide d'une autre tâche (la lookup est
  `(todoId, attachmentId)` tuple-based côté métadonnées) ;
- en forgeant un chemin GCS (les clés ne sont jamais passées côté client) ;
- en étant assigné à la tâche (l'uploader est autorisé à supprimer ses propres
  pièces jointes uniquement — check `attachment.userId === caller`).

Tests correspondants : `backend/src/services/attachmentService.test.ts`.

## 6. Nettoyage des lignes orphelines (migration one-shot)

Les pièces jointes antérieures à GCS ont leurs **métadonnées** dans Firestore
(`store/attachments`) mais le fichier réel a disparu avec le disque Cloud Run.
Un script dry-run les identifie et peut les purger :

```bash
# Dry-run (liste sans rien toucher)
cd backend && npm run cleanup:orphan-attachments

# Application (suppression des lignes métadata orphelines)
cd backend && npm run cleanup:orphan-attachments -- --apply
```

Le script ne supprime **jamais** d'objet GCS existant. Il ne touche qu'aux
lignes Firestore pointant vers des fichiers absents.
