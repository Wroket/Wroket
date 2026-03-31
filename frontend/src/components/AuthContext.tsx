"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { getMe, logout as apiLogout, AuthMeResponse } from "@/lib/api";

interface AuthContextType {
  user: AuthMeResponse | null;
  loading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  refresh: async () => {},
});

const PUBLIC_PATHS = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthMeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      setUser(null);
      if (typeof window !== "undefined" && !PUBLIC_PATHS.includes(window.location.pathname)) {
        window.location.href = "/login";
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleLogout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      window.location.href = "/login";
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      /* silent */
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout: handleLogout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
