"use client";

import { ArrowLeft, ShieldAlert } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useSession } from "../../lib/session-context";
import { ForbiddenState, LoadingState } from "../states/AppStates";
import { BrandLink } from "./BrandMark";
import { canAccessAppPath, requiredNavigationItemForPath } from "./navigation";

type AccessState = "checking" | "allowed" | "forbidden" | "unauthenticated";

export function AppAccessBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, isLoading } = useSession();
  const [access, setAccess] = useState<AccessState>(pathname === "/app" ? "allowed" : "checking");

  useEffect(() => {
    if (pathname === "/app") {
      setAccess("allowed");
      return;
    }

    if (isLoading) {
      setAccess("checking");
    } else if (session) {
      setAccess(canAccessAppPath(pathname, session.permissions) ? "allowed" : "forbidden");
    } else {
      setAccess("unauthenticated");
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, pathname, router, session]);

  if (access === "allowed") {
    return children;
  }

  if (access === "checking" || access === "unauthenticated") {
    return (
      <main className="workspace-page access-boundary-page">
        <LoadingState
          title={access === "checking" ? "Validando acesso" : "Redirecionando para o login"}
          description="Estamos conferindo a sessão e as permissões deste perfil."
        />
      </main>
    );
  }

  const required = requiredNavigationItemForPath(pathname)?.permissions ?? [];

  return (
    <main className="workspace-page access-boundary-page" data-testid="permission-denied">
      <header className="workspace-topbar">
        <a className="button ghost compact" href="/app">
          <ArrowLeft size={16} /> Voltar ao painel
        </a>
        <BrandLink />
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <ShieldAlert size={16} /> Permissão do perfil
        </span>
        <h1>Esta área não faz parte do seu acesso</h1>
        <p>
          Use os módulos disponíveis no painel ou solicite ao responsável uma ampliação de acesso.
        </p>
      </section>
      <ForbiddenState />
      {required.length ? (
        <p className="access-boundary-help">
          Permissão necessária: <code>{required.join(" ou ")}</code>
        </p>
      ) : null}
    </main>
  );
}
