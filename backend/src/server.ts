import dotenv from "dotenv";
dotenv.config();

import { initStore } from "./persistence";

const port = Number(process.env.PORT) || 3000;

async function main(): Promise<void> {
  await initStore();

  const { default: app } = await import("./app");

  app.listen(port, () => {
    console.log(`[server] Backend listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});
