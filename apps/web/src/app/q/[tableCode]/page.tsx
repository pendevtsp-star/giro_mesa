"use client";

import { escapeHtml, renderBrandedPrintDocument } from "@giromesa/domain";
import {
  BellRing,
  ClipboardList,
  FileText,
  Minus,
  Plus,
  QrCode,
  ReceiptText,
  Send,
} from "lucide-react";
import { use, useEffect, useMemo, useState } from "react";
import {
  createPublicQrOrder,
  formatMoney,
  getPublicMenu,
  getPublicQr,
  type Product,
  type PublicMenuResponse,
  type PublicQrResponse,
  requestPublicQrAction,
} from "../../../lib/giromesa-api";

type CartLine = {
  productId: string;
  name: string;
  quantity: number;
  priceCents: number;
};

const fallbackQr: PublicQrResponse = {
  tenant: {
    id: "demo",
    name: "Bar Aurora",
    slug: "bar-aurora-demo",
    branding: {
      displayName: "Bar Aurora",
      logoUrl: null,
      themeMode: "light",
      accentPreset: "emerald",
    },
  },
  table: { id: "demo-table", branchId: "demo", code: "M03", name: "Mesa 3", status: "free" },
};

const fallbackMenu: PublicMenuResponse = {
  tenant: fallbackQr.tenant,
  categories: [],
  products: [
    {
      id: "demo-burger",
      name: "Burger Classico",
      description: "Blend da casa, queijo prato, molho especial e pao brioche.",
      categoryId: null,
      priceCents: 3200,
      imageUrl: null,
      isAvailable: true,
      channels: ["qr"],
      isClubEligible: false,
      bottleVolumeMl: null,
      defaultDoseMl: 50,
      spiritType: null,
    },
    {
      id: "demo-chopp",
      name: "Chopp Pilsen 400ml",
      description: "Tirado na hora, gelado e com colarinho cremoso.",
      categoryId: null,
      priceCents: 1400,
      imageUrl: null,
      isAvailable: true,
      channels: ["qr"],
      isClubEligible: false,
      bottleVolumeMl: null,
      defaultDoseMl: 50,
      spiritType: null,
    },
  ],
};

export default function TableQrPage({ params }: { params: Promise<{ tableCode: string }> }) {
  const { tableCode } = use(params);
  const [qr, setQr] = useState<PublicQrResponse>(fallbackQr);
  const [menu, setMenu] = useState<PublicMenuResponse>(fallbackMenu);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [status, setStatus] = useState("Escolha itens do cardapio ou chame o atendimento.");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    getPublicQr(tableCode)
      .then(async (qrResponse) => {
        const menuResponse = await getPublicMenu(qrResponse.tenant.slug);
        if (!ignore) {
          setQr(qrResponse);
          setMenu(menuResponse);
        }
      })
      .catch(() => {
        if (!ignore) {
          setQr({ ...fallbackQr, table: { ...fallbackQr.table, code: tableCode } });
          setMenu(fallbackMenu);
        }
      });

    return () => {
      ignore = true;
    };
  }, [tableCode]);

  const totalCents = cart.reduce((sum, line) => sum + line.quantity * line.priceCents, 0);
  const visibleProducts = useMemo(() => menu.products.slice(0, 6), [menu.products]);
  const branding = qr.tenant.branding ?? menu.tenant.branding ?? fallbackQr.tenant.branding;
  const brandInitial = branding?.displayName.slice(0, 1).toUpperCase() || "G";

  function addProduct(product: Pick<Product, "id" | "name" | "priceCents">) {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        { productId: product.id, name: product.name, priceCents: product.priceCents, quantity: 1 },
      ];
    });
  }

  function removeProduct(productId: string) {
    setCart((current) =>
      current
        .map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity - 1 } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao executar acao.");
    } finally {
      setIsBusy(false);
    }
  }

  function submitOrder() {
    void run(async () => {
      if (cart.length === 0) {
        throw new Error("Adicione pelo menos um item ao pedido.");
      }
      const response = await createPublicQrOrder(tableCode, {
        tenantSlug: qr.tenant.slug,
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      });
      setCart([]);
      setStatus(`Pedido ${response.orderId.slice(0, 8)} enviado para o salao.`);
    });
  }

  function callWaiter() {
    void run(async () => {
      await requestPublicQrAction(tableCode, "call-waiter", { tenantSlug: qr.tenant.slug });
      setStatus("Garçom chamado. A solicitação ficou registrada no painel.");
    });
  }

  function requestPreBill() {
    void run(async () => {
      await requestPublicQrAction(tableCode, "pre-bill", { tenantSlug: qr.tenant.slug });
      setStatus("Pre-conta solicitada. O caixa recebeu o pedido de fechamento.");
    });
  }

  function openTableSummary() {
    void run(async () => {
      if (cart.length === 0) {
        throw new Error("Adicione itens para visualizar o resumo da mesa.");
      }

      const popup = window.open("", "_blank", "width=1080,height=820");
      if (!popup) {
        throw new Error("Não foi possível abrir a janela de resumo.");
      }

      const html = renderBrandedPrintDocument({
        branding: {
          displayName: branding?.displayName ?? qr.tenant.name,
          logoUrl: branding?.logoUrl ?? null,
          accentPreset: branding?.accentPreset ?? "emerald",
        },
        documentLabel: "Resumo da mesa",
        title: `Mesa ${qr.table.code}`,
        subtitle:
          "Conferência visual do pedido montado pelo cliente antes do envio ou da solicitação de pré-conta.",
        metadata: [
          { label: "Mesa", value: qr.table.code },
          { label: "Cliente", value: "Atendimento via QR" },
          { label: "Gerado em", value: new Date().toLocaleString("pt-BR") },
        ],
        metrics: [
          { label: "Itens", value: String(cart.reduce((sum, line) => sum + line.quantity, 0)) },
          { label: "Linhas", value: String(cart.length) },
          { label: "Total estimado", value: formatMoney(totalCents) },
        ],
        bodyHtml: `
          <section class="section">
            <h2>Itens selecionados</h2>
            <table>
              <thead>
                <tr>
                  <th>Qtd</th>
                  <th>Item</th>
                  <th>Unitario</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${cart
                .map(
                  (line) => `
                    <tr>
                      <td>${escapeHtml(String(line.quantity))}</td>
                      <td>${escapeHtml(line.name)}</td>
                      <td>${escapeHtml(formatMoney(line.priceCents))}</td>
                      <td>${escapeHtml(formatMoney(line.priceCents * line.quantity))}</td>
                    </tr>`,
                )
                .join("")}</tbody>
            </table>
          </section>
        `,
        footerNote:
          "Resumo visual sem valor fiscal, pensado para transparencia do cliente e fluidez do atendimento em mesa.",
      });

      popup.document.write(html);
      popup.document.close();
      popup.focus();
      popup.print();
      setStatus("Resumo visual da mesa aberto para impressao.");
    });
  }

  return (
    <main
      className="menu-shell table-qr-shell"
      data-theme={branding?.themeMode ?? "light"}
      data-accent={branding?.accentPreset ?? "emerald"}
    >
      <header className="menu-hero table-qr-hero">
        <a className="brand" href={`/m/${qr.tenant.slug}`} aria-label={branding?.displayName}>
          <span
            className={branding?.logoUrl ? "brand-mark brand-mark-logo" : "brand-mark"}
            style={branding?.logoUrl ? { backgroundImage: `url(${branding.logoUrl})` } : undefined}
          >
            {branding?.logoUrl ? "" : brandInitial}
          </span>
          <span>{branding?.displayName ?? qr.tenant.name}</span>
        </a>
        <span className="eyebrow">
          <QrCode size={18} /> Mesa {qr.table.code}
        </span>
        <h1>{branding?.displayName ?? qr.tenant.name}</h1>
        <p>Monte seu pedido, chame atendimento ou solicite a pré-conta da mesa.</p>
      </header>

      <section className="qr-order-grid">
        <article className="qr-card">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Cardápio</span>
              <h2>Pedido da mesa</h2>
            </div>
            <a className="button secondary" href={`/m/${qr.tenant.slug}`}>
              <ClipboardList size={17} /> Cardápio completo
            </a>
          </div>
          <div className="qr-menu-list">
            {visibleProducts.map((product) => (
              <button
                className="qr-menu-row"
                type="button"
                key={product.id}
                onClick={() => addProduct(product)}
                disabled={isBusy}
              >
                <div>
                  <strong>{product.name}</strong>
                  <span>{product.description}</span>
                </div>
                <small>{formatMoney(product.priceCents)}</small>
                <Plus size={18} />
              </button>
            ))}
          </div>
        </article>

        <article className="qr-card">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Comanda</span>
              <h2>{cart.length} item(ns)</h2>
            </div>
            <strong>{formatMoney(totalCents)}</strong>
          </div>
          <div className="qr-cart">
            {cart.length === 0 ? <p>Nenhum item selecionado ainda.</p> : null}
            {cart.map((line) => (
              <div className="qr-cart-row" key={line.productId}>
                <div>
                  <strong>{line.name}</strong>
                  <span>
                    {line.quantity} x {formatMoney(line.priceCents)}
                  </span>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => removeProduct(line.productId)}
                  disabled={isBusy}
                  aria-label={`Remover ${line.name}`}
                >
                  <Minus size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="button primary full"
            type="button"
            onClick={submitOrder}
            disabled={isBusy}
          >
            <Send size={17} /> Enviar pedido
          </button>
        </article>
      </section>

      <section className="qr-actions">
        <button className="qr-action" type="button" onClick={callWaiter} disabled={isBusy}>
          <BellRing size={26} />
          <div>
            <h2>Chamar garçom</h2>
            <p>Solicitacao registrada para o painel do salao.</p>
          </div>
        </button>
        <button
          className="qr-action"
          type="button"
          onClick={requestPreBill}
          disabled={isBusy || cart.length === 0}
        >
          <ReceiptText size={26} />
          <div>
            <h2>Pedir pré-conta</h2>
            <p>
              {cart.length
                ? "O caixa recebe o pedido de fechamento da mesa."
                : "Adicione itens para solicitar a pré-conta."}
            </p>
          </div>
        </button>
        <button className="qr-action" type="button" onClick={openTableSummary} disabled={isBusy}>
          <FileText size={26} />
          <div>
            <h2>Resumo da mesa</h2>
            <p>Abra um documento visual com os itens montados e total estimado.</p>
          </div>
        </button>
      </section>
      <footer className="qr-note">{status}</footer>
    </main>
  );
}
