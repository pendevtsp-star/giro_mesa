"use client";

import { useCallback, useEffect, useState } from "react";
import { type CurrentShiftResponse, closeShift, getCurrentShift, openShift } from "../giromesa-api";

export function useOperationalShift(branchId?: string) {
  const [data, setData] = useState<CurrentShiftResponse | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(branchId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!branchId) return null;
    setIsLoading(true);
    try {
      const response = await getCurrentShift(branchId);
      setData(response);
      setError(null);
      return response;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Falha ao carregar turno");
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
    open: async (notes?: string) => {
      if (!branchId) return null;
      await openShift(branchId, notes);
      return refresh();
    },
    close: async (notes?: string) => {
      if (!branchId) return null;
      await closeShift(branchId, notes);
      return refresh();
    },
  };
}
