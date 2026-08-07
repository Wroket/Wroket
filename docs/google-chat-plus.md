/**
 * Google Chat+ — Chat API app + cards v2 (parité Slack+ / Teams+).
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
 * - `POST /integrations/google-chat/interactions` — Chat events (verification token)
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
 * ## Secrets (never commit)
 *
 * - `GOOGLE_CHAT_CLIENT_ID` / `GOOGLE_CHAT_CLIENT_SECRET` (fallback: `GOOGLE_CLIENT_*`)
 * - `GOOGLE_CHAT_REDIRECT_URI` — `https://api.wroket.com/integrations/google-chat/callback`
 * - `GOOGLE_CHAT_VERIFICATION_TOKEN` — Chat app verification token
 *
 * ## Owner ops checklist
 *
 * 1. Google Cloud Console → enable Google Chat API → configure Chat app
 * 2. Set HTTP endpoint URL to `https://api.wroket.com/integrations/google-chat/interactions`
 * 3. Copy Verification Token → Secret Manager
 * 4. OAuth client + redirect URI; scopes chat.spaces + chat.messages + email
 * 5. Mount secrets on Cloud Run (`cloudbuild.yaml` names only)
 * 6. Settings → Connect → add app to a space → Test
 * 7. Smoke: card click + `@Wroket overdue`
 */

export {};
