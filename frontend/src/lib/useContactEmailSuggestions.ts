"use client";

import { useEffect, useRef, useState } from "react";

import { getEmailSuggestions } from "@/lib/api";
import { getContactSuggestions } from "@/lib/api/contacts";

const MIN_QUERY_LENGTH = 3;

export interface EmailSuggestionItem {
  email: string;
  label: string;
  contactId?: string;
}

/**
 * Merges collaborator/team emails with répertoire contacts (nom + entreprise).
 */
export function useContactEmailSuggestions(query: string, debounceMs = 300): {
  suggestions: EmailSuggestionItem[];
  loading: boolean;
  minQueryLength: number;
} {
  const [suggestions, setSuggestions] = useState<EmailSuggestionItem[]>([]);
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
        const [emails, contacts] = await Promise.all([
          getEmailSuggestions(q),
          getContactSuggestions(q),
        ]);
        if (cancelled) return;
        const seen = new Set<string>();
        const merged: EmailSuggestionItem[] = [];
        for (const c of contacts) {
          const email = c.email?.trim();
          if (!email) continue;
          const key = email.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const parts = [c.displayName, c.company].filter(Boolean);
          merged.push({
            email,
            label: parts.length ? `${parts.join(" · ")} (${email})` : email,
            contactId: c.id,
          });
        }
        for (const email of emails) {
          const key = email.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({ email, label: email });
        }
        setSuggestions(merged);
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
