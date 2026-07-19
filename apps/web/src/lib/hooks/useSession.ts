import { useEffect, useState } from "react";
import { getErrorMessage, getSession, isApiUnavailable, type TenantSession } from "../giromesa-api";

export type SessionResource =
  | { status: "loading"; session: null; message: string }
  | { status: "ready"; session: TenantSession; message: string }
  | { status: "unauthenticated"; session: null; message: string }
  | { status: "offline"; session: null; message: string };

export function useSession(): SessionResource {
  const [resource, setResource] = useState<SessionResource>({
    status: "loading",
    session: null,
    message: "Carregando sessão.",
  });

  useEffect(() => {
    let isMounted = true;

    getSession()
      .then((session) => {
        if (isMounted) {
          setResource({ status: "ready", session, message: "Sessão ativa." });
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }

        setResource({
          status: isApiUnavailable(error) ? "offline" : "unauthenticated",
          session: null,
          message: getErrorMessage(error, "Entre para carregar a operação."),
        });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return resource;
}
