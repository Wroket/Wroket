#!/usr/bin/env bash
# Create GOOGLE_CHAT_* secrets after configuring Chat app in Google Cloud Console.
# Run after: gcloud auth login && gcloud config set project involuted-reach-490718-h4
#
# Usage:
#   export GOOGLE_CHAT_VERIFICATION_TOKEN='<from Chat app config>'
#   # Optional dedicated OAuth client (else API falls back to GOOGLE_CLIENT_*):
#   export GOOGLE_CHAT_CLIENT_ID='...'
#   export GOOGLE_CHAT_CLIENT_SECRET='...'
#   ./scripts/ops-create-google-chat-secrets.sh
#
# See docs/ops-chat-integrations.md §3

set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-involuted-reach-490718-h4}"
SA="wroket-run@${PROJECT}.iam.gserviceaccount.com"

if [[ -z "${GOOGLE_CHAT_VERIFICATION_TOKEN:-}" ]]; then
  echo "Set GOOGLE_CHAT_VERIFICATION_TOKEN (from Chat API app config)." >&2
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

create_or_add GOOGLE_CHAT_VERIFICATION_TOKEN "$GOOGLE_CHAT_VERIFICATION_TOKEN"

SNIPPET=",GOOGLE_CHAT_VERIFICATION_TOKEN=GOOGLE_CHAT_VERIFICATION_TOKEN:latest"

if [[ -n "${GOOGLE_CHAT_CLIENT_ID:-}" && -n "${GOOGLE_CHAT_CLIENT_SECRET:-}" ]]; then
  create_or_add GOOGLE_CHAT_CLIENT_ID "$GOOGLE_CHAT_CLIENT_ID"
  create_or_add GOOGLE_CHAT_CLIENT_SECRET "$GOOGLE_CHAT_CLIENT_SECRET"
  SNIPPET+=",GOOGLE_CHAT_CLIENT_ID=GOOGLE_CHAT_CLIENT_ID:latest,GOOGLE_CHAT_CLIENT_SECRET=GOOGLE_CHAT_CLIENT_SECRET:latest"
fi

echo "OK — Google Chat secrets ready. Append to cloudbuild.yaml --set-secrets:"
echo "  $SNIPPET"
echo "Then push main. Smoke with a Google Workspace account."
