"use client";

import { Boxes, PackagePlus, Plus, Tag } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  type Category,
  createCategory,
  createProduct,
  formatMoney,
  listCategories,
  listProducts,
  type Product,
} from "../../../lib/giromesa-api";

function moneyToCents(value: string) {
  const normalized = value.replace(/[^0-9,.-]/g, "").replace(",", ".");
  return Math.round((Number(normalized) || 0) * 100);
}

const initialProduct = {
  name: "",
  categoryId: "",
  description: "",
  price: "",
  cost: "",
  channels: ["pos", "qr"],
  isClubEligible: false,
  bottleVolumeMl: "750",
  defaultDoseMl: "50",
  spiritType: "",
};

export default function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [product, setProduct] = useState(initialProduct);
  const [message, setMessage] = useState("Carregando catálogo...");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [categoryRows, productRows] = await Promise.all([listCategories(), listProducts()]);
      setCategories(categoryRows);
      setProducts(productRows);
      setMessage(`${productRows.length} produtos e ${categoryRows.length} categorias ativos.`);
    } catch {
      setMessage("Entre com uma conta de gestão para administrar o catálogo.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const productsByCategory = useMemo(
    () =>
      categories.map((category) => ({
        ...category,
        products: products.filter((item) => item.categoryId === category.id),
      })),
    [categories, products],
  );

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    setBusy(true);
    try {
      await createCategory({ name: categoryName.trim(), sortOrder: categories.length + 1 });
      setCategoryName("");
      await refresh();
      setMessage("Categoria adicionada ao cardápio.");
    } catch {
      setMessage("Não foi possível cadastrar a categoria. Verifique sua permissão.");
    } finally {
      setBusy(false);
    }
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product.name.trim() || moneyToCents(product.price) <= 0) {
      setMessage("Informe o nome e o preço do produto.");
      return;
    }
    setBusy(true);
    try {
      await createProduct({
        name: product.name.trim(),
        categoryId: product.categoryId || undefined,
        description: product.description.trim() || undefined,
        priceCents: moneyToCents(product.price),
        costCents: moneyToCents(product.cost),
        channels: product.channels,
        isClubEligible: product.isClubEligible,
        ...(product.isClubEligible
          ? {
              bottleVolumeMl: Number(product.bottleVolumeMl),
              defaultDoseMl: Number(product.defaultDoseMl),
              spiritType: product.spiritType || undefined,
            }
          : {}),
      });
      setProduct(initialProduct);
      await refresh();
      setMessage("Produto cadastrado e disponível no catálogo.");
    } catch {
      setMessage("Não foi possível cadastrar o produto. Revise os campos e permissões.");
    } finally {
      setBusy(false);
    }
  }

  function toggleChannel(channel: string, checked: boolean) {
    setProduct((current) => ({
      ...current,
      channels: checked
        ? [...new Set([...current.channels, channel])]
        : current.channels.filter((item) => item !== channel),
    }));
  }

  return (
    <main className="workspace-page catalog-workspace">
      <header className="workspace-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <a className="button secondary" href="/app?view=pos">Abrir PDV</a>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker"><Boxes size={16} /> Cadastro operacional</span>
        <h1>Cardápio e produtos</h1>
        <p>{message}</p>
      </section>

      <section className="catalog-layout">
        <article className="workspace-panel catalog-form-panel">
          <div className="panel-heading">
            <div><span className="section-kicker"><Tag size={15} /> Organização</span><h2>Nova categoria</h2></div>
          </div>
          <form className="workspace-form compact-form" onSubmit={submitCategory}>
            <label>Nome da categoria<input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Ex.: Entradas" /></label>
            <button className="button secondary" disabled={busy} type="submit"><Plus size={16} /> Adicionar categoria</button>
          </form>
          <div className="category-pills">
            {categories.map((category) => <span key={category.id}>{category.name}</span>)}
          </div>
        </article>

        <article className="workspace-panel catalog-form-panel">
          <div className="panel-heading">
            <div><span className="section-kicker"><PackagePlus size={15} /> Venda</span><h2>Novo produto</h2></div>
          </div>
          <form className="workspace-form" onSubmit={submitProduct}>
            <div className="workspace-form-grid">
              <label>Nome<input value={product.name} onChange={(event) => setProduct((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Negroni" /></label>
              <label>Categoria<select value={product.categoryId} onChange={(event) => setProduct((current) => ({ ...current, categoryId: event.target.value }))}><option value="">Sem categoria</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            </div>
            <label>Descrição<input value={product.description} onChange={(event) => setProduct((current) => ({ ...current, description: event.target.value }))} placeholder="Descrição curta para o time e o QR" /></label>
            <div className="workspace-form-grid">
              <label>Preço de venda<input inputMode="decimal" value={product.price} onChange={(event) => setProduct((current) => ({ ...current, price: event.target.value }))} placeholder="0,00" /></label>
              <label>Custo estimado<input inputMode="decimal" value={product.cost} onChange={(event) => setProduct((current) => ({ ...current, cost: event.target.value }))} placeholder="0,00" /></label>
            </div>
            <fieldset className="channel-fieldset"><legend>Onde vender</legend><label><input checked={product.channels.includes("pos")} onChange={(event) => toggleChannel("pos", event.target.checked)} type="checkbox" /> PDV</label><label><input checked={product.channels.includes("qr")} onChange={(event) => toggleChannel("qr", event.target.checked)} type="checkbox" /> Cardápio QR</label></fieldset>
            <label className="check-label"><input checked={product.isClubEligible} onChange={(event) => setProduct((current) => ({ ...current, isClubEligible: event.target.checked }))} type="checkbox" /> Produto elegível ao Dose Club</label>
            {product.isClubEligible ? <div className="workspace-form-grid"><label>Volume (ml)<input inputMode="numeric" value={product.bottleVolumeMl} onChange={(event) => setProduct((current) => ({ ...current, bottleVolumeMl: event.target.value }))} /></label><label>Dose padrão (ml)<input inputMode="numeric" value={product.defaultDoseMl} onChange={(event) => setProduct((current) => ({ ...current, defaultDoseMl: event.target.value }))} /></label><label>Tipo de destilado<input value={product.spiritType} onChange={(event) => setProduct((current) => ({ ...current, spiritType: event.target.value }))} placeholder="Whisky, gin..." /></label></div> : null}
            <button className="button primary" disabled={busy} type="submit"><PackagePlus size={17} /> Cadastrar produto</button>
          </form>
        </article>
      </section>

      <section className="workspace-list-section">
        <div className="panel-heading"><div><span className="section-kicker">Catálogo ativo</span><h2>Produtos por categoria</h2></div><span className="count-chip">{products.length} itens</span></div>
        <div className="product-groups">
          {productsByCategory.map((category) => <article className="product-group" key={category.id}><header><strong>{category.name}</strong><span>{category.products.length} itens</span></header>{category.products.map((item) => <div className="product-row" key={item.id}><div><strong>{item.name}</strong><small>{item.description || "Sem descrição"}</small></div><div><strong>{formatMoney(item.priceCents)}</strong><small>{item.channels.join(" · ")}{item.isClubEligible ? " · Dose Club" : ""}</small></div></div>)}{category.products.length === 0 ? <p className="muted-copy">Nenhum produto nesta categoria.</p> : null}</article>)}
          {products.filter((item) => !item.categoryId).length ? <article className="product-group"><header><strong>Sem categoria</strong><span>Itens avulsos</span></header>{products.filter((item) => !item.categoryId).map((item) => <div className="product-row" key={item.id}><div><strong>{item.name}</strong><small>{item.description || "Sem descrição"}</small></div><strong>{formatMoney(item.priceCents)}</strong></div>)}</article> : null}
        </div>
      </section>
    </main>
  );
}
