"use client";

import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  canConfirmLegalAcceptance,
  missingLegalDocuments,
} from "../../features/legal/acceptance-policy";
import {
  getLegalAcceptanceStatus,
  type LegalAcceptanceStatus,
  recordLegalAcceptance,
} from "../../lib/giromesa-api";
import { useSession } from "../../lib/session-context";
import { ErrorState, LoadingState } from "../states/AppStates";
import { BrandLink } from "./BrandMark";

const documentLabels = { terms: "Termos de Uso", privacy: "Política de Privacidade" } as const;
const documentLinks = { terms: "/termos", privacy: "/privacidade" } as const;

export function LegalAcceptanceBoundary({ children }: { children: ReactNode }) {
  const { session, isLoading: sessionLoading } = useSession();
  const [status, setStatus] = useState<LegalAcceptanceStatus | null>(null);
  const [confirmations, setConfirmations] = useState({ terms: false, privacy: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setStatus(await getLegalAcceptanceStatus());
      setError(null);
    } catch {
      setError("Não foi possível validar os documentos jurídicos vigentes.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!sessionLoading && session) void refresh();
    if (!sessionLoading && !session) setLoading(false);
  }, [refresh, session, sessionLoading]);

  if (sessionLoading || (session && loading)) {
    return (
      <main className="workspace-page access-boundary-page">
        <LoadingState title="Validando documentos" description="Conferindo os aceites vigentes." />
      </main>
    );
  }

  if (!session || (status && (!status.required || status.complete))) return children;

  if (error || !status) {
    return (
      <main className="workspace-page access-boundary-page">
        <ErrorState>{error ?? "Tente novamente em instantes."}</ErrorState>
        <button className="button secondary" onClick={() => void refresh()} type="button">
          Tentar novamente
        </button>
      </main>
    );
  }

  const missing = missingLegalDocuments(status);
  const canConfirm = canConfirmLegalAcceptance(status, confirmations);

  async function confirm() {
    if (!canConfirm) return;
    setSaving(true);
    try {
      for (const document of missing) {
        await recordLegalAcceptance({
          documentType: document.documentType,
          accepted: true,
          origin: "authenticated_legal_gate",
        });
      }
      setConfirmations({ terms: false, privacy: false });
      await refresh();
    } catch {
      setError(
        "Não foi possível concluir todos os aceites. Os documentos já confirmados foram preservados; tente novamente para concluir os pendentes.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="workspace-page access-boundary-page legal-acceptance-page">
      <header className="workspace-topbar">
        <BrandLink />
      </header>
      <section className="workspace-panel legal-acceptance-card">
        <span className="section-kicker">
          <ShieldCheck size={16} /> Documentos vigentes
        </span>
        <h1>Revise e aceite para continuar</h1>
        <p>
          Uma nova versão dos documentos jurídicos foi publicada. O aceite é pessoal, versionado e
          registrado somente depois da sua confirmação explícita.
        </p>
        {!status.configurationComplete ? (
          <p role="alert">
            A publicação jurídica está incompleta. Contate o suporte antes de operar.
          </p>
        ) : null}
        <div className="legal-acceptance-options">
          {missing.map((document) => (
            <label key={document.documentType}>
              <input
                checked={confirmations[document.documentType]}
                onChange={(event) =>
                  setConfirmations((current) => ({
                    ...current,
                    [document.documentType]: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>
                Li e aceito os{" "}
                <a href={documentLinks[document.documentType]} target="_blank" rel="noreferrer">
                  {documentLabels[document.documentType]}
                </a>{" "}
                {document.version ? `(versão ${document.version})` : ""}.
              </span>
            </label>
          ))}
        </div>
        <button
          className="button primary"
          disabled={!canConfirm || saving}
          onClick={() => void confirm()}
          type="button"
        >
          {saving ? "Registrando aceite..." : "Aceitar e continuar"}
        </button>
      </section>
    </main>
  );
}
