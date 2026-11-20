/**
 * RECOVERY SCRIPT — restore store/notes (+ optional noteRevisions) from Firestore PITR.
 *
 * Dry-run by default (no writes). Apply only with WRITE=1 after reviewing preview.
 *
 * Usage:
 *   $env:GOOGLE_CLOUD_PROJECT="involuted-reach-490718-h4"
 *   npx ts-node -r dotenv/config src/scripts/recoverNotes.ts
 *   $env:WRITE="1"; npx ts-node -r dotenv/config src/scripts/recoverNotes.ts
 */
import { Firestore, Timestamp } from "@google-cloud/firestore";
import dotenv from "dotenv";
dotenv.config();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? "involuted-reach-490718-h4";
const WRITE = process.env.WRITE === "1";
const DOMAIN = (process.env.RECOVER_DOMAIN ?? "notes") as "notes" | "noteRevisions";

/**
 * Incident 2026-11-19 (Paris): empty TipTap/Yjs → LWW wipe mid-morning.
 * Probe from early morning backwards within PITR window (~7 days).
 */
const CANDIDATE_TIMES = [
  "2026-11-19T09:00:00.000Z", // 10:00 Paris
  "2026-11-19T08:00:00.000Z", // 09:00 Paris
  "2026-11-19T07:00:00.000Z", // 08:00 Paris
  "2026-11-19T06:00:00.000Z", // 07:00 Paris
  "2026-11-18T20:00:00.000Z", // previous evening
  "2026-11-18T12:00:00.000Z",
  "2026-11-17T20:00:00.000Z",
];

type NotesBlob = Record<string, unknown>;

function unwrapData(raw: Record<string, unknown> | null | undefined): NotesBlob {
  if (!raw) return {};
  if (raw.data && typeof raw.data === "object") return raw.data as NotesBlob;
  return raw;
}

function noteTextLen(note: Record<string, unknown>): number {
  const content = typeof note.content === "string" ? note.content : "";
  const stripped = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  let blockLen = 0;
  if (Array.isArray(note.blocks)) {
    for (const b of note.blocks) {
      if (!b || typeof b !== "object") continue;
      const html = typeof (b as { html?: string }).html === "string" ? (b as { html: string }).html : "";
      const text = typeof (b as { text?: string }).text === "string" ? (b as { text: string }).text : "";
      blockLen += (html || text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
    }
  }
  return stripped.length + blockLen;
}

function scoreNotesDomain(payload: NotesBlob): {
  noteCount: number;
  nonempty: number;
  empty: number;
  samples: Array<{ id: string; title: string; uid: string; len: number; updatedAt?: string }>;
} {
  let noteCount = 0;
  let nonempty = 0;
  let empty = 0;
  const samples: Array<{ id: string; title: string; uid: string; len: number; updatedAt?: string }> = [];
  for (const uid of Object.keys(payload)) {
    const bucket = payload[uid];
    const arr = Array.isArray(bucket)
      ? bucket
      : bucket && typeof bucket === "object"
        ? Object.values(bucket as object)
        : [];
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") continue;
      const note = raw as Record<string, unknown>;
      noteCount += 1;
      const len = noteTextLen(note);
      if (len > 30) {
        nonempty += 1;
        if (samples.length < 8) {
          samples.push({
            id: String(note.id ?? ""),
            title: String(note.title ?? ""),
            uid,
            len,
            updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : undefined,
          });
        }
      } else {
        empty += 1;
      }
    }
  }
  return { noteCount, nonempty, empty, samples };
}

function scoreRevisionsDomain(payload: NotesBlob): {
  noteCount: number;
  nonempty: number;
  empty: number;
  samples: Array<{ id: string; title: string; uid: string; len: number; updatedAt?: string }>;
} {
  let noteCount = 0;
  let nonempty = 0;
  let empty = 0;
  const samples: Array<{ id: string; title: string; uid: string; len: number; updatedAt?: string }> = [];
  for (const noteId of Object.keys(payload)) {
    noteCount += 1;
    const list = Array.isArray(payload[noteId]) ? (payload[noteId] as unknown[]) : [];
    let best = 0;
    let bestTitle = "";
    let bestAt = "";
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const rev = raw as { at?: string; snapshot?: Record<string, unknown> };
      const snap = rev.snapshot ?? {};
      const len = noteTextLen(snap);
      if (len > best) {
        best = len;
        bestTitle = String(snap.title ?? "");
        bestAt = typeof rev.at === "string" ? rev.at : "";
      }
    }
    if (best > 30) {
      nonempty += 1;
      if (samples.length < 8) {
        samples.push({ id: noteId, title: bestTitle, uid: "", len: best, updatedAt: bestAt });
      }
    } else {
      empty += 1;
    }
  }
  return { noteCount, nonempty, empty, samples };
}

async function tryRead(
  db: Firestore,
  docId: string,
  isoTime: string,
): Promise<Record<string, unknown> | null> {
  const readTime = Timestamp.fromDate(new Date(isoTime));
  try {
    let result: FirebaseFirestore.DocumentData | undefined;
    await db.runTransaction(
      async (t) => {
        const snap = await t.get(db.collection("store").doc(docId));
        result = snap.data();
      },
      { readOnly: true, readTime } as Parameters<typeof db.runTransaction>[1],
    );
    return (result as Record<string, unknown>) ?? null;
  } catch (err) {
    console.warn(`[recover-notes] Read ${docId} at ${isoTime} failed: ${err}`);
    return null;
  }
}

async function main(): Promise<void> {
  console.log(`[recover-notes] Project: ${PROJECT_ID} domain=${DOMAIN} WRITE=${WRITE}`);
  const db = new Firestore({ projectId: PROJECT_ID });

  const liveSnap = await db.collection("store").doc(DOMAIN).get();
  const liveRaw = (liveSnap.data() as Record<string, unknown> | undefined) ?? null;
  const livePayload = unwrapData(liveRaw);
  const liveScore =
    DOMAIN === "notes" ? scoreNotesDomain(livePayload) : scoreRevisionsDomain(livePayload);
  console.log(`[recover-notes] LIVE ${DOMAIN}:`, JSON.stringify(liveScore));

  let best: {
    isoTime: string;
    data: Record<string, unknown>;
    score: ReturnType<typeof scoreNotesDomain>;
  } | null = null;

  for (const isoTime of CANDIDATE_TIMES) {
    process.stdout.write(`[recover-notes] Trying ${DOMAIN} @ ${isoTime} … `);
    const data = await tryRead(db, DOMAIN, isoTime);
    if (!data) {
      console.log("no data");
      continue;
    }
    const payload = unwrapData(data);
    const score =
      DOMAIN === "notes" ? scoreNotesDomain(payload) : scoreRevisionsDomain(payload);
    console.log(`${score.noteCount} notes, nonempty=${score.nonempty}`);
    if (!best || score.nonempty > best.score.nonempty) {
      best = { isoTime, data, score };
    }
  }

  if (!best) {
    console.error("[recover-notes] No PITR candidate readable.");
    process.exit(1);
  }

  console.log(`\n[recover-notes] Best PITR: ${best.isoTime}`, JSON.stringify(best.score));
  console.log("[recover-notes] Preview (first 600 chars):");
  console.log(JSON.stringify(best.data, null, 2).slice(0, 600));

  if (best.score.nonempty <= liveScore.nonempty) {
    console.log(
      `[recover-notes] PITR nonempty (${best.score.nonempty}) <= live (${liveScore.nonempty}) — no write recommended.`,
    );
    process.exit(0);
  }

  if (!WRITE) {
    console.log(
      `[recover-notes] DRY_RUN — would restore ${DOMAIN} from ${best.isoTime} (nonempty ${best.score.nonempty} > live ${liveScore.nonempty}). Set WRITE=1 to apply.`,
    );
    process.exit(0);
  }

  const backupId = `backup_${DOMAIN}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  console.log(`[recover-notes] Backing up live ${DOMAIN} → store/${backupId}`);
  await db.collection("store").doc(backupId).set(liveRaw ?? { data: livePayload });
  console.log(`[recover-notes] Writing recovered ${DOMAIN} from ${best.isoTime} …`);
  await db.collection("store").doc(DOMAIN).set(best.data);
  console.log(`[recover-notes] ✓ Done — nonempty=${best.score.nonempty} from ${best.isoTime}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[recover-notes] Fatal:", err);
  process.exit(1);
});
