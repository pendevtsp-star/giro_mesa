"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type CashSessionSummary,
  closeCashSession,
  getCashSessionSummary,
  openCashSession,
  registerCashSupply,
  registerCashWithdrawal,
} from "../giromesa-api";

export function useCashSummary(branchId?: string) {
  const [data, setData] = useState<CashSessionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(branchId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!branchId) return null;
    setIsLoading(true);
    try {
      const summary = await getCashSessionSummary(branchId);
      setData(summary);
      setError(null);
      return summary;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao carregar caixa");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    data,
    isLoading,
    error,
    refresh,
    open: async (openingAmountCents: number) => {
      if (!branchId) return null;
      await openCashSession(branchId, openingAmountCents);
      return refresh();
    },
    supply: async (amountCents: number, reason: string) => {
      if (!branchId) return null;
      await registerCashSupply(branchId, amountCents, reason);
      return refresh();
    },
    withdrawal: async (amountCents: number, reason: string) => {
      if (!branchId) return null;
      await registerCashWithdrawal(branchId, amountCents, reason);
      return refresh();
    },
    close: async (cashSessionId: string, countedAmountCents: number) => {
      await closeCashSession(cashSessionId, countedAmountCents);
      return refresh();
    },
  };
}
