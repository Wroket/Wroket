"use client";

import { useEffect, useRef, useState } from "react";

import { getEmailSuggestions } from "@/lib/api";

const MIN_QUERY_LENGTH = 3;

/**
 * Fetches collaborator + team member emails matching `query` after debounce.
 * No request until `query.trim()` has at least {@link MIN_QUERY_LENGTH} characters.
 */
export function useContactEmailSuggestions(query: string, debounceMs = 300): {
  suggestions: string[];
  loading: boolean;
  minQueryLength: number;
} {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    let cancelled = false;
    debounceRef.current = setTimeout(async () => {
      try {
        const emails = await getEmailSuggestions(q);
        if (!cancelled) setSuggestions(emails);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
    };
  }, [query, debounceMs]);

  return { suggestions, loading, minQueryLength: MIN_QUERY_LENGTH };
}
