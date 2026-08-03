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
import { normalizeQrFontPreset } from "../../../features/qr/font-preset";
import {
  formatPublicQrMoney,
  getPublicQrCopy,
  normalizePublicQrLanguage,
  publicOrderStatusLabel,
  publicServiceStatusLabel,
  publicTimelineLabel,
} from "../../../features/qr/public-copy";
import {
  buildSecurePublicOrderEventsUrl,
  createPublicQrOrder,
  createSecurePublicOrder,
  createSecureServiceRequest,
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
  recordSecureQrAttribution,
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
  const [guestLabel, setGuestLabel] = useState("");
  const [status, setStatus] = useState("");
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
      const storedLabel = window.localStorage.getItem(`giromesa:qr-label:${tableCode}`);
      if (storedLabel) setGuestLabel(storedLabel.slice(0, 60));
    } catch {
      window.localStorage.removeItem(`giromesa:qr-cart:${tableCode}`);
    } finally {
      setCartHydrated(true);
    }
  }, [tableCode]);

  useEffect(() => {
    const value = guestLabel.trim();
    if (value) window.localStorage.setItem(`giromesa:qr-label:${tableCode}`, value);
    else window.localStorage.removeItem(`giromesa:qr-label:${tableCode}`);
  }, [guestLabel, tableCode]);

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
              ...(context.partnerAttribution
                ? { partnerAttribution: context.partnerAttribution }
                : {}),
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
    let eventSource: EventSource | null = null;
    let fallbackTimer: number | null = null;
    const refreshOrder = async () => {
      try {
        const response = await getSecurePublicOrder(tableCode);
        if (!ignore) setPublicOrder(response.order);
      } catch {
        if (!ignore) setPublicOrder(null);
      }
    };
    void refreshOrder();
    const startPollingFallback = () => {
      if (fallbackTimer === null) {
        fallbackTimer = window.setInterval(() => void refreshOrder(), 15_000);
      }
    };
    if (qr.capabilities?.includes("view_tab")) {
      try {
        eventSource = new EventSource(buildSecurePublicOrderEventsUrl(tableCode));
        eventSource.onmessage = (event) => {
          try {
            const snapshot = JSON.parse(event.data) as SecurePublicOrderSummary;
            if (!ignore) setPublicOrder(snapshot.order);
          } catch {
            startPollingFallback();
          }
        };
        eventSource.onerror = () => {
          eventSource?.close();
          eventSource = null;
          startPollingFallback();
        };
      } catch {
        startPollingFallback();
      }
    } else {
      startPollingFallback();
    }
    return () => {
      ignore = true;
      eventSource?.close();
      if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
    };
  }, [qr?.capabilities, qr?.table.active, secureMode, tableCode]);

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
  const language = normalizePublicQrLanguage(qr?.qrSettings?.language);
  const text = getPublicQrCopy(language);
  const categoryOptions = useMemo(
    () => [
      ["all", text.all],
      ...(menu?.categories ?? []).map((category) => [category.id, category.name] as const),
    ],
    [menu?.categories, text.all],
  );
  const visibleProducts = useMemo(() => {
    const normalizedQuery = productQuery.trim().toLowerCase();
    return (menu?.products ?? [])
      .filter((product) => product.isAvailable)
      .filter((product) => categoryFilter === "all" || product.categoryId === categoryFilter)
      .filter((product) =>
        `${product.name} ${product.description ?? ""}`.toLowerCase().includes(normalizedQuery),
      )
      .sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)));
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
  const coverUrl = qr?.qrSettings?.coverUrl?.trim();
  const campaignMessage = qr?.qrSettings?.campaignMessage?.trim();
  const houseInfo = qr?.qrSettings?.houseInfo?.trim();
  const highlights = qr?.qrSettings?.highlights?.filter(Boolean) ?? [];

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
      setStatus(text.chooseRequired(missingRequired.map((group) => group.name).join(", ")));
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
      setStatus(error instanceof Error ? error.message : text.genericFailure);
    } finally {
      setIsBusy(false);
    }
  }

  function recordAttribution(destination: "giromesa" | "doseclub") {
    if (secureMode) {
      void recordSecureQrAttribution(tableCode, destination).catch(() => undefined);
    }
  }

  function submitOrder() {
    void run(async () => {
      if (!qr || cart.length === 0) {
        throw new Error(text.addAtLeastOne);
      }
      if (secureMode && qr.table.active === false) {
        throw new Error(text.inactiveTable);
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
            { items, ...(guestLabel.trim() ? { guestLabel: guestLabel.trim() } : {}) },
          )
        : await createPublicQrOrder(tableCode, {
            items,
          });
      if (secureMode) {
        const latest = await getSecurePublicOrder(tableCode);
        setPublicOrder(latest.order);
        window.sessionStorage.removeItem(`giromesa:qr:${tableCode}:order:${orderPayload}`);
      }
      setCart([]);
      setStatus(text.orderSent(response.orderId.slice(0, 8)));
    });
  }

  function callWaiter(reason?: string) {
    void run(async () => {
      if (!qr) return;
      if (secureMode) {
        const request = await createSecureServiceRequest(
          tableCode,
          idempotencyKey(tableCode, "call-waiter", reason ?? "general"),
          { type: "call_waiter", ...(reason ? { message: reason } : {}) },
        );
        setServiceRequest(request);
      } else {
        await requestPublicQrAction(
          tableCode,
          "call-waiter",
          reason ? { message: reason } : undefined,
        );
      }
      setStatus(text.waiterCalled);
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
        await requestPublicQrAction(tableCode, "pre-bill");
      }
      setStatus(text.preBillRequested);
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
      let documentSubtitle: string = text.summaryDraftSubtitle;

      if (secureMode) {
        const response = await getSecurePublicOrder(tableCode);
        if (!response.order) {
          throw new Error(text.noConsumption);
        }
        printLines = response.order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
        }));
        printTotalCents = response.order.totalCents;
        setPublicOrder(response.order);
        documentSubtitle = text.summaryOrderSubtitle;
      } else if (printLines.length === 0) {
        throw new Error(text.addForSummary);
      }

      const popup = window.open("", "_blank", "width=1080,height=820");
      if (!popup) {
        throw new Error(text.popupBlocked);
      }

      const html = renderBrandedPrintDocument({
        branding: {
          displayName: branding?.displayName ?? qr.tenant.name,
          logoUrl: branding?.logoUrl ?? null,
          accentPreset: branding?.accentPreset ?? "emerald",
        },
        documentLabel: text.summaryDocument,
        title: `${text.table} ${qr.table.code}`,
        subtitle: documentSubtitle,
        metadata: [
          { label: text.table, value: qr.table.code },
          { label: text.customer, value: text.qrService },
          { label: text.generatedAt, value: new Date().toLocaleString(language) },
        ],
        metrics: [
          {
            label: text.items,
            value: String(printLines.reduce((sum, line) => sum + line.quantity, 0)),
          },
          { label: text.lines, value: String(printLines.length) },
          {
            label: secureMode ? text.tabTotal : text.estimatedTotal,
            value: formatPublicQrMoney(printTotalCents, language),
          },
        ],
        bodyHtml: `
          <section class="section">
            <h2>${escapeHtml(text.selectedItems)}</h2>
            <table>
              <thead>
                <tr>
                  <th>${escapeHtml(text.quantity)}</th>
                  <th>${escapeHtml(text.item)}</th>
                  <th>${escapeHtml(text.unitPrice)}</th>
                  <th>${escapeHtml(text.total)}</th>
                </tr>
              </thead>
              <tbody>${printLines
                .map(
                  (line) => `
                    <tr>
                      <td>${escapeHtml(String(line.quantity))}</td>
                      <td>${escapeHtml(line.name)}</td>
                      <td>${escapeHtml(formatPublicQrMoney(line.unitPriceCents, language))}</td>
                      <td>${escapeHtml(formatPublicQrMoney(line.totalCents, language))}</td>
                    </tr>`,
                )
                .join("")}</tbody>
            </table>
          </section>
        `,
        footerNote: text.nonFiscalSummary,
      });

      popup.document.write(html);
      popup.document.close();
      popup.focus();
      popup.print();
      setStatus(text.summaryOpened);
    });
  }

  if (fatalError) {
    return (
      <main className="menu-shell menu-shell-night table-qr-shell">
        <section className="qr-card" role="alert">
          <span className="section-kicker">
            <QrCode size={18} /> {text.unavailable}
          </span>
          <h1>{text.unavailableTitle}</h1>
          <p>{fatalError}</p>
          <p>{text.askTeam}</p>
        </section>
      </main>
    );
  }

  if (!qr || !menu) {
    return (
      <main className="menu-shell menu-shell-night table-qr-shell">
        <section className="qr-card" role="status">
          <span className="section-kicker">
            <QrCode size={18} /> {text.loading}
          </span>
          <p>{text.checking}</p>
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
      data-template={qr.qrSettings?.template ?? "classic"}
      data-font={normalizeQrFontPreset(qr.qrSettings?.fontPreset)}
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
          <QrCode size={18} /> {text.table} {qr.table.code}
        </span>
        <h1>{branding?.displayName ?? qr.tenant.name}</h1>
        <p>{welcomeMessage || customInstruction || text.heroDefault}</p>
        {coverUrl ? (
          <div
            className="table-qr-cover"
            role="img"
            aria-label={text.coverAlt}
            style={{ backgroundImage: `url("${coverUrl}")` }}
          />
        ) : null}
        {campaignMessage ? <p className="table-qr-campaign">{campaignMessage}</p> : null}
        {highlights.length ? (
          <ul className="table-qr-highlights" aria-label={text.highlights}>
            {highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        ) : null}
        {houseInfo ? <p className="table-qr-house-info">{houseInfo}</p> : null}
      </header>

      <section className="qr-order-grid">
        <article className="qr-card">
          <div className="panel-title">
            <div>
              <span className="section-kicker">{text.menu}</span>
              <h2>{menuHeadline || text.orderTitle}</h2>
            </div>
            {!secureMode ? (
              <a className="button secondary" href={`/m/${qr.tenant.slug}`}>
                <ClipboardList size={17} /> {text.fullMenu}
              </a>
            ) : null}
          </div>
          <div className="qr-menu-tools">
            <label className="search-box">
              <Search size={16} />
              <input
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder={text.searchPlaceholder}
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
                    {product.recommended ? <span>{text.recommended}</span> : null}
                  </div>
                  <small>{formatPublicQrMoney(product.priceCents, language)}</small>
                  <Plus size={18} />
                </button>
              ))
            ) : (
              <p className="muted-copy">{text.noItems}</p>
            )}
          </div>
        </article>

        <article className="qr-card">
          <div className="panel-title">
            <div>
              <span className="section-kicker">{text.tab}</span>
              <h2>{publicOrder ? text.currentTab : text.itemCount(cart.length)}</h2>
            </div>
            <strong>{formatPublicQrMoney(activeOrderTotal, language)}</strong>
          </div>
          <div className="qr-cart">
            {cart.length === 0 ? <p>{text.emptyCart}</p> : null}
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
                    {line.quantity} x {formatPublicQrMoney(line.priceCents, language)}
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
          {secureMode && canOrder ? (
            <label className="qr-guest-label">
              {text.guestLabel}
              <input
                value={guestLabel}
                maxLength={60}
                onChange={(event) => setGuestLabel(event.target.value)}
                placeholder={text.guestPlaceholder}
              />
              <small>{text.guestHelp}</small>
            </label>
          ) : null}
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
                <span>{text.status}</span>
                <strong>{publicOrderStatusLabel(publicOrder.status, language)}</strong>
              </div>
              {publicOrder.guestLabel ? (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>{text.identification}</span>
                  <strong>{publicOrder.guestLabel}</strong>
                </div>
              ) : null}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{text.received}</span>
                <strong>{formatPublicQrMoney(publicOrder.receivedCents ?? 0, language)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{text.remaining}</span>
                <strong>{formatPublicQrMoney(activeOrderRemaining, language)}</strong>
              </div>
              {publicOrder.timeline?.length ? (
                <ol
                  aria-label={text.orderTracking}
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
                      <span>{publicTimelineLabel(step.key, step.label, language)}</span>
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
            <Send size={17} /> {text.sendOrder}
          </button>
        </article>
      </section>

      <section className="qr-actions">
        {canCallWaiter ? (
          <button
            className="qr-action"
            type="button"
            onClick={() => callWaiter()}
            disabled={isBusy}
          >
            <BellRing size={26} />
            <div>
              <h2>{text.callWaiter}</h2>
              <p>{text.callWaiterHelp}</p>
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
              <h2>{text.preBill}</h2>
              <p>{hasActiveOrder ? text.preBillReady : text.preBillEmpty}</p>
            </div>
          </button>
        ) : null}
        <button className="qr-action" type="button" onClick={openTableSummary} disabled={isBusy}>
          <FileText size={26} />
          <div>
            <h2>{text.tableSummary}</h2>
            <p>{text.tableSummaryHelp}</p>
          </div>
        </button>
      </section>
      {canCallWaiter && qr.qrSettings?.serviceRequestReasons?.length ? (
        <section className="qr-card" aria-labelledby="quick-service-reasons">
          <h2 id="quick-service-reasons">{text.quickReasons}</h2>
          <div className="filter-row">
            {qr.qrSettings.serviceRequestReasons.map((reason) => (
              <button
                className="filter"
                disabled={isBusy}
                key={reason}
                onClick={() => callWaiter(reason)}
                type="button"
              >
                {reason}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <footer className="qr-note" role="status" aria-live="polite">
        {status || text.initialStatus}
      </footer>
      {serviceRequest ? (
        <p className="qr-note" role="status">
          {text.service}: {publicServiceStatusLabel(serviceRequest.status, language)}.
        </p>
      ) : null}
      {qr.partnerAttribution ? (
        <p className="qr-marketing-note">
          <a
            href={qr.partnerAttribution.href}
            onClick={() => recordAttribution("doseclub")}
            rel="noreferrer"
            target="_blank"
            aria-label={`${text.technology}: ${qr.partnerAttribution.label}`}
          >
            {qr.partnerAttribution.label}
          </a>
          <span aria-hidden="true"> · </span>
          <a
            aria-label={text.technology}
            href="https://giromesa.com.br/?utm_source=giromesa_qr&utm_medium=qr&utm_campaign=organic_attribution"
            onClick={() => recordAttribution("giromesa")}
          >
            {text.technology}
          </a>
        </p>
      ) : qr.qrSettings?.marketingEnabled !== false ? (
        <p className="qr-marketing-note">
          {text.technologySentence}{" "}
          <a
            aria-label={text.technology}
            href="https://giromesa.com.br/?utm_source=giromesa_qr&utm_medium=qr&utm_campaign=organic_attribution"
            onClick={() => recordAttribution("giromesa")}
          >
            {text.technology}
          </a>
          .
        </p>
      ) : null}

      {modifierModalProduct && (
        <dialog
          open
          className="modifier-modal-overlay"
          aria-label={text.close}
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
                  {formatPublicQrMoney(modifierModalProduct.priceCents, language)}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={closeModifierModal}
                aria-label={text.close}
                style={{ flexShrink: 0 }}
              >
                <X size={20} />
              </button>
            </div>

            {modifierLoading ? (
              <p className="muted-copy" style={{ textAlign: "center", padding: 24 }}>
                {text.loadingOptions}
              </p>
            ) : modifierGroups.length === 0 ? (
              <p className="muted-copy" style={{ textAlign: "center", padding: 24 }}>
                {text.noOptions}
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
                      {group.isRequired ? text.required : text.optional}
                      {group.maxChoices > 1 ? ` ${text.upTo(group.maxChoices)}` : ""}
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
                              {formatPublicQrMoney(option.priceDeltaCents, language)}
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
              <Plus size={17} /> {text.addToOrder}
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
