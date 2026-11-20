/**
 * One-shot recovery: restore empty live notes from PITR / saved revision probes,
 * reinstate nonempty revision ring entries, clear empty note_collab Yjs state.
 *
 *   $env:GOOGLE_CLOUD_PROJECT="involuted-reach-490718-h4"
 *   npx ts-node src/scripts/restoreNotesFromPitr.ts
 *   $env:WRITE="1"; npx ts-node src/scripts/restoreNotesFromPitr.ts
 */
import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? "involuted-reach-490718-h4";
const WRITE = process.env.WRITE === "1";
const DATA_DIR = path.resolve(__dirname, "../../data");
const PITR_NOTES = path.join(DATA_DIR, "_pitr_notes_2026-11-19T07-00-00-000Z.json");
const OLD_REVS = path.join(DATA_DIR, "_probe_noteRevisions.json");

type AnyObj = Record<string, unknown>;

function fromFs(v: AnyObj | null | undefined): unknown {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) {
    const values = (v.arrayValue as { values?: AnyObj[] }).values ?? [];
    return values.map((x) => fromFs(x));
  }
  if ("mapValue" in v) {
    const fields = (v.mapValue as { fields?: Record<string, AnyObj> }).fields ?? {};
    const out: AnyObj = {};
    for (const [k, vv] of Object.entries(fields)) out[k] = fromFs(vv);
    return out;
  }
  return null;
}

function toFs(v: unknown): AnyObj {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === "object") {
    const fields: Record<string, AnyObj> = {};
    for (const [k, vv] of Object.entries(v as AnyObj)) {
      if (vv !== undefined) fields[k] = toFs(vv);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function textLen(note: AnyObj | null | undefined): number {
  if (!note) return 0;
  const c = String(note.content ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let b = 0;
  const blocks = note.blocks;
  const list = Array.isArray(blocks)
    ? blocks
    : blocks && typeof blocks === "object"
      ? Object.values(blocks as AnyObj)
      : [];
  for (const x of list) {
    const row = x as AnyObj;
    const t = String(row?.html ?? row?.text ?? row?.content ?? "")
      .replace(/<[^>]+>/g, " ")
      .trim();
    b += t.length;
  }
  return c.length + b;
}

function eachNote(
  data: AnyObj,
  fn: (uid: string, note: AnyObj, set: (next: AnyObj) => void) => void,
): void {
  for (const [uid, bucket] of Object.entries(data ?? {})) {
    if (Array.isArray(bucket)) {
      bucket.forEach((note, i) => {
        fn(uid, note as AnyObj, (n) => {
          bucket[i] = n;
        });
      });
    } else if (bucket && typeof bucket === "object") {
      const map = bucket as AnyObj;
      for (const id of Object.keys(map)) {
        fn(uid, map[id] as AnyObj, (n) => {
          map[id] = n;
        });
      }
    }
  }
}

function collectNotes(data: AnyObj): Array<{ uid: string; note: AnyObj }> {
  const out: Array<{ uid: string; note: AnyObj }> = [];
  eachNote(data, (uid, note) => {
    if (note?.id) out.push({ uid, note });
  });
  return out;
}

function loadFsDoc(filePath: string): AnyObj {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as AnyObj;
  return fromFs((raw.fields as AnyObj)?.data as AnyObj) as AnyObj;
}

function gcloudToken(): string {
  return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
}

async function main(): Promise<void> {
  const token = gcloudToken();
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  async function getDoc(docPath: string): Promise<AnyObj> {
    const r = await fetch(`${base}/${docPath}`, { headers });
    if (!r.ok) throw new Error(`${docPath} ${r.status} ${await r.text()}`);
    return (await r.json()) as AnyObj;
  }

  async function patchData(docPath: string, data: AnyObj): Promise<void> {
    const body = { fields: { data: toFs(data) } };
    const r = await fetch(`${base}/${docPath}?updateMask.fieldPaths=data`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`PATCH ${docPath} ${r.status} ${(await r.text()).slice(0, 500)}`);
  }

  const pitrNotes = loadFsDoc(PITR_NOTES);
  const oldRevs = loadFsDoc(OLD_REVS);

  type Best = {
    source: string;
    len: number;
    snap: AnyObj;
    rev?: AnyObj;
  };
  const bestById = new Map<string, Best>();

  for (const { note } of collectNotes(pitrNotes)) {
    const len = textLen(note);
    if (len > 30) {
      bestById.set(String(note.id), {
        source: "pitr-notes-07utc",
        len,
        snap: { title: note.title, content: note.content, blocks: note.blocks },
      });
    }
  }
  for (const [id, list] of Object.entries(oldRevs)) {
    for (const r of (list as AnyObj[]) ?? []) {
      const snap = (r.snapshot as AnyObj) ?? {};
      const len = textLen(snap);
      if (len <= 30) continue;
      const cur = bestById.get(id);
      if (!cur || len > cur.len) {
        bestById.set(id, { source: `rev:${r.at}`, len, snap, rev: r });
      }
    }
  }

  const [notesDoc, usersDoc, archDoc] = await Promise.all([
    getDoc("store/notes"),
    getDoc("store/users"),
    getDoc("store/archivedNotes").catch(() => null),
  ]);
  const live = fromFs((notesDoc.fields as AnyObj).data as AnyObj) as AnyObj;
  const users = fromFs((usersDoc.fields as AnyObj).data as AnyObj) as AnyObj;
  const archived = archDoc
    ? (fromFs((archDoc.fields as AnyObj).data as AnyObj) as AnyObj)
    : {};
  const emailByUid: Record<string, string | null> = {};
  for (const [uid, u] of Object.entries(users)) {
    emailByUid[uid] = ((u as AnyObj)?.email as string) ?? null;
  }

  const emptyAudit: AnyObj[] = [];
  eachNote(live, (uid, note) => {
    if (!note?.id) return;
    const liveLen = textLen(note);
    if (liveLen > 30) return;
    const best = bestById.get(String(note.id));
    emptyAudit.push({
      email: emailByUid[uid],
      uid: uid.slice(0, 12),
      id: note.id,
      title: note.title,
      liveLen,
      canRestore: Boolean(best),
      from: best?.source,
      revLen: best?.len ?? 0,
    });
  });
  console.log("[audit] empty live notes", JSON.stringify(emptyAudit, null, 2));

  for (const [uid, email] of Object.entries(emailByUid)) {
    if (!email || !/julie|fromthebloc|alexandre/i.test(email)) continue;
    const liveN = collectNotes({ [uid]: live[uid] ?? {} }).length;
    const archN = collectNotes({ [uid]: archived[uid] ?? {} }).length;
    const pitrNonempty = collectNotes({ [uid]: pitrNotes[uid] ?? {} }).filter(
      (x) => textLen(x.note) > 30,
    ).length;
    console.log("[user]", email, { liveN, archN, pitrNonempty, uid: uid.slice(0, 16) });
  }

  const now = new Date().toISOString();
  const restored: AnyObj[] = [];
  eachNote(live, (uid, note, set) => {
    if (!note?.id) return;
    const best = bestById.get(String(note.id));
    if (!best) return;
    const liveLen = textLen(note);
    if (liveLen > 30 && liveLen >= best.len) return;

    const snap = best.snap;
    const content = String(snap.content ?? "");
    let blocks = snap.blocks as AnyObj[] | undefined;
    if (!blocks || (Array.isArray(blocks) && blocks.length === 0)) {
      blocks = [{ id: "text", type: "text", html: content }];
    } else if (Array.isArray(blocks)) {
      blocks = blocks.map((b) => {
        if (
          b?.type === "text" &&
          (!b.html || b.html === "<p></p>") &&
          content &&
          content !== "<p></p>"
        ) {
          return { ...b, html: content };
        }
        return b;
      });
      if (!blocks.some((b) => b?.type === "text")) {
        blocks = [{ id: "text", type: "text", html: content }, ...blocks];
      }
    }

    set({
      ...note,
      title: (snap.title as string) ?? note.title,
      content,
      blocks,
      updatedAt: now,
    });
    restored.push({
      email: emailByUid[uid],
      id: note.id,
      title: (snap.title as string) ?? note.title,
      len: textLen({ content, blocks }),
      source: best.source,
    });
  });
  console.log("[plan] restore", JSON.stringify(restored, null, 2));

  if (!WRITE) {
    console.log("[dry-run] set WRITE=1 to apply notes + revisions + collab clear");
    return;
  }

  fs.writeFileSync(
    path.join(DATA_DIR, `_backup_before_restore2_${Date.now()}.json`),
    JSON.stringify(notesDoc),
  );
  await patchData("store/notes", live);
  console.log("[write] store/notes patched");

  const revDoc = await getDoc("store/noteRevisions");
  const liveRevs = fromFs((revDoc.fields as AnyObj).data as AnyObj) as AnyObj;
  for (const row of restored) {
    const id = String(row.id);
    const best = bestById.get(id);
    if (!best) continue;
    const entry = {
      id: (best.rev?.id as string) || crypto.randomUUID(),
      at: (best.rev?.at as string) || now,
      byUid: (best.rev?.byUid as string) || "recovery",
      byEmail: (best.rev?.byEmail as string) || "recovery@local",
      snapshot: best.snap,
    };
    const list = Array.isArray(liveRevs[id]) ? (liveRevs[id] as AnyObj[]) : [];
    const filtered = list.filter((r) => textLen(r.snapshot as AnyObj) > 30 || r.id === entry.id);
    liveRevs[id] = [entry, ...filtered.filter((r) => r.id !== entry.id)].slice(0, 5);
  }
  await patchData("store/noteRevisions", liveRevs);
  console.log("[write] store/noteRevisions patched");

  for (const row of restored) {
    const id = String(row.id);
    const r = await fetch(`${base}/note_collab/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          yjsUpdateB64: { stringValue: "" },
          updatedAt: { stringValue: now },
        },
      }),
    });
    console.log("[write] collab clear", id, r.status);
  }

  const verifyDoc = await getDoc("store/notes");
  const verify = fromFs((verifyDoc.fields as AnyObj).data as AnyObj) as AnyObj;
  for (const row of restored) {
    let found: AnyObj | undefined;
    eachNote(verify, (_uid, note) => {
      if (note.id === row.id) found = note;
    });
    console.log(
      "[verify]",
      row.title,
      "len=" + textLen(found),
      "upd=" + String(found?.updatedAt ?? ""),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
