import { BellRing, ClipboardList, QrCode, ReceiptText } from "lucide-react";

export default async function TableQrPage({ params }: { params: Promise<{ tableCode: string }> }) {
  const { tableCode } = await params;

  return (
    <main className="menu-shell">
      <header className="menu-hero">
        <span className="eyebrow">
          <QrCode size={18} /> Mesa {tableCode}
        </span>
        <h1>Comanda da mesa</h1>
        <p>
          O QR Code pode funcionar como cardapio visual ou pedido pelo cliente, conforme permissao.
        </p>
      </header>
      <section className="section">
        <div className="grid">
          <a className="feature" href="/m/demo">
            <ClipboardList size={24} />
            <h2>Ver cardapio</h2>
            <p>Produtos disponiveis para a unidade e canal QR.</p>
          </a>
          <button className="feature" type="button">
            <BellRing size={24} />
            <h2>Chamar garcom</h2>
            <p>Gera evento auditavel para atendimento da mesa.</p>
          </button>
          <button className="feature" type="button">
            <ReceiptText size={24} />
            <h2>Pedir pre-conta</h2>
            <p>Envia solicitacao ao caixa ou garcom responsavel.</p>
          </button>
        </div>
      </section>
    </main>
  );
}
