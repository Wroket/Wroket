"use client";

import { useCallback, useRef, useState } from "react";

import { lookupUserByUid } from "./api";

export interface CachedUser {
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Hook that resolves UIDs to user display info with a stable, ref-based cache.
 * Uses `useRef` instead of `useState` for the cache to avoid re-render loops
 * (the resolveUser callback would otherwise depend on the cache state it updates).
 */
export function useUserLookup() {
  const cacheRef = useRef<Record<string, CachedUser>>({});
  const [, forceUpdate] = useState(0);

  const resolveUser = useCallback(async (uid: string) => {
    if (!uid || cacheRef.current[uid]) return;
    try {
      const u = await lookupUserByUid(uid);
      if (u) {
        cacheRef.current[uid] = u;
        forceUpdate((n) => n + 1);
      }
    } catch {
      /* user not found */
    }
  }, []);

  const displayName = useCallback((uid: string): string => {
    const u = cacheRef.current[uid];
    if (!u) return uid?.slice(0, 8) + "\u2026";
    if (u.firstName || u.lastName)
      return [u.firstName, u.lastName].filter(Boolean).join(" ");
    return u.email;
  }, []);

  return { resolveUser, displayName, cache: cacheRef.current };
}
