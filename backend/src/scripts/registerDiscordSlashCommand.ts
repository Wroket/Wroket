/**
 * Register global Discord slash command `/wroket` (option `text`).
 *
 * Usage (local, with secrets in env or .env):
 *   npx ts-node -r dotenv/config src/scripts/registerDiscordSlashCommand.ts
 *
 * Requires: DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN
 */
import "dotenv/config";

const CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim() || "";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN?.trim() || "";

async function main(): Promise<void> {
  if (!CLIENT_ID || !BOT_TOKEN) {
    console.error("Missing DISCORD_CLIENT_ID or DISCORD_BOT_TOKEN");
    process.exit(1);
  }

  const url = `https://discord.com/api/v10/applications/${CLIENT_ID}/commands`;
  const body = {
    name: "wroket",
    description: "Wroket PMO commands (help, tasks, my-week, overdue, …)",
    options: [
      {
        type: 3,
        name: "text",
        description: "Command text, e.g. help | my-week | overdue",
        required: false,
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { id?: string; name?: string; message?: string };
  if (!res.ok) {
    console.error("Register failed:", res.status, json);
    process.exit(1);
  }
  console.log("Registered slash command:", json.id, json.name);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
