/**
 * HTTP smoke for Slack Lot 3 against a running API (default localhost:3001).
 * Usage: npx ts-node -r dotenv/config src/scripts/smokeSlackLot3.ts
 */
import crypto from "crypto";

const API = (process.env.SMOKE_API_BASE ?? "http://localhost:3001").replace(/\/$/, "");
const SECRET = (process.env.SLACK_SIGNING_SECRET ?? "").trim();

function sign(rawBody: string, secret: string, ts = String(Math.floor(Date.now() / 1000))): {
  ts: string;
  sig: string;
} {
  const base = `v0:${ts}:${rawBody}`;
  const digest = crypto.createHmac("sha256", secret).update(base, "utf8").digest("hex");
  return { ts, sig: `v0=${digest}` };
}

async function req(
  path: string,
  init: RequestInit & { rawBody?: string } = {},
): Promise<{ status: number; body: string }> {
  const headers = new Headers(init.headers);
  const res = await fetch(`${API}${path}`, { ...init, headers });
  const body = await res.text();
  return { status: res.status, body };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  const results: string[] = [];
  const ok = (label: string) => results.push(`OK  ${label}`);
  const note = (label: string) => results.push(`..  ${label}`);

  // Health
  {
    const r = await req("/health");
    assert(r.status === 200, `health expected 200 got ${r.status}`);
    ok("GET /health");
  }

  // Interactions without signature headers
  {
    const r = await req("/integrations/slack/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "payload=%7B%7D",
    });
    assert(r.status === 401 || r.status === 503, `interactions unsigned expected 401/503 got ${r.status}: ${r.body}`);
    ok(`POST /integrations/slack/interactions unsigned → ${r.status}`);
  }

  // Commands without signature
  {
    const r = await req("/integrations/slack/commands", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "text=help&team_id=T1&user_id=U1",
    });
    assert(r.status === 401 || r.status === 503, `commands unsigned expected 401/503 got ${r.status}`);
    ok(`POST /integrations/slack/commands unsigned → ${r.status}`);
  }

  // Status without auth
  {
    const r = await req("/integrations/slack/status");
    assert(r.status === 401 || r.status === 403, `status unauth expected 401/403 got ${r.status}`);
    ok(`GET /integrations/slack/status unauth → ${r.status}`);
  }

  if (!SECRET) {
    note("SLACK_SIGNING_SECRET unset — skip signed happy-path (restart API after adding .env)");
    console.log(results.join("\n"));
    process.exit(0);
  }

  // Signed slash help — may return ephemeral error if no Slack connection / users.info
  {
    const raw = new URLSearchParams({
      team_id: "T_SMOKE",
      user_id: "U_SMOKE",
      text: "help",
      command: "/wroket",
    }).toString();
    const { ts, sig } = sign(raw, SECRET);
    const r = await req("/integrations/slack/commands", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Slack-Request-Timestamp": ts,
        "X-Slack-Signature": sig,
      },
      body: raw,
    });
    assert(r.status === 200, `signed slash expected 200 got ${r.status}: ${r.body}`);
    const json = JSON.parse(r.body) as { response_type?: string; text?: string };
    assert(json.response_type === "ephemeral", "slash should be ephemeral");
    assert(typeof json.text === "string" && json.text.length > 0, "slash should return text");
    ok(`POST /integrations/slack/commands signed help → 200 (${(json.text ?? "").slice(0, 60)}…)`);
  }

  // Signed interaction — button accept (will fail identity without Slack workspace connection)
  {
    const payload = JSON.stringify({
      type: "block_actions",
      user: { id: "U_SMOKE" },
      team: { id: "T_SMOKE" },
      channel: { id: "C_SMOKE" },
      actions: [{ action_id: "wroket_accept", value: "todo-smoke|uid-smoke" }],
      response_url: "https://hooks.slack.com/actions/SMOKE",
      message: { blocks: [{ type: "section", text: { type: "mrkdwn", text: "hi" } }] },
    });
    const raw = new URLSearchParams({ payload }).toString();
    const { ts, sig } = sign(raw, SECRET);
    const r = await req("/integrations/slack/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Slack-Request-Timestamp": ts,
        "X-Slack-Signature": sig,
      },
      body: raw,
    });
    assert(r.status === 200, `signed interaction expected 200 got ${r.status}: ${r.body}`);
    const json = JSON.parse(r.body) as { response_type?: string; text?: string };
    assert(json.response_type === "ephemeral", "interaction should be ephemeral");
    ok(`POST /integrations/slack/interactions signed accept → 200 (${(json.text ?? "").slice(0, 80)}…)`);
  }

  // Bad signature
  {
    const raw = "text=help&team_id=T1&user_id=U1";
    const r = await req("/integrations/slack/commands", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Slack-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
        "X-Slack-Signature": "v0=deadbeef",
      },
      body: raw,
    });
    assert(r.status === 401, `bad sig expected 401 got ${r.status}`);
    ok("POST /integrations/slack/commands bad signature → 401");
  }

  console.log(results.join("\n"));
  console.log("\nSmoke Lot 3 HTTP: PASS");
}

main().catch((err) => {
  console.error("\nSmoke Lot 3 HTTP: FAIL");
  console.error(err);
  process.exit(1);
});
