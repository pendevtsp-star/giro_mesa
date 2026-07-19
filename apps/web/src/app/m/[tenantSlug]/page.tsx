"use client";

import { Clock, Leaf, Plus, Search, Sparkles, Utensils } from "lucide-react";
import { use, useEffect, useMemo, useState } from "react";
import { formatMoney, getPublicMenu, type PublicMenuResponse } from "../../../lib/giromesa-api";

const fallbackMenu: PublicMenuResponse = {
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
  categories: [
    { id: "all", branchId: null, name: "Todos", sortOrder: 0, isActive: true },
    { id: "bebidas", branchId: null, name: "Bebidas", sortOrder: 1, isActive: true },
  ],
  products: [
    {
      id: "demo-burger",
      name: "Burger Classico",
      description: "Blend da casa, queijo prato, molho especial e pao brioche.",
      categoryId: "all",
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
      id: "demo-whisky",
      name: "Single Malt 12 anos",
      description: "Rotulo elegivel ao Dose Club, com dose padrao de 50ml.",
      categoryId: "bebidas",
      priceCents: 42000,
      imageUrl: null,
      isAvailable: true,
      channels: ["qr"],
      isClubEligible: true,
      bottleVolumeMl: 1000,
      defaultDoseMl: 50,
      spiritType: "whisky",
    },
  ],
};

export default function MenuPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = use(params);
  const [menu, setMenu] = useState<PublicMenuResponse>(fallbackMenu);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");

  useEffect(() => {
    let ignore = false;
    getPublicMenu(tenantSlug)
      .then((response) => {
        if (!ignore) {
          setMenu(response);
          setCategoryId("all");
        }
      })
      .catch(() => {
        if (!ignore) {
          setMenu(fallbackMenu);
        }
      });

    return () => {
      ignore = true;
    };
  }, [tenantSlug]);

  const categories = useMemo(
    () => [
      { id: "all", name: "Todos" },
      ...menu.categories.filter((category) => category.id !== "all"),
    ],
    [menu.categories],
  );
  const filteredProducts = menu.products.filter((product) => {
    const matchesCategory = categoryId === "all" || product.categoryId === categoryId;
    const haystack = `${product.name} ${product.description ?? ""}`.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase());
  });
  const branding = menu.tenant.branding ?? fallbackMenu.tenant.branding;
  const brandInitial = branding?.displayName.slice(0, 1).toUpperCase() || "G";

  return (
    <main
      className="menu-shell"
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
        <h1>{branding?.displayName ?? menu.tenant.name}</h1>
        <p>Pratos da casa, bebidas geladas e rótulos elegíveis ao Dose Club.</p>
      </header>

      <section className="menu-toolbar" aria-label="Filtros do cardápio">
        <label className="search-box">
          <Search size={17} />
          <input
            placeholder="Buscar no cardápio"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-row">
          {categories.map((category) => (
            <button
              className={categoryId === category.id ? "filter active" : "filter"}
              type="button"
              key={category.id}
              onClick={() => setCategoryId(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      <section className="menu-list">
        {filteredProducts.map((product, index) => (
          <article className="menu-item" key={product.id}>
            <div className="menu-thumb" aria-hidden="true">
              {product.isClubEligible ? <Sparkles size={22} /> : <Utensils size={22} />}
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
              <small>{readPrepTime(product.name, index)}</small>
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
      <footer className="footer compact-footer">
        <Clock size={16} /> Horarios e disponibilidade podem mudar durante o turno.
      </footer>
    </main>
  );
}

function readPrepTime(name: string, index: number) {
  if (name.toLowerCase().includes("chopp") || name.toLowerCase().includes("bebida")) {
    return "2 min";
  }
  if (name.toLowerCase().includes("pizza")) {
    return "18 min";
  }
  return index % 2 === 0 ? "12 min" : "7 min";
}
