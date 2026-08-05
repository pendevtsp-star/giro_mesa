import Image from "next/image";
import type { ReactNode } from "react";

type PublicLegalPageProps = {
  title: string;
  summary: string;
  children: ReactNode;
};

const links = [
  ["Termos", "/termos"],
  ["Privacidade", "/privacidade"],
  ["Cookies", "/cookies"],
  ["Cancelamento", "/cancelamento"],
  ["Segurança", "/seguranca"],
  ["Suboperadores", "/suboperadores"],
] as const;

export function PublicLegalPage({ title, summary, children }: PublicLegalPageProps) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <a className="landing-brand" href="/" aria-label="GiroMesa">
          <Image
            src="/images/giromesa-symbol.svg"
            alt=""
            width={36}
            height={36}
            aria-hidden="true"
          />
          <span>
            Giro<strong>Mesa</strong>
          </span>
        </a>
        <a className="button secondary compact" href="/suporte">
          Ajuda
        </a>
      </header>
      <article className="legal-content">
        <span className="section-kicker">Documentação pública</span>
        <h1>{title}</h1>
        <p className="legal-summary">{summary}</p>
        <section className="legal-pending" aria-label="Status de publicação">
          <strong>Publicação pendente de validação jurídica e cadastral.</strong>
          <p>
            A razão social, CNPJ, endereço e os canais formais serão publicados somente após
            validação documental. Esta página não substitui contrato, aviso de privacidade ou
            orientação profissional enquanto esse processo não for concluído.
          </p>
        </section>
        {children}
      </article>
      <footer className="legal-footer">
        {links.map(([label, href]) => (
          <a href={href} key={href}>
            {label}
          </a>
        ))}
        <a href="/contato">Contato</a>
      </footer>
    </main>
  );
}
