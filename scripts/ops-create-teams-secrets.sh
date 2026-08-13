#!/usr/bin/env bash
# Create TEAMS_BOT_* secrets in Secret Manager (aliases for Entra app used by Azure Bot).
# Run after: gcloud auth login && gcloud config set project involuted-reach-490718-h4
#
# Usage:
#   export TEAMS_BOT_APP_ID=e75f60be-547f-40fe-b910-5feb59a600bc
#   export TEAMS_BOT_APP_PASSWORD='<Entra client secret value>'
#   ./scripts/ops-create-teams-secrets.sh
#
# Then add to cloudbuild.yaml --set-secrets (full list) and push main.
# See docs/ops-chat-integrations.md

set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-involuted-reach-490718-h4}"
SA="wroket-run@${PROJECT}.iam.gserviceaccount.com"

if [[ -z "${TEAMS_BOT_APP_ID:-}" || -z "${TEAMS_BOT_APP_PASSWORD:-}" ]]; then
  echo "Set TEAMS_BOT_APP_ID and TEAMS_BOT_APP_PASSWORD env vars first." >&2
  exit 1
fi

create_or_add() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    echo -n "$value" | gcloud secrets versions add "$name" --project="$PROJECT" --data-file=-
  else
    gcloud secrets create "$name" --project="$PROJECT" --replication-policy=automatic
    echo -n "$value" | gcloud secrets versions add "$name" --project="$PROJECT" --data-file=-
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --project="$PROJECT" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet
}

create_or_add TEAMS_BOT_APP_ID "$TEAMS_BOT_APP_ID"
create_or_add TEAMS_BOT_APP_PASSWORD "$TEAMS_BOT_APP_PASSWORD"

echo "OK — TEAMS_BOT_* ready. Next: add to cloudbuild.yaml --set-secrets, then push main."
echo "Snippet to append (do not drop existing secrets):"
echo "  ,TEAMS_BOT_APP_ID=TEAMS_BOT_APP_ID:latest,TEAMS_BOT_APP_PASSWORD=TEAMS_BOT_APP_PASSWORD:latest"
