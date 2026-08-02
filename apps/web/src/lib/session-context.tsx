"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import {
  getSession,
  getTenantBranding,
  type TenantBranding,
  type TenantSession,
} from "./giromesa-api";

interface SessionContextValue {
  session: TenantSession | null;
  branding: TenantBranding | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  switchBranch: (branchId: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TenantSession | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [sessionData, brandingData] = await Promise.all([
        getSession().catch(() => null),
        getTenantBranding().catch(() => null),
      ]);
      setSession(sessionData);
      setBranding(brandingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchBranch = useCallback((branchId: string) => {
    window.localStorage.setItem("gm_active_branch_id", branchId);
    window.location.reload();
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <SessionContext.Provider
      value={{ session, branding, isLoading, error, refresh: loadData, switchBranch }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}

export function useSessionOrFallback() {
  const context = useContext(SessionContext);
  return (
    context ?? {
      session: null,
      branding: null,
      isLoading: false,
      error: null,
      refresh: async () => {},
      switchBranch: () => {},
    }
  );
}
