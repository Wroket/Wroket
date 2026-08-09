"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const UI_V2_STORAGE_KEY = "wroket-ui-v2";
export const SIDEBAR_COLLAPSED_KEY = "wroket-sidebar-collapsed";

/** UI V2 defaults on for new sessions; explicit `"0"` keeps legacy UI. */
function readUiV2Flag(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(UI_V2_STORAGE_KEY);
    if (v === null) return true;
    return v === "1";
  } catch {
    return true;
  }
}

function readStorageFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

interface UiVersionContextValue {
  /** True when the local "Nouvelle interface" flag is on. */
  uiV2: boolean;
  setUiV2: (enabled: boolean) => void;
  toggleUiV2: () => void;
  /** False until localStorage has been read (avoids hydration flash). */
  ready: boolean;
  /**
   * V2 desktop sidebar icon rail. Lives in this provider so it survives
   * AppShell remounts on client navigations (no expand→collapse flash).
   */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
}

const UiVersionContext = createContext<UiVersionContextValue>({
  uiV2: true,
  setUiV2: () => {},
  toggleUiV2: () => {},
  ready: false,
  sidebarCollapsed: false,
  setSidebarCollapsed: () => {},
  toggleSidebarCollapsed: () => {},
});

/**
 * Client-only UI version flag (localStorage). Default on = Nouvelle interface.
 */
export function UiVersionProvider({ children }: { children: ReactNode }) {
  const [uiV2, setUiV2State] = useState(() => readUiV2Flag());
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() =>
    readStorageFlag(SIDEBAR_COLLAPSED_KEY),
  );
  const [ready, setReady] = useState(false);

  // Hydration gate: re-read localStorage after mount (SSR has no window).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- intentional client hydration sync */
    setUiV2State(readUiV2Flag());
    setSidebarCollapsedState(readStorageFlag(SIDEBAR_COLLAPSED_KEY));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setUiV2 = useCallback((enabled: boolean) => {
    setUiV2State(enabled);
    try {
      localStorage.setItem(UI_V2_STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("ui-v2", enabled);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("ui-v2", uiV2);
  }, [ready, uiV2]);

  const toggleUiV2 = useCallback(() => {
    setUiV2(!uiV2);
  }, [setUiV2, uiV2]);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    try {
      if (collapsed) localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
      else localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
        else localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      uiV2,
      setUiV2,
      toggleUiV2,
      ready,
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebarCollapsed,
    }),
    [uiV2, setUiV2, toggleUiV2, ready, sidebarCollapsed, setSidebarCollapsed, toggleSidebarCollapsed],
  );

  return (
    <UiVersionContext.Provider value={value}>{children}</UiVersionContext.Provider>
  );
}

export function useUiV2(): UiVersionContextValue {
  return useContext(UiVersionContext);
}
