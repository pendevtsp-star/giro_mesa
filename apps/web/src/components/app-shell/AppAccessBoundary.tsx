"use client";

import { ArrowLeft, ShieldAlert } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { getSession } from "../../lib/giromesa-api";
import { ForbiddenState, LoadingState } from "../states/AppStates";
import { canAccessAppPath, requiredNavigationItemForPath } from "./navigation";

type AccessState = "checking" | "allowed" | "forbidden" | "unauthenticated";

export function AppAccessBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [access, setAccess] = useState<AccessState>(pathname === "/app" ? "allowed" : "checking");

  useEffect(() => {
    let active = true;

    if (pathname === "/app") {
      setAccess("allowed");
      return () => {
        active = false;
      };
    }

    setAccess("checking");
    void getSession()
      .then((session) => {
        if (!active) return;
        setAccess(canAccessAppPath(pathname, session.permissions) ? "allowed" : "forbidden");
      })
      .catch(() => {
        if (!active) return;
        setAccess("unauthenticated");
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      });

    return () => {
      active = false;
    };
  }, [pathname, router]);

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
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
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
