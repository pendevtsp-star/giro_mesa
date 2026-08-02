"use client";

import { escapeHtml, renderBrandedPrintDocument } from "@giromesa/domain";
import {
  BellRing,
  Circle,
  CircleCheck,
  ClipboardList,
  FileText,
  Minus,
  Plus,
  QrCode,
  ReceiptText,
  Search,
  Send,
  X,
} from "lucide-react";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  createPublicQrOrder,
  createSecurePublicOrder,
  createSecureServiceRequest,
  formatMoney,
  getPublicMenu,
  getPublicProductModifiers,
  getPublicQr,
  getSecurePublicOrder,
  getSecurePublicQrContext,
  getSecureServiceRequest,
  type Product,
  type PublicMenuResponse,
  type PublicModifierGroup,
  type PublicQrResponse,
  requestPublicQrAction,
  type SecurePublicOrderSummary,
} from "../../../lib/giromesa-api";

type ModifierSelection = {
  groupId: string;
  optionId: string;
  name: string;
  priceDeltaCents: number;
};

type CartLine = {
  productId: string;
  name: string;
  quantity: number;
  priceCents: number;
  modifiers: ModifierSelection[];
};

export default function TableQrPage({ params }: { params: Promise<{ tableCode: string }> }) {
  const { tableCode } = use(params);
  const secureMode = tableCode.includes(".");
  const [qr, setQr] = useState<PublicQrResponse | null>(null);
  const [menu, setMenu] = useState<PublicMenuResponse | null>(null);
  const [fatalError, setFatalError] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [status, setStatus] = useState("Escolha itens do cardápio ou chame o atendimento.");
  const [productQuery, setProductQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isBusy, setIsBusy] = useState(false);
  const [publicOrder, setPublicOrder] = useState<SecurePublicOrderSummary["order"]>(null);
  const [serviceRequest, setServiceRequest] = useState<{
    id: string;
    type: string;
    status: string;
  } | null>(null);

  const [modifierModalProduct, setModifierModalProduct] = useState<
    PublicMenuResponse["products"][number] | null
  >(null);
  const [modifierGroups, setModifierGroups] = useState<PublicModifierGroup[]>([]);
  const [modifierSelections, setModifierSelections] = useState<Record<string, ModifierSelection>>(
    {},
  );
  const [modifierLoading, setModifierLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`giromesa:qr-cart:${tableCode}`);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setCart(
            parsed.filter((line): line is CartLine =>
              Boolean(
                line &&
                  typeof line === "object" &&
                  typeof (line as CartLine).productId === "string" &&
                  typeof (line as CartLine).name === "string" &&
                  Number.isInteger((line as CartLine).quantity) &&
                  (line as CartLine).quantity > 0 &&
                  Number.isInteger((line as CartLine).priceCents),
              ),
            ),
          );
        }
      }
    } catch {
      window.localStorage.removeItem(`giromesa:qr-cart:${tableCode}`);
    } finally {
      setCartHydrated(true);
    }
  }, [tableCode]);

  useEffect(() => {
    if (!cartHydrated) return;
    window.localStorage.setItem(`giromesa:qr-cart:${tableCode}`, JSON.stringify(cart));
  }, [cart, cartHydrated, tableCode]);

  useEffect(() => {
    let ignore = false;
    const request = secureMode
      ? getSecurePublicQrContext(tableCode).then((context) => {
          const configuredBranding = context.tenant.branding;
          const branding = {
            displayName: configuredBranding.displayName,
            logoUrl: configuredBranding.logoUrl,
            themeMode: configuredBranding.themeMode,
            accentPreset: configuredBranding.accentPreset,
          };
          return {
            qr: {
              tenant: {
                id: "resolved-by-token",
                name: context.tenant.name,
                slug: "",
                branding,
              },
              capabilities: context.capabilities,
              reviewBeforeKds: context.reviewBeforeKds,
              ...(context.qrSettings ? { qrSettings: context.qrSettings } : {}),
              table: {
                id: context.table.id,
                branchId: context.branchId,
                code: context.table.code,
                name: context.table.name,
                status: context.table.status,
                active: context.table.active,
              },
            } satisfies PublicQrResponse,
            menu: {
              tenant: {
                id: "resolved-by-token",
                name: context.tenant.name,
                slug: "",
                branding,
              },
              categories: context.categories,
              products: context.products.map((product) => ({
                ...product,
                isAvailable: true,
                isClubEligible: false,
                bottleVolumeMl: null,
                defaultDoseMl: 50,
                spiritType: null,
              })),
            } satisfies PublicMenuResponse,
          };
        })
      : getPublicQr(tableCode).then(async (qrResponse) => ({
          qr: qrResponse,
          menu: await getPublicMenu(qrResponse.tenant.slug),
        }));
    request
      .then(async (qrResponse) => {
        if (!ignore) {
          setQr(qrResponse.qr);
          setMenu(qrResponse.menu);
          setFatalError("");
        }
      })
      .catch(() => {
        if (!ignore) {
          setFatalError(
            secureMode
              ? "Este QR é inválido, foi revogado ou não pertence mais a esta mesa."
              : "Este QR é inválido ou o atendimento está indisponível no momento.",
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [secureMode, tableCode]);

  useEffect(() => {
    if (!secureMode || !qr?.table.active) {
      setPublicOrder(null);
      return;
    }
    let ignore = false;
    const refreshOrder = async () => {
      try {
        const response = await getSecurePublicOrder(tableCode);
        if (!ignore) setPublicOrder(response.order);
      } catch {
        if (!ignore) setPublicOrder(null);
      }
    };
    void refreshOrder();
    const timer = window.setInterval(() => void refreshOrder(), 15_000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [qr?.table.active, secureMode, tableCode]);

  useEffect(() => {
    if (
      !secureMode ||
      !serviceRequest ||
      serviceRequest.status === "resolved" ||
      serviceRequest.status === "canceled"
    )
      return;
    let ignore = false;
    const refreshRequest = async () => {
      try {
        const current = await getSecureServiceRequest(tableCode, serviceRequest.id);
        if (!ignore) setServiceRequest(current);
      } catch {
        // Keep the last known status if the token is rotated while this page is open.
      }
    };
    const timer = window.setInterval(() => void refreshRequest(), 5_000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [secureMode, serviceRequest, tableCode]);

  const totalCents = cart.reduce((sum, line) => sum + line.quantity * line.priceCents, 0);
  const categoryOptions = useMemo(
    () => [
      ["all", "Todos"],
      ...(menu?.categories ?? []).map((category) => [category.id, category.name] as const),
    ],
    [menu?.categories],
  );
  const visibleProducts = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase();
    return (menu?.products ?? [])
      .filter((product) => product.isAvailable)
      .filter((product) => categoryFilter === "all" || product.categoryId === categoryFilter)
      .filter((product) =>
        `${product.name} ${product.description ?? ""}`.toLowerCase().includes(normalizedQuery),
      );
  }, [categoryFilter, menu?.products, productQuery]);
  const branding = qr?.tenant.branding ?? menu?.tenant.branding;
  const brandInitial = branding?.displayName.slice(0, 1).toUpperCase() || "G";
  const activeOrderTotal = publicOrder?.totalCents ?? totalCents;
  const activeOrderRemaining = publicOrder?.remainingCents ?? activeOrderTotal;
  const hasActiveOrder = Boolean(publicOrder);
  const useNightShell = branding?.themeMode === "dark";
  const showTenantLogo = qr?.qrSettings?.showLogo !== false;
  const customInstruction = qr?.qrSettings?.instruction?.trim();
  const welcomeMessage = qr?.qrSettings?.welcomeMessage?.trim();
  const menuHeadline = qr?.qrSettings?.menuHeadline?.trim();

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
        {
          productId: product.id,
          name: product.name,
          priceCents: product.priceCents,
          quantity: 1,
          modifiers: [],
        },
      ];
    });
  }

  function addProductWithModifiers(
    product: PublicMenuResponse["products"][number],
    selections: ModifierSelection[],
  ) {
    const modifierDelta = selections.reduce((sum, s) => sum + s.priceDeltaCents, 0);
    setCart((current) => [
      ...current,
      {
        productId: product.id,
        name: product.name,
        priceCents: product.priceCents + modifierDelta,
        quantity: 1,
        modifiers: selections,
      },
    ]);
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

  const openModifierModal = useCallback(async (product: PublicMenuResponse["products"][number]) => {
    setModifierModalProduct(product);
    setModifierSelections({});
    setModifierLoading(true);
    try {
      const groups = await getPublicProductModifiers(product.id);
      setModifierGroups(groups);
    } catch {
      setModifierGroups([]);
    } finally {
      setModifierLoading(false);
    }
  }, []);

  const closeModifierModal = useCallback(() => {
    setModifierModalProduct(null);
    setModifierGroups([]);
    setModifierSelections({});
  }, []);

  function toggleModifierOption(
    groupId: string,
    option: { id: string; name: string; priceDeltaCents: number },
    group: PublicModifierGroup,
  ) {
    setModifierSelections((prev) => {
      const next = { ...prev };
      if (group.maxChoices <= 1) {
        if (next[groupId]?.optionId === option.id) {
          delete next[groupId];
        } else {
          next[groupId] = {
            groupId,
            optionId: option.id,
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
          };
        }
      } else {
        const currentSelections = Object.values(next).filter((s) => s.optionId !== option.id);
        if (next[`${groupId}__${option.id}`]) {
          delete next[`${groupId}__${option.id}`];
        } else {
          if (currentSelections.length < group.maxChoices) {
            next[`${groupId}__${option.id}`] = {
              groupId,
              optionId: option.id,
              name: option.name,
              priceDeltaCents: option.priceDeltaCents,
            };
          }
        }
      }
      return next;
    });
  }

  function confirmModifierSelection() {
    if (!modifierModalProduct) return;
    const selections = Object.values(modifierSelections);
    const requiredGroups = modifierGroups.filter((g) => g.isRequired);
    const missingRequired = requiredGroups.filter(
      (g) => !selections.some((s) => g.options.some((o) => o.id === s.optionId)),
    );
    if (missingRequired.length > 0) {
      setStatus(
        `Selecione pelo menos uma opção em: ${missingRequired.map((g) => g.name).join(", ")}`,
      );
      return;
    }
    addProductWithModifiers(modifierModalProduct, selections);
    closeModifierModal();
  }

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao executar ação.");
    } finally {
      setIsBusy(false);
    }
  }

  function submitOrder() {
    void run(async () => {
      if (!qr || cart.length === 0) {
        throw new Error("Adicione pelo menos um item ao pedido.");
      }
      if (secureMode && qr.table.active === false) {
        throw new Error("O atendimento desta mesa ainda não foi ativado pela equipe.");
      }
      const items = cart.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        modifiers: line.modifiers.map((m) => ({ optionId: m.optionId })),
      }));
      const orderPayload = JSON.stringify(items);
      const response = secureMode
        ? await createSecurePublicOrder(
            tableCode,
            idempotencyKey(tableCode, "order", orderPayload),
            { items },
          )
        : await createPublicQrOrder(tableCode, {
            tenantSlug: qr.tenant.slug,
            items,
          });
      if (secureMode) {
        const latest = await getSecurePublicOrder(tableCode);
        setPublicOrder(latest.order);
        window.sessionStorage.removeItem(`giromesa:qr:${tableCode}:order:${orderPayload}`);
      }
      setCart([]);
      setStatus(`Pedido ${response.orderId.slice(0, 8)} enviado para o salão.`);
    });
  }

  function callWaiter() {
    void run(async () => {
      if (!qr) return;
      if (secureMode) {
        const request = await createSecureServiceRequest(
          tableCode,
          idempotencyKey(tableCode, "call-waiter"),
          { type: "call_waiter" },
        );
        setServiceRequest(request);
      } else {
        await requestPublicQrAction(tableCode, "call-waiter", { tenantSlug: qr.tenant.slug });
      }
      setStatus("Garçom chamado. A solicitação ficou registrada no painel.");
    });
  }

  function requestPreBill() {
    void run(async () => {
      if (!qr) return;
      if (secureMode) {
        const request = await createSecureServiceRequest(
          tableCode,
          idempotencyKey(tableCode, "request-pre-bill"),
          { type: "request_pre_bill" },
        );
        setServiceRequest(request);
      } else {
        await requestPublicQrAction(tableCode, "pre-bill", { tenantSlug: qr.tenant.slug });
      }
      setStatus("Pré-conta solicitada. O caixa recebeu o pedido de fechamento.");
    });
  }

  function openTableSummary() {
    void run(async () => {
      if (!qr) return;
      let printLines = cart.map((line) => ({
        name: line.name,
        quantity: line.quantity,
        unitPriceCents: line.priceCents,
        totalCents: line.priceCents * line.quantity,
      }));
      let printTotalCents = totalCents;
      let documentSubtitle =
        "Conferência visual do pedido montado pelo cliente antes do envio ou da solicitação de pré-conta.";

      if (secureMode) {
        const response = await getSecurePublicOrder(tableCode);
        if (!response.order) {
          throw new Error("A comanda desta mesa ainda não possui consumo registrado.");
        }
        printLines = response.order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
        }));
        printTotalCents = response.order.totalCents;
        setPublicOrder(response.order);
        documentSubtitle =
          "Resumo da comanda atual, carregado diretamente do atendimento registrado pelo estabelecimento.";
      } else if (printLines.length === 0) {
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
        subtitle: documentSubtitle,
        metadata: [
          { label: "Mesa", value: qr.table.code },
          { label: "Cliente", value: "Atendimento via QR" },
          { label: "Gerado em", value: new Date().toLocaleString("pt-BR") },
        ],
        metrics: [
          {
            label: "Itens",
            value: String(printLines.reduce((sum, line) => sum + line.quantity, 0)),
          },
          { label: "Linhas", value: String(printLines.length) },
          {
            label: secureMode ? "Total da comanda" : "Total estimado",
            value: formatMoney(printTotalCents),
          },
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
              <tbody>${printLines
                .map(
                  (line) => `
                    <tr>
                      <td>${escapeHtml(String(line.quantity))}</td>
                      <td>${escapeHtml(line.name)}</td>
                      <td>${escapeHtml(formatMoney(line.unitPriceCents))}</td>
                      <td>${escapeHtml(formatMoney(line.totalCents))}</td>
                    </tr>`,
                )
                .join("")}</tbody>
            </table>
          </section>
        `,
        footerNote:
          "Resumo sem valor fiscal, sem dados pessoais e carregado apenas para a mesa identificada pelo QR.",
      });

      popup.document.write(html);
      popup.document.close();
      popup.focus();
      popup.print();
      setStatus("Resumo visual da mesa aberto para impressão.");
    });
  }

  if (fatalError) {
    return (
      <main className="menu-shell menu-shell-night table-qr-shell">
        <section className="qr-card" role="alert">
          <span className="section-kicker">
            <QrCode size={18} /> QR indisponível
          </span>
          <h1>Não foi possível abrir esta mesa</h1>
          <p>{fatalError}</p>
          <p>Peça à equipe do estabelecimento um material atualizado.</p>
        </section>
      </main>
    );
  }

  if (!qr || !menu) {
    return (
      <main className="menu-shell menu-shell-night table-qr-shell">
        <section className="qr-card" role="status">
          <span className="section-kicker">
            <QrCode size={18} /> Carregando QR
          </span>
          <p>Consultando o atendimento desta mesa...</p>
        </section>
      </main>
    );
  }

  const capabilities = new Set(
    qr.capabilities ?? ["menu", "order", "view_tab", "call_waiter", "request_pre_bill"],
  );
  const canOrder = capabilities.has("order") && (qr.table.active !== false || !secureMode);
  const canCallWaiter = capabilities.has("call_waiter");
  const canRequestPreBill = capabilities.has("request_pre_bill") && secureMode;

  return (
    <main
      className={`menu-shell table-qr-shell${useNightShell ? " menu-shell-night" : ""}`}
      data-theme={branding?.themeMode ?? "light"}
      data-accent={branding?.accentPreset ?? "emerald"}
    >
      <header className="menu-hero table-qr-hero">
        <a
          className="brand"
          href={secureMode ? "#" : `/m/${qr.tenant.slug}`}
          aria-label={branding?.displayName}
        >
          <span
            className={
              showTenantLogo && branding?.logoUrl ? "brand-mark brand-mark-logo" : "brand-mark"
            }
            style={
              showTenantLogo && branding?.logoUrl
                ? { backgroundImage: `url(${branding.logoUrl})` }
                : undefined
            }
          >
            {showTenantLogo && branding?.logoUrl ? "" : brandInitial}
          </span>
          <span>{branding?.displayName ?? qr.tenant.name}</span>
        </a>
        <span className="eyebrow">
          <QrCode size={18} /> Mesa {qr.table.code}
        </span>
        <h1>{branding?.displayName ?? qr.tenant.name}</h1>
        <p>
          {welcomeMessage ||
            customInstruction ||
            "Monte seu pedido, chame atendimento ou solicite a pré-conta da mesa."}
        </p>
      </header>

      <section className="qr-order-grid">
        <article className="qr-card">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Cardápio</span>
              <h2>{menuHeadline || "Pedido da mesa"}</h2>
            </div>
            {!secureMode ? (
              <a className="button secondary" href={`/m/${qr.tenant.slug}`}>
                <ClipboardList size={17} /> Cardápio completo
              </a>
            ) : null}
          </div>
          <div className="qr-menu-tools">
            <label className="search-box">
              <Search size={16} />
              <input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Buscar prato, bebida ou sobremesa"
              />
            </label>
            <div className="filter-row">
              {categoryOptions.map(([value, label]) => (
                <button
                  className={`filter ${categoryFilter === value ? "selected" : ""}`}
                  type="button"
                  key={value}
                  onClick={() => setCategoryFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="qr-menu-list">
            {visibleProducts.length ? (
              visibleProducts.map((product) => (
                <button
                  className="qr-menu-row"
                  type="button"
                  key={product.id}
                  onClick={() =>
                    (product.modifierGroupCount ?? 0) > 0
                      ? openModifierModal(product)
                      : addProduct(product)
                  }
                  disabled={isBusy}
                >
                  {product.imageUrl && (
                    // biome-ignore lint/performance/noImgElement: tenant URLs are dynamic and not eligible for a fixed Next Image allowlist.
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      style={{
                        width: 44,
                        height: 44,
                        objectFit: "cover",
                        borderRadius: 6,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <strong>{product.name}</strong>
                    <span>{product.description}</span>
                  </div>
                  <small>{formatMoney(product.priceCents)}</small>
                  <Plus size={18} />
                </button>
              ))
            ) : (
              <p className="muted-copy">Nenhum item encontrado para esse filtro.</p>
            )}
          </div>
        </article>

        <article className="qr-card">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Comanda</span>
              <h2>{publicOrder ? "Comanda atual" : `${cart.length} item(ns)`}</h2>
            </div>
            <strong>{formatMoney(activeOrderTotal)}</strong>
          </div>
          <div className="qr-cart">
            {cart.length === 0 ? <p>Nenhum item selecionado ainda.</p> : null}
            {cart.map((line) => (
              <div
                className="qr-cart-row"
                key={`${line.productId}-${line.modifiers.map((m) => m.optionId).join(",")}`}
              >
                <div>
                  <strong>{line.name}</strong>
                  {line.modifiers.length > 0 && (
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      {line.modifiers.map((m) => m.name).join(", ")}
                    </span>
                  )}
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
          {publicOrder ? (
            <section
              aria-label="Status da comanda"
              style={{
                display: "grid",
                gap: 8,
                margin: "14px 0",
                borderTop: "1px solid var(--line)",
                paddingTop: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>Status</span>
                <strong>{orderStatusLabel(publicOrder.status)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>Recebido</span>
                <strong>{formatMoney(publicOrder.receivedCents ?? 0)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>Restante</span>
                <strong>{formatMoney(activeOrderRemaining)}</strong>
              </div>
              {publicOrder.timeline?.length ? (
                <ol
                  aria-label="Acompanhamento do pedido"
                  style={{
                    display: "grid",
                    gap: 6,
                    margin: "4px 0 0",
                    padding: 0,
                    listStyle: "none",
                  }}
                >
                  {publicOrder.timeline.map((step) => (
                    <li
                      key={step.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color:
                          step.state === "pending"
                            ? "var(--muted)"
                            : step.state === "canceled"
                              ? "#b42331"
                              : "var(--ink)",
                        fontWeight: step.state === "active" ? 700 : 500,
                      }}
                    >
                      {step.state === "pending" ? (
                        <Circle size={14} aria-hidden="true" />
                      ) : (
                        <CircleCheck size={14} aria-hidden="true" />
                      )}
                      <span>{step.label}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ) : null}
          <button
            className="button primary full"
            type="button"
            onClick={submitOrder}
            disabled={isBusy || !canOrder}
          >
            <Send size={17} /> Enviar pedido
          </button>
        </article>
      </section>

      <section className="qr-actions">
        {canCallWaiter ? (
          <button className="qr-action" type="button" onClick={callWaiter} disabled={isBusy}>
            <BellRing size={26} />
            <div>
              <h2>Chamar garçom</h2>
              <p>Solicitação registrada para o painel do salão.</p>
            </div>
          </button>
        ) : null}
        {canRequestPreBill ? (
          <button
            className="qr-action"
            type="button"
            onClick={requestPreBill}
            disabled={isBusy || !hasActiveOrder}
          >
            <ReceiptText size={26} />
            <div>
              <h2>Pedir pré-conta</h2>
              <p>
                {hasActiveOrder
                  ? "O caixa recebe o pedido de fechamento da mesa."
                  : "A comanda ainda não possui consumo registrado."}
              </p>
            </div>
          </button>
        ) : null}
        <button className="qr-action" type="button" onClick={openTableSummary} disabled={isBusy}>
          <FileText size={26} />
          <div>
            <h2>Resumo da mesa</h2>
            <p>Abra um documento visual com os itens montados e total estimado.</p>
          </div>
        </button>
      </section>
      <footer className="qr-note">{status}</footer>
      {serviceRequest ? (
        <p className="qr-note" role="status">
          Atendimento: {serviceRequestStatusLabel(serviceRequest.status)}.
        </p>
      ) : null}
      {qr.qrSettings?.marketingEnabled !== false ? (
        <p className="qr-marketing-note">
          Tecnologia <a href="https://giromesa.com.br">GiroMesa</a> para uma operação mais simples.
        </p>
      ) : null}

      {modifierModalProduct && (
        <dialog
          open
          className="modifier-modal-overlay"
          aria-label="Fechar opções do produto"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
            border: 0,
            width: "auto",
            maxWidth: "none",
            maxHeight: "none",
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModifierModal();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeModifierModal();
          }}
        >
          <div
            className="modifier-modal"
            role="dialog"
            aria-modal="true"
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 480,
              width: "100%",
              maxHeight: "85vh",
              overflow: "auto",
              padding: 24,
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "start",
                marginBottom: 16,
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>{modifierModalProduct.name}</h2>
                {modifierModalProduct.description && (
                  <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                    {modifierModalProduct.description}
                  </p>
                )}
                <p style={{ margin: "8px 0 0", fontWeight: 600 }}>
                  {formatMoney(modifierModalProduct.priceCents)}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={closeModifierModal}
                aria-label="Fechar"
                style={{ flexShrink: 0 }}
              >
                <X size={20} />
              </button>
            </div>

            {modifierLoading ? (
              <p className="muted-copy" style={{ textAlign: "center", padding: 24 }}>
                Carregando opções...
              </p>
            ) : modifierGroups.length === 0 ? (
              <p className="muted-copy" style={{ textAlign: "center", padding: 24 }}>
                Nenhuma opção de personalização disponível.
              </p>
            ) : (
              modifierGroups.map((group) => (
                <div key={group.id} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      marginBottom: 8,
                    }}
                  >
                    <strong>{group.name}</strong>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      {group.isRequired ? "Obrigatório" : "Opcional"}
                      {group.maxChoices > 1 ? ` (até ${group.maxChoices})` : ""}
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {group.options.map((option) => {
                      const isSelected = Object.values(modifierSelections).some(
                        (s) => s.optionId === option.id,
                      );
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleModifierOption(group.id, option, group)}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 12px",
                            border: `1px solid ${isSelected ? "var(--accent-strong, #10b981)" : "var(--line)"}`,
                            borderRadius: 8,
                            background: isSelected ? "#f0fdf4" : "#fbfcfa",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <span>{option.name}</span>
                          {option.priceDeltaCents !== 0 && (
                            <small style={{ color: "var(--muted)" }}>
                              {option.priceDeltaCents > 0 ? "+" : ""}
                              {formatMoney(option.priceDeltaCents)}
                            </small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}

            <button
              className="button primary full"
              type="button"
              onClick={confirmModifierSelection}
              disabled={modifierLoading}
              style={{ marginTop: 8 }}
            >
              <Plus size={17} /> Adicionar ao pedido
            </button>
          </div>
        </dialog>
      )}
    </main>
  );
}

function idempotencyKey(token: string, action: string, payload = "") {
  const storageKey = `giromesa:qr:${token}:${action}:${payload}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) {
    return existing;
  }
  const value = window.crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, value);
  return value;
}

function orderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    opened: "Recebido",
    sent_to_kitchen: "Enviado para produÃ§Ã£o",
    preparing: "Em preparo",
    ready: "Pronto para servir",
    served: "Entregue Ã  mesa",
    waiting_payment: "Aguardando pagamento",
    partially_paid: "Pagamento parcial",
    paid: "Pago",
    canceled: "Cancelado",
    refunded: "Estornado",
  };
  return labels[status] ?? status;
}

function serviceRequestStatusLabel(status: string) {
  return (
    {
      pending: "aguardando a equipe",
      acknowledged: "equipe a caminho",
      resolved: "resolvido",
      canceled: "cancelado",
    }[status] ?? "em acompanhamento"
  );
}
