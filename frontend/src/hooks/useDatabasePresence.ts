"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  postDatabasePresence,
  type DatabasePresencePeer,
} from "@/lib/api/userDatabases";

/**
 * Poll database cell presence (~1.8s). Mirrors note presence without Yjs.
 */
export function useDatabasePresence(
  databaseId: string | null,
  opts?: {
    displayName?: string;
    cursor?: { rowId: string; columnId: string } | null;
    intervalMs?: number;
    enabled?: boolean;
  },
) {
  const [presence, setPresence] = useState<DatabasePresencePeer[]>([]);
  const cursorRef = useRef(opts?.cursor);
  cursorRef.current = opts?.cursor;
  const nameRef = useRef(opts?.displayName);
  nameRef.current = opts?.displayName;

  const tick = useCallback(async () => {
    if (!databaseId) return;
    try {
      const peers = await postDatabasePresence(databaseId, {
        displayName: nameRef.current,
        cursor: cursorRef.current === undefined ? null : cursorRef.current,
      });
      setPresence(peers);
    } catch {
      /* ignore transient */
    }
  }, [databaseId]);

  useEffect(() => {
    if (!databaseId || opts?.enabled === false) {
      setPresence([]);
      return;
    }
    void tick();
    const ms = opts?.intervalMs ?? 1800;
    const id = window.setInterval(() => void tick(), ms);
    return () => window.clearInterval(id);
  }, [databaseId, opts?.enabled, opts?.intervalMs, tick]);

  return { presence, refresh: tick };
}
