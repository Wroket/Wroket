/**
 * Teams+ — Bot Framework / Adaptive Cards (parité Slack Lots 1–3 + Lot 4 PMO).
 *
 * ## Public cible
 *
 * **Tous les clients Wroket** (Small teams+) avec **Microsoft 365 / Teams** (org école ou entreprise).
 * Chaque client connecte **son** tenant Entra — pas réservé à l’org Wroket. Voir [chat-integrations-clients.md](./chat-integrations-clients.md).
 * Prérequis client : OAuth Wroket + installer l’app bot Wroket dans un canal Teams (manifest : `docs/assets/azure/teams-app/`).
 * Bot Azure prod : **multilocataire** (`MICROSOFT_TENANT_ID=common`), pas « Client unique » tenant Wroket seul.
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
 * Inbound replies: `POST /integrations/teams/interactions` acknowledges with 200 and
 * posts the user-visible reply via Bot Connector (`serviceUrl` + conversation id).
 * Do not rely on the HTTP response body for chat text.
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
 * Full checkbox list: [ops-chat-integrations.md](./ops-chat-integrations.md) §2.
 *
 * 1. Azure Portal → create / reuse Bot registration (App ID + password)
 * 2. Messaging endpoint: `https://api.wroket.com/integrations/teams/interactions`
 * 3. Bot type: **Multilocataire** (required for other customers; not Client unique)
 * 4. Canaux → Microsoft Teams activé
 * 5. Redirect URI: `https://api.wroket.com/integrations/teams/callback`
 * 6. Entra account types: multitenant org directories
 * 7. Distribute Teams app zip: `docs/assets/azure/wroket-teams-app.zip`
 * 8. Secret Manager + IAM for `wroket-run` (optional dedicated `TEAMS_BOT_*`)
 * 9. Redeploy `wroket-api` with secret **names** in `cloudbuild.yaml` only after secrets exist
 * 10. Settings → Connect Teams → add bot to a channel → Test
 * 11. Smoke: Adaptive Card button + `/wroket my-week`
 *
 * See also: [microsoft-azure.md](./microsoft-azure.md), [ops-chat-integrations.md](./ops-chat-integrations.md)
 */

export {};
