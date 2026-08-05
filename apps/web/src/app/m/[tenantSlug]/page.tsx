"use client";

import { Clock, Leaf, Plus, Search, Sparkles, Utensils } from "lucide-react";
import { use, useEffect, useMemo, useState } from "react";
import { formatMoney, getPublicMenu, type PublicMenuResponse } from "../../../lib/giromesa-api";

export default function MenuPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = use(params);
  const [menu, setMenu] = useState<PublicMenuResponse | null>(null);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    let ignore = false;
    setIsLoadingMenu(true);
    setMenuError(null);
    getPublicMenu(tenantSlug)
      .then((response) => {
        if (!ignore) {
          setMenu(response);
          setCategoryId("all");
          setIsLoadingMenu(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setMenu(null);
          setMenuError(
            "Não foi possível carregar este cardápio. Verifique a conexão e tente novamente.",
          );
          setIsLoadingMenu(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [tenantSlug]);

  const categories = useMemo(
    () => [
      { id: "all", name: "Todos" },
      ...(menu?.categories ?? []).filter((category) => category.id !== "all"),
    ],
    [menu?.categories],
  );
  const filteredProducts = (menu?.products ?? []).filter((product) => {
    const matchesCategory = categoryId === "all" || product.categoryId === categoryId;
    const haystack = `${product.name} ${product.description ?? ""}`.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  });
  const pagedProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = filteredProducts.length > visibleCount;
  const branding = menu?.tenant.branding;
  const brandInitial = branding?.displayName.slice(0, 1).toUpperCase() || "G";

  return (
    <main
      className="menu-shell menu-shell-night"
      data-theme={branding?.themeMode ?? "light"}
      data-accent={branding?.accentPreset ?? "emerald"}
    >
      <header className="menu-hero public-menu-hero">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span
            className={branding?.logoUrl ? "brand-mark brand-mark-logo" : "brand-mark"}
            style={branding?.logoUrl ? { backgroundImage: `url(${branding.logoUrl})` } : undefined}
          >
            {branding?.logoUrl ? "" : brandInitial}
          </span>
          <span>{branding?.displayName ?? tenantSlug.replaceAll("-", " ")}</span>
        </a>
        <span className="eyebrow">
          <Utensils size={18} /> Cardápio digital
        </span>
        <h1>{branding?.displayName ?? tenantSlug.replaceAll("-", " ")}</h1>
        <p>Pratos da casa, bebidas geladas e rótulos elegíveis ao Dose Club.</p>
      </header>

      <section className="menu-toolbar" aria-label="Filtros do cardápio">
        <label className="search-box">
          <Search size={17} />
          <input
            placeholder="Buscar no cardápio"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(20);
            }}
          />
        </label>
        <div className="filter-row">
          {categories.map((category) => (
            <button
              className={categoryId === category.id ? "filter active" : "filter"}
              type="button"
              key={category.id}
              disabled={isLoadingMenu}
              aria-busy={isLoadingMenu}
              onClick={() => {
                setCategoryId(category.id);
                setVisibleCount(20);
              }}
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      <section className="menu-list">
        {menuError ? (
          <div className="empty-state" role="alert">
            <strong>Cardápio indisponível</strong>
            <p>{menuError}</p>
            <button
              className="button secondary"
              type="button"
              onClick={() => window.location.reload()}
            >
              Tentar novamente
            </button>
          </div>
        ) : null}
        {pagedProducts.map((product) => (
          <article className="menu-item" key={product.id}>
            <div className="menu-thumb" aria-hidden="true">
              {product.imageUrl ? (
                // biome-ignore lint/performance/noImgElement: tenant URLs are dynamic and not eligible for a fixed Next Image allowlist.
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
                />
              ) : product.isClubEligible ? (
                <Sparkles size={22} />
              ) : (
                <Utensils size={22} />
              )}
            </div>
            <div>
              <h2>{product.name}</h2>
              <p>{product.description}</p>
              <span>
                <Leaf size={14} />{" "}
                {product.isClubEligible
                  ? `Dose Club: ${product.bottleVolumeMl ?? 0}ml / ${
                      product.defaultDoseMl ?? 50
                    }ml por dose`
                  : "Informações de alergênicos disponíveis no atendimento"}
              </span>
            </div>
            <div className="menu-price">
              <strong>{formatMoney(product.priceCents)}</strong>
              <button
                className="button secondary icon-only"
                type="button"
                aria-label={`Adicionar ${product.name}`}
              >
                <Plus size={18} />
              </button>
            </div>
          </article>
        ))}
      </section>
      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", padding: "16px 0 24px" }}>
          <button
            className="button secondary"
            type="button"
            onClick={() => setVisibleCount((c) => c + 20)}
          >
            Carregar mais
          </button>
        </div>
      )}
      <footer className="footer compact-footer">
        <Clock size={16} /> Horarios e disponibilidade podem mudar durante o turno.
      </footer>
    </main>
  );
}
