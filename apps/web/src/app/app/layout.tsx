import type { ReactNode } from "react";
import { AppAccessBoundary } from "../../components/app-shell/AppAccessBoundary";

export default function ApplicationLayout({ children }: { children: ReactNode }) {
  return <AppAccessBoundary>{children}</AppAccessBoundary>;
}
