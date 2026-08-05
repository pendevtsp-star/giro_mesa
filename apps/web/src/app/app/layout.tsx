import type { ReactNode } from "react";
import { AppAccessBoundary } from "../../components/app-shell/AppAccessBoundary";
import { AppRouteFrame } from "../../components/app-shell/AppRouteFrame";
import { LegalAcceptanceBoundary } from "../../components/app-shell/LegalAcceptanceBoundary";
import { SessionProvider } from "../../lib/session-context";

export default function ApplicationLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppAccessBoundary>
        <LegalAcceptanceBoundary>
          <AppRouteFrame>{children}</AppRouteFrame>
        </LegalAcceptanceBoundary>
      </AppAccessBoundary>
    </SessionProvider>
  );
}
