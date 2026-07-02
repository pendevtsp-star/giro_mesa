import { Clock, Leaf, Plus } from "lucide-react";

const menu = [
  ["Burger Classico", "Blend da casa, queijo, molho especial e pao brioche.", "R$ 32,00"],
  ["Pizza meia lua", "Mussarela, tomate, manjericao e borda crocante.", "R$ 58,00"],
  ["Chopp Pilsen 400ml", "Tirado na hora, gelado e com colarinho cremoso.", "R$ 14,00"],
  ["Brownie da casa", "Chocolate intenso, sorvete e calda quente.", "R$ 22,00"],
] as const;

export default async function MenuPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;

  return (
    <main className="menu-shell">
      <header className="menu-hero">
        <a className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>{tenantSlug}</span>
        </a>
        <h1>Cardapio digital</h1>
        <p>
          Produtos, disponibilidade, horarios e precos por canal ficam sincronizados com o painel.
        </p>
      </header>
      <section className="menu-list">
        {menu.map(([name, description, price]) => (
          <article className="menu-item" key={name}>
            <div>
              <h2>{name}</h2>
              <p>{description}</p>
              <span>
                <Leaf size={14} /> Alergenos e informacoes nutricionais configuraveis
              </span>
            </div>
            <div>
              <strong>{price}</strong>
              <button className="button secondary" type="button" aria-label={`Adicionar ${name}`}>
                <Plus size={18} />
              </button>
            </div>
          </article>
        ))}
      </section>
      <footer className="footer">
        <Clock size={16} /> Horarios, taxa de servico e pedidos por QR dependem da configuracao do
        estabelecimento.
      </footer>
    </main>
  );
}
