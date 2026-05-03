/**
 * RECOVERY SCRIPT — restore store/notes from Firestore PITR
 *
 * Usage:
 *   $env:GOOGLE_CLOUD_PROJECT="involuted-reach-490718-h4"
 *   npx ts-node -e "require('dotenv').config()" src/scripts/recoverNotes.ts
 *
 * Or after build:
 *   node -r dotenv/config dist/scripts/recoverNotes.js
 */
import { Firestore, Timestamp } from "@google-cloud/firestore";
import dotenv from "dotenv";
dotenv.config();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? "involuted-reach-490718-h4";

// Timestamps to try, from most recent safe point backwards.
// Incident happened around 11:27 UTC — we try from 11:00 UTC downward.
const CANDIDATE_TIMES = [
  "2026-05-03T11:00:00.000Z", // 13:00 CEST — 27 min before first deploy
  "2026-05-03T10:00:00.000Z", // 12:00 CEST — safe
  "2026-05-03T08:00:00.000Z", // 10:00 CEST
  "2026-05-02T20:00:00.000Z", // yesterday evening
  "2026-05-01T20:00:00.000Z", // 2 days ago
];

async function tryRead(db: Firestore, isoTime: string): Promise<Record<string, unknown> | null> {
  const readTime = Timestamp.fromDate(new Date(isoTime));
  try {
    let result: FirebaseFirestore.DocumentData | undefined;
    await db.runTransaction(
      async (t) => {
        const snap = await t.get(db.collection("store").doc("notes"));
        result = snap.data();
      },
      { readOnly: true, readTime } as Parameters<typeof db.runTransaction>[1]
    );
    return (result as Record<string, unknown>) ?? null;
  } catch (err) {
    console.warn(`[recover-notes] Read at ${isoTime} failed: ${err}`);
    return null;
  }
}

function countNotes(data: Record<string, unknown>): number {
  const notesMap = data.data as Record<string, unknown> | undefined;
  if (!notesMap) return 0;
  return Object.values(notesMap).reduce((acc, userNotes) => {
    return acc + (userNotes && typeof userNotes === "object" ? Object.keys(userNotes as object).length : 0);
  }, 0);
}

async function main(): Promise<void> {
  console.log(`[recover-notes] Project: ${PROJECT_ID}`);
  const db = new Firestore({ projectId: PROJECT_ID });

  let best: { isoTime: string; data: Record<string, unknown>; noteCount: number } | null = null;

  for (const isoTime of CANDIDATE_TIMES) {
    process.stdout.write(`[recover-notes] Trying ${isoTime} … `);
    const data = await tryRead(db, isoTime);
    if (!data) { console.log("no data"); continue; }
    const noteCount = countNotes(data);
    console.log(`${noteCount} note(s) found`);
    if (noteCount > 0) {
      best = { isoTime, data, noteCount };
      break; // use the most recent time that has data
    }
  }

  if (!best) {
    console.error("[recover-notes] No notes found at any candidate timestamp.");
    console.error("Try adding an earlier date to CANDIDATE_TIMES.");
    process.exit(1);
  }

  console.log(`\n[recover-notes] Best recovery point: ${best.isoTime} (${best.noteCount} note(s))`);
  console.log("[recover-notes] Preview (first 800 chars):");
  console.log(JSON.stringify(best.data, null, 2).slice(0, 800));

  console.log("\n[recover-notes] Writing recovered data to store/notes …");
  await db.collection("store").doc("notes").set(best.data);
  console.log(`[recover-notes] ✓ Done — ${best.noteCount} note(s) restored from ${best.isoTime}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[recover-notes] Fatal:", err);
  process.exit(1);
});
