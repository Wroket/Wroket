# Firestore backups (project `involuted-reach-490718-h4`)

Cold-storage exports of the production Firestore database, kept in
`gs://wroket-firestore-backups/` (multi-region `eu`, storage class
`COLDLINE`).

The bucket is required to be in `eu` or `europe-west9` to match the
Firestore database location. `europe-west1` is **rejected** by
`gcloud firestore export` (run into this on the first attempt).

## Create the bucket (one-shot)

```powershell
gcloud storage buckets create gs://wroket-firestore-backups `
  --project=involuted-reach-490718-h4 `
  --location=eu `
  --default-storage-class=COLDLINE `
  --uniform-bucket-level-access
```

## Take a backup

```powershell
$ts = Get-Date -Format "yyyy-MM-dd-HHmmss"
gcloud firestore export gs://wroket-firestore-backups/pre-shard-cleanup-$ts `
  --project=involuted-reach-490718-h4 `
  --async
```

`--async` returns immediately with the operation id. Track it with:

```powershell
gcloud firestore operations list --project=involuted-reach-490718-h4 --limit=3 --format=json
```

A full backup of the current database (~300 documents) takes ~25 s.

## Restore from a backup

```powershell
gcloud firestore import gs://wroket-firestore-backups/<export-prefix> `
  --project=involuted-reach-490718-h4
```

Restore overwrites existing documents with the snapshotted version
(deleted documents are restored, updated documents are reverted). It
does NOT clear the database first — documents present today but absent
in the backup remain untouched.

## Existing backups

| Prefix | Date | Reason |
|---|---|---|
| `gs://wroket-firestore-export-eu/wroket/restore-bridge-20260501-1725` | 2026-05-01 | Pre-cutover restore bridge |
| `gs://wroket-firestore-backups/pre-shard-cleanup-2026-05-26-071042` | 2026-05-26 | Pre-deletion of legacy `store/todos_*` shards |

## Notification channel role binding

If `gcloud firestore export` fails with a permission error on the
bucket, the Firestore service agent needs `roles/storage.admin` on it.
With uniform-bucket-level-access enabled, the agent inherits from the
project-level role automatically (which is why we did not need a
dedicated IAM binding for this run). If a future export fails:

```powershell
gcloud storage buckets add-iam-policy-binding gs://wroket-firestore-backups `
  --member="serviceAccount:service-846885741813@gcp-sa-firestore.iam.gserviceaccount.com" `
  --role=roles/storage.admin
```
