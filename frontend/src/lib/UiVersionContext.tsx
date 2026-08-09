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

/** @deprecated Removed with V1 sunset — kept only so old localStorage keys are cleared. */
export const UI_V2_STORAGE_KEY = "wroket-ui-v2";
export const SIDEBAR_COLLAPSED_KEY = "wroket-sidebar-collapsed";

function readStorageFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

interface UiVersionContextValue {
  /** Always true — UI V1 has been sunset. */
  uiV2: boolean;
  /** No-op — V2 is permanent. */
  setUiV2: (enabled: boolean) => void;
  /** No-op — V2 is permanent. */
  toggleUiV2: () => void;
  /** False until localStorage has been read (avoids hydration flash for sidebar). */
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
 * App chrome prefs (sidebar). UI version is permanently V2.
 */
export function UiVersionProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() =>
    readStorageFlag(SIDEBAR_COLLAPSED_KEY),
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- intentional client hydration sync */
    setSidebarCollapsedState(readStorageFlag(SIDEBAR_COLLAPSED_KEY));
    setReady(true);
    try {
      localStorage.removeItem(UI_V2_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    document.documentElement.classList.add("ui-v2");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.add("ui-v2");
  }, [ready]);

  const setUiV2 = useCallback((_enabled: boolean) => {
    /* V1 sunset — ignore */
  }, []);

  const toggleUiV2 = useCallback(() => {
    /* V1 sunset — ignore */
  }, []);

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
      uiV2: true as const,
      setUiV2,
      toggleUiV2,
      ready,
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebarCollapsed,
    }),
    [setUiV2, toggleUiV2, ready, sidebarCollapsed, setSidebarCollapsed, toggleSidebarCollapsed],
  );

  return (
    <UiVersionContext.Provider value={value}>{children}</UiVersionContext.Provider>
  );
}

export function useUiV2(): UiVersionContextValue {
  return useContext(UiVersionContext);
}
