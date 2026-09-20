"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "traveler" | "provider" | "admin";
  locale: string;
  homeCity: string | null;
}

interface AuthContextValue {
  user: SessionUser | null;
  isGuest: boolean;
  refresh: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
  logout: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ initialUser, children }: { initialUser: SessionUser | null; children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { user: SessionUser | null };
      setUser(data.user);
    } catch {
      // Network failure: keep last known state instead of forcing a logout UI.
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) return false;
      setUser(null);
      return true;
    } catch {
      // Keep the authenticated UI state if the server never confirmed logout.
      return false;
    }
  }, []);

  const value = useMemo(() => ({ user, isGuest: !user, refresh, setUser, logout }), [user, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
