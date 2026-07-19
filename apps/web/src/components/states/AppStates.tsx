import { AlertTriangle, LockKeyhole, PlugZap, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({
  title = "Carregando operação",
  description = "Estamos preparando os dados do ambiente.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="app-state app-state-loading" aria-live="polite">
      <RefreshCw size={20} />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </section>
  );
}

export function ApiUnavailableState({ requestId }: { requestId?: string }) {
  return (
    <section className="app-state app-state-warning" aria-live="polite">
      <PlugZap size={20} />
      <div>
        <strong>Não foi possível carregar a operação agora.</strong>
        <p>Tente novamente em instantes. {requestId ? `Código de suporte: ${requestId}.` : null}</p>
      </div>
    </section>
  );
}

export function UnauthenticatedState({ actions }: { actions?: ReactNode }) {
  return (
    <section className="demo-entry-panel" aria-label="Acesso ao painel">
      <div>
        <span className="section-kicker">Acesso seguro</span>
        <h2>Explore o GiroMesa com uma operação preparada.</h2>
        <p>
          O painel abaixo mostra a estrutura do Bar Aurora para você conhecer a navegação. Ao entrar
          no painel, as ações passam a usar sessão, permissões e dados reais do backend.
        </p>
      </div>
      {actions ? <div className="demo-entry-actions">{actions}</div> : null}
    </section>
  );
}

export function ForbiddenState() {
  return (
    <section className="app-state app-state-danger">
      <LockKeyhole size={20} />
      <div>
        <strong>Acesso restrito para este perfil.</strong>
        <p>Solicite permissão ao administrador do estabelecimento.</p>
      </div>
    </section>
  );
}

export function ErrorState({ children }: { children?: ReactNode }) {
  return (
    <section className="app-state app-state-danger">
      <AlertTriangle size={20} />
      <div>
        <strong>Algo impediu o carregamento desta área.</strong>
        <p>{children ?? "Tente novamente em instantes."}</p>
      </div>
    </section>
  );
}
