/**
 * Slack+ — Incoming Webhooks (Lot 1), OAuth (Lot 2), Actions (Lot 3).
 *
 * ## Public cible
 *
 * **Tous les clients Wroket** (Small teams+) avec **leur propre workspace Slack**.
 * App Slack Wroket distribuée (SaaS) — le client n’enregistre pas d’app Slack. Voir [chat-integrations-clients.md](./chat-integrations-clients.md).
 *
 * ## Incoming Webhook vs OAuth
 *
 * | | Incoming Webhook | OAuth (`chat.postMessage`) |
 * |---|------------------|----------------------------|
 * | Setup | Paste a Slack “Incoming Webhooks” URL in Settings → Webhooks | Connect Slack app in Settings → Connexions |
 * | Channel | Fixed when the URL is created | Chosen at install (`incoming-webhook` scope) |
 * | Delivery health | Per-webhook badges (OK / error / backoff) | Same path when a Slack webhook prefers OAuth |
 * | Lot 3 actions | Not supported | Buttons + slash `/wroket` |
 *
 * Soft preference: if a user has a Slack OAuth connection with a channel, Slack platform
 * webhooks and Slack delivery-channel prefs post via `chat.postMessage` first, then fall
 * back to the Incoming Webhook URL.
 *
 * ## Delivery health (Lot 1)
 *
 * Each webhook config stores `lastDeliveryAt`, `lastStatus`, `lastStatusCode`, `lastError`,
 * `consecutiveFailures`, and optional `backoffUntil`. After 3 consecutive failures, dispatch
 * skips the webhook for an exponential backoff window (5m → 60m max), mainly for 429/5xx.
 *
 * ## Filters
 *
 * Optional `projectIds` / `teamIds` on a webhook. Empty = all. Notifications that carry a
 * `projectId` / `teamId` are filtered; events without those ids still pass (avoids dropping
 * global events).
 *
 * ## PMO events
 *
 * - `dependency_blocked` — complete refused while blockers are active (once per day per task)
 * - `milestone_due_soon` — project milestone within 24h
 * - `project_at_risk` — ≥3 overdue active tasks in a project
 *
 * ## Lot 3 — Actions depuis Slack
 *
 * ### Endpoints (HMAC `SLACK_SIGNING_SECRET`)
 *
 * - `POST /integrations/slack/interactions` — boutons Block Kit
 * - `POST /integrations/slack/commands` — slash `/wroket`
 *
 * Configure in the Slack App (Interactivity Request URL + Slash Command Request URL).
 * Local needs a public tunnel (ngrok, Cloudflare Tunnel, etc.).
 *
 * ### Identity
 *
 * The Slack clicker/slash author is mapped via `users.info` → email → Wroket `findUserByEmail`.
 * Button `value` embeds `todoId|targetUid`; the clicker's Wroket uid must equal `targetUid`.
 * Mismatch or unknown email → ephemeral error, no mutation.
 *
 * ### Buttons (OAuth messages only)
 *
 * - `task_assigned` (pending): Accepter / Refuser (+ Terminer)
 * - Deadlines / related: Terminer when `todoId` is present
 *
 * After a successful click, the original message is updated (actions stripped + result context).
 *
 * ### Slash `/wroket`
 *
 * - `help` — aide
 * - `tasks` — jusqu’à 10 tâches personnelles actives + 10 assignées à vous
 * - `my-week` — Ma semaine (retards + échéances/créneaux sous 7 jours)
 * - `overdue` — tâches actives en retard
 * - `team-risk` — projets d’équipe at-risk / overdue (membre d’équipe requis)
 * - `open <todoId>` — détail + deep link
 * - `accept|decline|complete <todoId>` — mêmes règles métier que les boutons
 *
 * Replies are ephemeral.
 *
 * ### Scopes bot (re-install after change)
 *
 * `chat:write`, `channels:read`, `groups:read`, `incoming-webhook`, `users:read`, `users:read.email`
 *
 * ## Secrets (never commit)
 *
 * Local `.env` / Cloud Run Secret Manager:
 *
 * - `SLACK_CLIENT_ID`
 * - `SLACK_CLIENT_SECRET`
 * - `SLACK_REDIRECT_URI` (e.g. `https://api.wroket.com/integrations/slack/callback`)
 * - `SLACK_SIGNING_SECRET` — required for Lot 3 inbound; prefer Signing Secret over Verification Token
 *
 * Add `SLACK_CLIENT_*` / `SLACK_SIGNING_SECRET` to Cloud Run `--set-secrets` only after the secrets exist
 * in Secret Manager (otherwise deploy fails).
 *
 * ## Owner ops checklist (prod)
 *
 * Full checkbox list: [ops-chat-integrations.md](./ops-chat-integrations.md) §1.
 *
 * 1. Slack App → Redirect `https://api.wroket.com/integrations/slack/callback`
 * 2. Scopes bot (ci-dessus) ; re-install / Reconnecter Wroket after change
 * 3. Interactivity URL → `/integrations/slack/interactions`
 * 4. Slash `/wroket` → `/integrations/slack/commands`
 * 5. Manage Distribution → not Internal-only
 * 6. Smoke: Connect + test + buttons + `/wroket my-week`
 */

export {};
