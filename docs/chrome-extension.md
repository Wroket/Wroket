# Chrome extension — Wroket clipper

Capture a web page or selection into a **Wroket task or note**, with project / deadline / priority and a stored `source` URL. Not a mini-app, not Gmail day-1.

## Contract

| Piece | Detail |
|-------|--------|
| Auth | `chrome.identity.launchWebAuthFlow` → `https://wroket.com/extension/connect` (session cookie) → one-shot PKCE code → `POST /auth/extension/token` → Bearer `wrk_live_…` with `kind: extension` |
| API | `GET /ext/v1/bootstrap`, `POST /ext/v1/capture` (Bearer, not MCP, not cookie REST) |
| Scopes | `todos:read/write`, `notes:read/write`, `projects:read` (no `calendar:write` in v1) |
| Quota keys | Extension keys **excluded** from Free MCP key limit; max **3** browsers / user |
| Source | `{ url, title?, excerpt?, via: "chrome_ext" }` on Todo / Note |
| Permissions | `identity`, `storage`, `activeTab`, `scripting`, `contextMenus`, `host_permissions: https://api.wroket.com/*` only |

**Forbidden:** cookie + CORS `chrome-extension://`, pasting MCP keys in the popup, `chrome.identity.getAuthToken` (Google), Gmail / `<all_urls>` / side panel in v1.

## User flow

1. Install (Chrome Web Store **unlisted**, then public).
2. Popup → **Connect** → consent on `/extension/connect` → token stored in `chrome.storage.local`.
3. Context menu / shortcut / popup → capture task (default) or note → open / **Schedule** deep link.
4. Settings → Integrations → **Browsers** to revoke a device.

## Registration / Store checklist (ops)

| Step | Owner action |
|------|----------------|
| Developer account | Chrome Web Store Dashboard — `team@wroket.com`, 2FA, one-shot fee |
| Item | **Add new item** → zip → onglet **Distribution** → Visibility = **Unlisted** (pas un bouton « Create Unlisted ») → Submit for review ; fige l’ID |
| Stable ID (dev) | Optional `manifest.key` from PEM kept **out of git** (local/CI secret) so unpacked ID matches Store |
| Redirect allowlist | Backend accepts only `https://*.chromiumapp.org/*` (already enforced) |
| Privacy | Section **Chrome extension** live on `https://wroket.com/privacy` **before** submit |
| Listing copy | Single purpose: “Capture web pages into Wroket tasks/notes”; Productivity; FR+EN screenshots |
| Permissions justifications | Each MV3 permission explained in CWS form |
| Rollout | Unlisted → smoke (Free / Small / admin / quota / revoked) → Public |

## KPI J+30 (gate v1.5)

Define at go-live (example): captures / week / connected user. If green: undo, assign, offline queue, optional `calendar:write`. If red: freeze (no Gmail).

## Local build

```bash
cd extensions/chrome
npm ci
npm run build
# Load unpacked: extensions/chrome/dist
```

## Smoke (manual)

1. Connect via popup → browser listed in Settings.
2. Capture selection → task with Source link in task edit.
3. Capture note → Source on note.
4. Free quota 402 → actionable message.
5. Revoke browser → 401 → reconnect.
