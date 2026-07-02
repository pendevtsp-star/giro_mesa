import { LockKeyhole, Mail } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-art">
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <div>
          <h1>Entre no painel da operacao</h1>
          <p>Login com cookies seguros, MFA para perfis sensiveis e tenant resolvido no backend.</p>
        </div>
      </section>
      <section className="login-panel">
        <form className="form">
          <div>
            <h2>Acessar conta</h2>
            <p>Use as credenciais do estabelecimento ou da plataforma.</p>
          </div>
          <label className="field">
            <span>E-mail</span>
            <input type="email" placeholder="voce@empresa.com" autoComplete="email" />
          </label>
          <label className="field">
            <span>Senha</span>
            <input type="password" placeholder="Sua senha" autoComplete="current-password" />
          </label>
          <button className="button primary" type="button">
            <LockKeyhole size={18} /> Entrar
          </button>
          <a className="button secondary" href="mailto:suporte@example.com">
            <Mail size={18} /> Suporte
          </a>
        </form>
      </section>
    </main>
  );
}
