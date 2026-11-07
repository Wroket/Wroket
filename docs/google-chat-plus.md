/**
 * Google Chat+ — Chat API app + cards v2 (parité Slack+ / Teams+).
 *
 * ## Public cible
 *
 * **Tous les clients Wroket** (Small teams+) avec **Google Workspace** (domaine org).
 * Pas Gmail consumer seul. App Chat Wroket partagée (SaaS). Voir [chat-integrations-clients.md](./chat-integrations-clients.md).
 *
 * ## Webhook vs App
 *
 * Incoming space webhook remains a fallback. Prefer OAuth connection in
 * Settings → Connexions → Google Chat for cards with actions.
 *
 * ## Endpoints
 *
 * - `GET /integrations/google-chat/connect|callback|status`
 * - `POST /integrations/google-chat/test` · `DELETE .../connection`
 * - `GET|POST /integrations/google-chat/interactions` — Chat events (OIDC Bearer and/or classic token).
 *   Workspace add-on apps send add-on envelopes (`chat.messagePayload`) and require `DataActions` replies.
 *
 * ## Identity
 *
 * Google Workspace email on the event → `resolveUserFromChatEmail`.
 *
 * ## Commands
 *
 * `@Wroket help|tasks|my-week|overdue|team-risk|open|accept|decline|complete`
 * (same `pmoDigestService` as Slack Lot 4).
 *
 * ## Auth inbound (Workspace add-on)
 *
 * Console add-on mode does **not** show a Verification Token. Google sends a
 * Google-signed OIDC ID token (`Authorization: Bearer …` and/or
 * `authorizationEventObject.systemIdToken`) with:
 * - `aud` = configured HTTP endpoint
 * - `email` = `service-PROJECT_NUMBER@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`
 * Verifier: `googleChatSignature.ts`. Optional classic `GOOGLE_CHAT_VERIFICATION_TOKEN` still supported.
 * Add-on replies must use `hostAppDataAction.chatDataAction.createMessageAction` (not bare `{ text }`).
 *
 * ## Env / secrets (never commit secrets)
 *
 * - Plain env: `GOOGLE_CHAT_PROJECT_NUMBER`, `GOOGLE_CHAT_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_CHAT_HTTP_ENDPOINT`
 * - `GOOGLE_CHAT_CLIENT_ID` / `GOOGLE_CHAT_CLIENT_SECRET` (fallback: `GOOGLE_CLIENT_*`)
 * - `GOOGLE_CHAT_REDIRECT_URI` — `https://api.wroket.com/integrations/google-chat/callback`
 * - Optional: `GOOGLE_CHAT_VERIFICATION_TOKEN` (classic non–add-on apps only)
 *
 * ## Owner ops checklist
 *
 * Full checkbox list: [ops-chat-integrations.md](./ops-chat-integrations.md) §3.
 *
 * 1. Google Cloud Console → enable Google Chat API → configure Chat app (Workspace add-on)
 * 2. Set HTTP endpoint URL to `https://api.wroket.com/integrations/google-chat/interactions`
 * 3. Note Service account email + project number → plain Cloud Run env (OIDC verify)
 * 4. OAuth client + redirect URI `https://api.wroket.com/integrations/google-chat/callback`
 * 5. Scopes: openid email profile + chat.spaces + chat.messages + chat.memberships.app
 *    (`memberships.app` lets Connect / space select add the Chat app as space member for inbound)
 * 6. Deploy env via `cloudbuild.yaml` (no Chat secret required for add-on OIDC)
 * 7. Settings → Connect (or Reconnect after scope change) → choose space → app auto-added → Test
 * 8. Smoke: card click + `@Wroket overdue`
 */

export {};
