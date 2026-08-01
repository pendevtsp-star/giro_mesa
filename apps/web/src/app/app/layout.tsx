import type { ReactNode } from "react";
import { AppAccessBoundary } from "../../components/app-shell/AppAccessBoundary";
import { AppRouteFrame } from "../../components/app-shell/AppRouteFrame";
import { SessionProvider } from "../../lib/session-context";

export default function ApplicationLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppAccessBoundary>
        <AppRouteFrame>{children}</AppRouteFrame>
      </AppAccessBoundary>
    </SessionProvider>
  );
}
