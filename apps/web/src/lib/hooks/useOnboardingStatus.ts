"use client";

import { useCallback, useEffect, useState } from "react";
import {
  completeOnboardingStep,
  getOnboardingStatus,
  type OnboardingStatus,
  recalculateOnboardingReadiness,
  skipOnboardingStep,
  startOnboardingStep,
} from "../giromesa-api";

export function useOnboardingStatus(branchId?: string) {
  const [data, setData] = useState<OnboardingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await getOnboardingStatus(branchId);
      setData(status);
      setError(null);
      return status;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Falha ao carregar onboarding",
      );
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
    startStep: async (stepKey: string) => setData(await startOnboardingStep(stepKey)),
    completeStep: async (stepKey: string) => setData(await completeOnboardingStep(stepKey)),
    skipStep: async (stepKey: string) => setData(await skipOnboardingStep(stepKey)),
    recalculate: async () => setData(await recalculateOnboardingReadiness(branchId)),
  };
}
