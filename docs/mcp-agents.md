# Connect your agent — Wroket MCP server

Wroket acts as a **remote MCP server** so Cursor, Claude Desktop, or any compatible agent can act on tasks, projects, notes, and comments. There is **no hosted LLM inside Wroket**; you use the AI you already pay for.

## Prerequisites

1. A Wroket account with product access (seat / not workspace-admin-only).
2. An API key from **Settings → Intégrations → Connecter votre agent**.

## Create and revoke keys

1. Open Settings → Integrations → **Connect your agent**.
2. Enter a label (e.g. “Cursor laptop”) and create the key.
3. **Copy the secret immediately** — it is shown once (`wrk_live_…`).
4. Revoke a key anytime; MCP calls with that secret fail immediately.

### Limits

| Plan | Active keys |
|------|-------------|
| Free | 1 |
| Small teams+ / early bird | up to 5 |

Secrets are stored as **SHA-256 hashes** only.

### Scopes

| Scope | Access |
|-------|--------|
| `todos:read` | list/get todos, list comments |
| `todos:write` | create/update/move todos, add comments |
| `projects:read` | list/get projects, list phases |
| `notes:read` | list/get notes |
| `notes:write` | create/update notes |
| `calendar:write` | propose / book / clear task slots |

New keys receive **all** scopes by default. Existing keys keep their stored scope list; if empty/missing at auth time they are treated as full access for compatibility.

## Endpoint

- Production: `https://api.wroket.com/mcp`
- Local: `{API_BASE_URL}/mcp` (same base as the web app API)

Auth header on every request:

```http
Authorization: Bearer wrk_live_…
```

Rate limit: **60 requests / minute / key**.

## Cursor (`mcp.json`)

```json
{
  "mcpServers": {
    "wroket": {
      "url": "https://api.wroket.com/mcp",
      "headers": {
        "Authorization": "Bearer wrk_live_YOUR_KEY"
      }
    }
  }
}
```

## Claude Desktop

Same JSON shape under Claude’s MCP servers config (URL + `Authorization` header). Prefer the snippet from Settings after creating a key.

## Tools (v1.1)

| Tool | Scope | Purpose |
|------|--------|---------|
| `list_todos` | `todos:read` | List tasks (`status`, `limit`) |
| `get_todo` | `todos:read` | Fetch one task by `id` |
| `create_todo` | `todos:write` | Create (`title`; optional priority, effort, dates, projectId, phaseId, parentId, tags) |
| `update_todo` | `todos:write` | Patch fields including project/phase/parent/tags |
| `move_todo` | `todos:write` | Move to phase (`strategy` for date/slot mismatches) |
| `list_projects` | `projects:read` | List accessible projects |
| `get_project` | `projects:read` | Project + phases summary |
| `list_project_phases` | `projects:read` | Phases for a `projectId` |
| `list_notes` | `notes:read` | List notes (optional `todoId`) |
| `get_note` | `notes:read` | Full note content |
| `create_note` | `notes:write` | Create note (optional todo/project link) |
| `update_note` | `notes:write` | Update note |
| `list_comments` | `todos:read` | Comments on a task |
| `add_comment` | `todos:write` | Add a comment |
| `propose_slots` | `calendar:write` | Suggest available slots for a task |
| `book_task_slot` | `calendar:write` | Book ISO `start`/`end` (`force` on conflict) |
| `clear_task_slot` | `calendar:write` | Clear scheduled slot (+ external event) |

Transport: MCP JSON-RPC over HTTP (`initialize`, `tools/list`, `tools/call`, `ping`).

### Agenda conflicts

`book_task_slot` without `force` returns `{ conflict: true, code: "CALENDAR_SLOT_CONFLICT", conflicts[] }` when the slot overlaps. Retry with `force=true` (same pattern as the Agenda UI) or pick another slot from `propose_slots`.

### `move_todo` strategies

Same semantics as the product DnD API:

- `default` / `keepDates` — reject with structured `422` if dates fall outside the phase window
- `clampDatesToPhase` — clamp start/deadline into the phase
- `clearScheduledSlot` — drop the calendar slot when it conflicts
- `rescheduleSlot` — attempt reschedule (server-side)

## Manual smoke checklist

1. Create key in Settings; copy secret.
2. `curl` `tools/list` against `/mcp` with Bearer — expect the v1.1 tools.
3. Call `list_todos` / `create_todo`, then `list_projects` → `list_project_phases` → `create_todo` with `phaseId`.
4. `create_note` linked to a todo; `add_comment` on the same todo.
5. Revoke the key; same Bearer must return 401.

## Out of scope (v1.1)

- In-app chat / embeddings
- Wroket as MCP *client*
- Attachments, Notion/Monday sync, billing/admin
