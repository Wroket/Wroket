/**
 * Teams+ — Bot Framework / Adaptive Cards (parité Slack Lots 1–3 + Lot 4 PMO).
 *
 * ## Incoming Webhook vs Bot
 *
 * | | Incoming Webhook | Bot / OAuth |
 * |---|------------------|-------------|
 * | Setup | Connectors URL in Settings → Webhooks | Connect Teams in Settings → Connexions |
 * | Actions | OpenUrl only | Action.Submit accept/decline/complete |
 * | Commands | No | `/wroket` style text to the bot |
 *
 * Soft preference: if a Teams connection has `conversationId` + `serviceUrl`, outbound
 * webhooks prefer Bot Connector posts with interactive Adaptive Cards, then fall back
 * to Incoming Webhook URL.
 *
 * ## Endpoints
 *
 * - `GET /integrations/teams/connect` — Entra authorize
 * - `GET /integrations/teams/callback`
 * - `GET /integrations/teams/status` · `POST /test` · `DELETE /connection`
 * - `POST /integrations/teams/interactions` — Bot Framework messaging (JWT)
 *
 * ## Identity
 *
 * AAD email (Graph /me or activity) → `resolveUserFromChatEmail` → Wroket user.
 *
 * ## Commands
 *
 * Same verbs as Slack Lot 4 via `pmoDigestService` / `chatChannel.handleSlashText`:
 * help, tasks, my-week, overdue, team-risk, open, accept, decline, complete.
 *
 * ## Secrets (never commit)
 *
 * - `TEAMS_BOT_APP_ID` (or `MICROSOFT_BOT_APP_ID` / `MICROSOFT_CLIENT_ID`)
 * - `TEAMS_BOT_APP_PASSWORD` (or `MICROSOFT_BOT_APP_PASSWORD` / `MICROSOFT_CLIENT_SECRET`)
 * - `TEAMS_REDIRECT_URI` (plain env) e.g. `https://api.wroket.com/integrations/teams/callback`
 *
 * Add bot secrets to Cloud Run `--set-secrets` only after they exist in Secret Manager.
 *
 * ## Owner ops checklist
 *
 * 1. Azure Portal → create / reuse Bot registration (App ID + password)
 * 2. Messaging endpoint: `https://api.wroket.com/integrations/teams/interactions`
 * 3. Redirect URI for OAuth connect (above)
 * 4. Create Secret Manager secrets + IAM for `wroket-run`
 * 5. Redeploy `wroket-api` with secret **names** in `cloudbuild.yaml`
 * 6. Settings → Connect Teams → add bot to a channel → Test
 * 7. Smoke: Adaptive Card button + `/wroket my-week`
 *
 * See also: [microsoft-azure.md](./microsoft-azure.md)
 */

export {};
