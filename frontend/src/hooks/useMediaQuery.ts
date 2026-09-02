"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media query hook. Defaults to `false` until mounted so server
 * and first client paint stay aligned (desktop-first).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
