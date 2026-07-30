import { Activity, ArrowLeft, BookOpen, KeyRound, LifeBuoy, Mail } from "lucide-react";

export default function SupportPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();

  return (
    <main className="support-page support-page-night">
      <header className="support-topbar">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <a className="button secondary compact" href="/login">
          <ArrowLeft size={16} /> Voltar ao login
        </a>
      </header>

      <section className="support-hero">
        <span className="section-kicker">
          <LifeBuoy size={16} /> Central de ajuda
        </span>
        <h1>Resolva o acesso sem sair do GiroMesa.</h1>
        <p>
          A central reúne recuperação de senha, status da operação e orientações para enviar um
          chamado com as informações necessárias.
        </p>
      </section>

      <section className="support-options" aria-label="Opções de suporte">
        <article className="support-option">
          <KeyRound size={22} />
          <h2>Recuperar senha</h2>
          <p>Informe seu e-mail na tela de login e solicite um link temporário de recuperação.</p>
          <a className="button primary" href="/login#recuperar-senha">
            Recuperar acesso
          </a>
        </article>

        <article className="support-option">
          <Activity size={22} />
          <h2>Verificar o sistema</h2>
          <p>Confirme se API, banco, filas e serviços essenciais estão disponíveis.</p>
          <a className="button secondary" href="/status">
            Ver status
          </a>
        </article>

        <article className="support-option">
          <BookOpen size={22} />
          <h2>Preparar um chamado</h2>
          <p>Veja quais dados ajudam a diagnosticar o problema sem idas e vindas.</p>
          <a className="button secondary" href="/manual#suporte">
            Abrir orientações
          </a>
        </article>
      </section>

      <section className="support-contact">
        <div>
          <span className="section-kicker">Contato direto</span>
          <h2>O envio por e-mail é uma opção explícita.</h2>
          <p>
            Quando configurado, o botão abaixo abre o aplicativo de e-mail do dispositivo. Assim a
            navegação não surpreende nem tira você da tela de login sem aviso.
          </p>
        </div>
        {supportEmail ? (
          <a className="button secondary" href={`mailto:${supportEmail}`}>
            <Mail size={17} /> Abrir e-mail para o suporte
          </a>
        ) : (
          <span className="gm-badge gm-badge-neutral">Canal direto em configuração</span>
        )}
      </section>
    </main>
  );
}
