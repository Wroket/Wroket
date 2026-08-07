/**
 * Discord+ — Application + Bot + Interactions HTTP (parité Slack+).
 *
 * ## Webhook vs Bot
 *
 * Channel Incoming Webhook = fallback. Bot OAuth + Interactions = actions + slash.
 *
 * ## Endpoints
 *
 * - `GET /integrations/discord/connect|callback|status`
 * - `POST /integrations/discord/test` · `DELETE .../connection`
 * - `POST /integrations/discord/link` · `DELETE .../link` — manual Discord user id ↔ Wroket
 * - `POST /integrations/discord/interactions` — Ed25519 signed (raw body)
 *
 * ## Identity
 *
 * 1. Discord OAuth email → `resolveUserFromChatEmail`
 * 2. Else manual link (`discordAccountLinks` store) from Settings
 *
 * ## Commands
 *
 * Slash `/wroket` with text option, or registered command name `wroket`.
 * Verbs: help, tasks, my-week, overdue, team-risk, open, accept, decline, complete.
 *
 * ## Secrets (never commit)
 *
 * - `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`
 * - `DISCORD_PUBLIC_KEY` — Interactions public key (hex)
 * - `DISCORD_BOT_TOKEN` — Bot token for channel posts
 * - `DISCORD_REDIRECT_URI` — `https://api.wroket.com/integrations/discord/callback`
 *
 * ## Owner ops checklist
 *
 * 1. Discord Developer Portal → New Application → Bot + OAuth2
 * 2. Interactions Endpoint URL: `https://api.wroket.com/integrations/discord/interactions`
 * 3. Copy Public Key → Secret Manager `DISCORD_PUBLIC_KEY`
 * 4. Bot token → `DISCORD_BOT_TOKEN`; Client ID/Secret → secrets
 * 5. Register slash command `wroket` (option `text` string) via Discord API
 * 6. Mount secrets on Cloud Run; set redirect URI env
 * 7. Settings → Connect Discord → optional Link user ID → Test
 * 8. Smoke: button custom_id + `/wroket my-week`
 */

export {};
