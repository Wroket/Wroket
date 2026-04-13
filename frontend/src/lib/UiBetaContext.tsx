"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "wroket-ui-beta";

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export type UiBetaContextValue = {
  betaUi: boolean;
  setBetaUi: (next: boolean) => void;
  toggleBetaUi: () => void;
};

const UiBetaContext = createContext<UiBetaContextValue | null>(null);

export function UiBetaProvider({ children }: { children: ReactNode }) {
  const [betaUi, setBetaUiState] = useState(readStored);

  const setBetaUi = useCallback((next: boolean) => {
    setBetaUiState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, []);

  const toggleBetaUi = useCallback(() => {
    setBetaUiState((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ betaUi, setBetaUi, toggleBetaUi }),
    [betaUi, setBetaUi, toggleBetaUi],
  );

  return <UiBetaContext.Provider value={value}>{children}</UiBetaContext.Provider>;
}

export function useUiBeta(): UiBetaContextValue {
  const ctx = useContext(UiBetaContext);
  if (!ctx) {
    throw new Error("useUiBeta must be used within UiBetaProvider");
  }
  return ctx;
}
