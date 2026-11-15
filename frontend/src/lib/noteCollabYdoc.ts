"use client";

import * as Y from "yjs";

import { API_BASE_URL, apiFetchDefaults } from "@/lib/api/core";

/**
 * Encode / decode helpers for HTTP Yjs sync.
 */
export function uint8ToB64(u8: Uint8Array): string {
  let binary = "";
  u8.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function b64ToUint8(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function fragmentNameForBlock(blockId: string): string {
  return `block:${blockId}`;
}

/**
 * Push local Yjs updates and pull remote state (no sticky WebSocket).
 */
export async function syncYdocHttp(
  noteId: string,
  ydoc: Y.Doc,
): Promise<{ canWrite: boolean; updatedAt: string }> {
  const update = Y.encodeStateAsUpdate(ydoc);
  const stateVector = Y.encodeStateVector(ydoc);
  const res = await fetch(`${API_BASE_URL}/notes/${encodeURIComponent(noteId)}/collab/sync`, {
    ...apiFetchDefaults,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      updateB64: uint8ToB64(update),
      stateVectorB64: uint8ToB64(stateVector),
    }),
  });
  if (!res.ok) {
    throw new Error(`collab sync ${res.status}`);
  }
  const data = (await res.json()) as {
    updateB64: string;
    updatedAt: string;
    canWrite: boolean;
  };
  if (data.updateB64) {
    Y.applyUpdate(ydoc, b64ToUint8(data.updateB64));
  }
  return { canWrite: data.canWrite, updatedAt: data.updatedAt };
}
