"use client";

import { Boxes, Download, PackagePlus, Plus, Tag } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type Category,
  createCategory,
  createProduct,
  formatMoney,
  listCategories,
  listProducts,
  type Product,
  updateProduct,
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
  isAlcoholic: false,
  usesReturnablePackaging: false,
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
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [updatingAlcoholId, setUpdatingAlcoholId] = useState<string | null>(null);
  const [updatingReturnableId, setUpdatingReturnableId] = useState<string | null>(null);

  const toggleProductSelection = useCallback((productId: string) => {
    setSelectedProducts((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, []);

  const toggleAllProducts = useCallback(() => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map((p) => p.id)));
    }
  }, [products, selectedProducts.size]);

  const clearSelection = useCallback(() => {
    setSelectedProducts(new Set());
    setBulkMode(false);
  }, []);

  const handleBulkExport = useCallback(() => {
    const selected = products.filter((p) => selectedProducts.has(p.id));
    const csv = [
      "Nome,Categoria,Preco,Custo,Canais",
      ...selected.map((p) => {
        const category = categories.find((c) => c.id === p.categoryId);
        return `"${p.name}","${category?.name ?? "Sem categoria"}",${formatMoney(p.priceCents)},${formatMoney(p.costCents)},"${p.channels.join(", ")}"`;
      }),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `produtos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setMessage(`${selected.length} produto(s) exportado(s) para CSV.`);
  }, [products, selectedProducts, categories]);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: carregamento inicial do catalogo.
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
        priceCents: moneyToCents(product.price),
        costCents: moneyToCents(product.cost),
        channels: product.channels,
        isAlcoholic: product.isAlcoholic,
        usesReturnablePackaging: product.usesReturnablePackaging,
        isClubEligible: product.isClubEligible,
        ...(product.categoryId ? { categoryId: product.categoryId } : {}),
        ...(product.description.trim() ? { description: product.description.trim() } : {}),
        ...(product.isClubEligible
          ? {
              bottleVolumeMl: Number(product.bottleVolumeMl),
              defaultDoseMl: Number(product.defaultDoseMl),
              ...(product.spiritType ? { spiritType: product.spiritType } : {}),
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

  async function setAlcoholicClassification(item: Product, isAlcoholic: boolean) {
    setUpdatingAlcoholId(item.id);
    try {
      const updated = await updateProduct(item.id, { isAlcoholic });
      setProducts((current) =>
        current.map((productRow) => (productRow.id === updated.id ? updated : productRow)),
      );
      setMessage(
        `${item.name}: classificação ${isAlcoholic ? "alcoólico (18+)" : "não alcoólico"} salva.`,
      );
    } catch {
      setMessage("Não foi possível atualizar a classificação 18+ deste produto.");
    } finally {
      setUpdatingAlcoholId(null);
    }
  }

  async function setReturnableClassification(item: Product, usesReturnablePackaging: boolean) {
    setUpdatingReturnableId(item.id);
    try {
      const updated = await updateProduct(item.id, { usesReturnablePackaging });
      setProducts((current) =>
        current.map((productItem) => (productItem.id === item.id ? updated : productItem)),
      );
      setMessage(
        `${item.name}: embalagem ${usesReturnablePackaging ? "retornável" : "descartável"} salva.`,
      );
    } catch {
      setMessage("Não foi possível atualizar o tipo de embalagem.");
    } finally {
      setUpdatingReturnableId(null);
    }
  }

  return (
    <main className="workspace-page catalog-workspace">
      <header className="workspace-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <a className="button secondary" href="/app/pos">
          Abrir PDV
        </a>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <Boxes size={16} /> Cadastro operacional
        </span>
        <h1>Cardápio e produtos</h1>
        <p>{message}</p>
      </section>

      <section className="catalog-layout">
        <article className="workspace-panel catalog-form-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <Tag size={15} /> Organização
              </span>
              <h2>Nova categoria</h2>
            </div>
          </div>
          <form className="workspace-form compact-form" onSubmit={submitCategory}>
            <label>
              Nome da categoria
              <input
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Ex.: Entradas"
              />
            </label>
            <button className="button secondary" disabled={busy} type="submit">
              <Plus size={16} /> Adicionar categoria
            </button>
          </form>
          <div className="category-pills">
            {categories.map((category) => (
              <span key={category.id}>{category.name}</span>
            ))}
          </div>
        </article>

        <article className="workspace-panel catalog-form-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <PackagePlus size={15} /> Venda
              </span>
              <h2>Novo produto</h2>
            </div>
          </div>
          <form className="workspace-form" onSubmit={submitProduct}>
            <div className="workspace-form-grid">
              <label>
                Nome
                <input
                  value={product.name}
                  onChange={(event) =>
                    setProduct((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Ex.: Negroni"
                />
              </label>
              <label>
                Categoria
                <select
                  value={product.categoryId}
                  onChange={(event) =>
                    setProduct((current) => ({ ...current, categoryId: event.target.value }))
                  }
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Descrição
              <input
                value={product.description}
                onChange={(event) =>
                  setProduct((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Descrição curta para o time e o QR"
              />
            </label>
            <div className="workspace-form-grid">
              <label>
                Preço de venda
                <input
                  inputMode="decimal"
                  value={product.price}
                  onChange={(event) =>
                    setProduct((current) => ({ ...current, price: event.target.value }))
                  }
                  placeholder="0,00"
                />
              </label>
              <label>
                Custo estimado
                <input
                  inputMode="decimal"
                  value={product.cost}
                  onChange={(event) =>
                    setProduct((current) => ({ ...current, cost: event.target.value }))
                  }
                  placeholder="0,00"
                />
              </label>
            </div>
            <fieldset className="channel-fieldset">
              <legend>Onde vender</legend>
              <label>
                <input
                  checked={product.channels.includes("pos")}
                  onChange={(event) => toggleChannel("pos", event.target.checked)}
                  type="checkbox"
                />{" "}
                PDV
              </label>
              <label>
                <input
                  checked={product.channels.includes("qr")}
                  onChange={(event) => toggleChannel("qr", event.target.checked)}
                  type="checkbox"
                />{" "}
                Cardápio QR
              </label>
            </fieldset>
            <label className="check-label">
              <input
                checked={product.isAlcoholic}
                onChange={(event) =>
                  setProduct((current) => ({ ...current, isAlcoholic: event.target.checked }))
                }
                type="checkbox"
              />{" "}
              Produto alcoólico (ativa confirmação 18+ no QR)
            </label>
            <label className="check-label">
              <input
                checked={product.usesReturnablePackaging}
                onChange={(event) =>
                  setProduct((current) => ({
                    ...current,
                    usesReturnablePackaging: event.target.checked,
                  }))
                }
                type="checkbox"
              />{" "}
              Usa vasilhame retornável (ex.: cerveja ou refrigerante retornável)
            </label>
            <label className="check-label">
              <input
                checked={product.isClubEligible}
                onChange={(event) =>
                  setProduct((current) => ({ ...current, isClubEligible: event.target.checked }))
                }
                type="checkbox"
              />{" "}
              Produto elegível ao Dose Club
            </label>
            {product.isClubEligible ? (
              <div className="workspace-form-grid">
                <label>
                  Volume (ml)
                  <input
                    inputMode="numeric"
                    value={product.bottleVolumeMl}
                    onChange={(event) =>
                      setProduct((current) => ({ ...current, bottleVolumeMl: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Dose padrão (ml)
                  <input
                    inputMode="numeric"
                    value={product.defaultDoseMl}
                    onChange={(event) =>
                      setProduct((current) => ({ ...current, defaultDoseMl: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Tipo de destilado
                  <input
                    value={product.spiritType}
                    onChange={(event) =>
                      setProduct((current) => ({ ...current, spiritType: event.target.value }))
                    }
                    placeholder="Whisky, gin..."
                  />
                </label>
              </div>
            ) : null}
            <button className="button primary" disabled={busy} type="submit">
              <PackagePlus size={17} /> Cadastrar produto
            </button>
          </form>
        </article>
      </section>

      <section className="workspace-list-section">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Catálogo ativo</span>
            <h2>Produtos por categoria</h2>
          </div>
          <div className="gm-bulk-actions">
            <span className="count-chip">{products.length} itens</span>
            {bulkMode ? (
              <>
                <span className="gm-bulk-count">{selectedProducts.size} selecionado(s)</span>
                <button
                  className="button secondary compact"
                  onClick={toggleAllProducts}
                  type="button"
                >
                  {selectedProducts.size === products.length
                    ? "Desmarcar todos"
                    : "Selecionar todos"}
                </button>
                {selectedProducts.size > 0 && (
                  <button
                    className="button secondary compact"
                    onClick={handleBulkExport}
                    type="button"
                  >
                    <Download size={14} /> Exportar CSV
                  </button>
                )}
                <button className="button secondary compact" onClick={clearSelection} type="button">
                  Cancelar
                </button>
              </>
            ) : (
              <button
                className="button secondary compact"
                onClick={() => setBulkMode(true)}
                type="button"
              >
                Selecionar
              </button>
            )}
          </div>
        </div>
        <div className="product-groups">
          {productsByCategory.map((category) => (
            <article className="product-group" key={category.id}>
              <header>
                {bulkMode && (
                  <input
                    aria-label={`Selecionar todos os produtos de ${category.name}`}
                    type="checkbox"
                    checked={category.products.every((p) => selectedProducts.has(p.id))}
                    onChange={() => {
                      const allSelected = category.products.every((p) =>
                        selectedProducts.has(p.id),
                      );
                      setSelectedProducts((current) => {
                        const next = new Set(current);
                        for (const p of category.products) {
                          if (allSelected) {
                            next.delete(p.id);
                          } else {
                            next.add(p.id);
                          }
                        }
                        return next;
                      });
                    }}
                    className="gm-bulk-checkbox"
                  />
                )}
                <strong>{category.name}</strong>
                <span>{category.products.length} itens</span>
              </header>
              {category.products.map((item) => (
                <div
                  className={`product-row ${selectedProducts.has(item.id) ? "product-row--selected" : ""}`}
                  key={item.id}
                  style={bulkMode ? { cursor: "pointer" } : undefined}
                  {...(bulkMode
                    ? {
                        role: "button",
                        tabIndex: 0,
                        onClick: () => toggleProductSelection(item.id),
                        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleProductSelection(item.id);
                          }
                        },
                      }
                    : {})}
                >
                  {bulkMode && (
                    <input
                      aria-label={`Selecionar ${item.name}`}
                      type="checkbox"
                      checked={selectedProducts.has(item.id)}
                      onChange={() => toggleProductSelection(item.id)}
                      className="gm-bulk-checkbox"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.description || "Sem descrição"}</small>
                  </div>
                  <div>
                    <strong>{formatMoney(item.priceCents)}</strong>
                    <small>
                      {item.channels.join(" · ")}
                      {item.isClubEligible ? " · Dose Club" : ""}
                      {item.usesReturnablePackaging ? " · Retornável" : ""}
                    </small>
                  </div>
                  <label
                    className="check-label product-alcohol-toggle"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <input
                      checked={item.isAlcoholic}
                      disabled={updatingAlcoholId === item.id}
                      onChange={(event) =>
                        void setAlcoholicClassification(item, event.target.checked)
                      }
                      type="checkbox"
                    />
                    18+
                  </label>
                  <label
                    className="check-label product-alcohol-toggle"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <input
                      checked={item.usesReturnablePackaging ?? false}
                      disabled={updatingReturnableId === item.id}
                      onChange={(event) =>
                        void setReturnableClassification(item, event.target.checked)
                      }
                      type="checkbox"
                    />
                    Retornável
                  </label>
                </div>
              ))}
              {category.products.length === 0 ? (
                <p className="muted-copy">Nenhum produto nesta categoria.</p>
              ) : null}
            </article>
          ))}
          {products.filter((item) => !item.categoryId).length ? (
            <article className="product-group">
              <header>
                {bulkMode && (
                  <input
                    aria-label="Selecionar todos os produtos sem categoria"
                    type="checkbox"
                    checked={products
                      .filter((p) => !p.categoryId)
                      .every((p) => selectedProducts.has(p.id))}
                    onChange={() => {
                      const uncategorized = products.filter((p) => !p.categoryId);
                      const allSelected = uncategorized.every((p) => selectedProducts.has(p.id));
                      setSelectedProducts((current) => {
                        const next = new Set(current);
                        for (const p of uncategorized) {
                          if (allSelected) {
                            next.delete(p.id);
                          } else {
                            next.add(p.id);
                          }
                        }
                        return next;
                      });
                    }}
                    className="gm-bulk-checkbox"
                  />
                )}
                <strong>Sem categoria</strong>
                <span>Itens avulsos</span>
              </header>
              {products
                .filter((item) => !item.categoryId)
                .map((item) => (
                  <div
                    className={`product-row ${selectedProducts.has(item.id) ? "product-row--selected" : ""}`}
                    key={item.id}
                    style={bulkMode ? { cursor: "pointer" } : undefined}
                    {...(bulkMode
                      ? {
                          role: "button",
                          tabIndex: 0,
                          onClick: () => toggleProductSelection(item.id),
                          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleProductSelection(item.id);
                            }
                          },
                        }
                      : {})}
                  >
                    {bulkMode && (
                      <input
                        aria-label={`Selecionar ${item.name}`}
                        type="checkbox"
                        checked={selectedProducts.has(item.id)}
                        onChange={() => toggleProductSelection(item.id)}
                        className="gm-bulk-checkbox"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.description || "Sem descrição"}</small>
                    </div>
                    <strong>{formatMoney(item.priceCents)}</strong>
                    <label
                      className="check-label product-alcohol-toggle"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <input
                        checked={item.isAlcoholic}
                        disabled={updatingAlcoholId === item.id}
                        onChange={(event) =>
                          void setAlcoholicClassification(item, event.target.checked)
                        }
                        type="checkbox"
                      />
                      18+
                    </label>
                    <label
                      className="check-label product-alcohol-toggle"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <input
                        checked={item.usesReturnablePackaging ?? false}
                        disabled={updatingReturnableId === item.id}
                        onChange={(event) =>
                          void setReturnableClassification(item, event.target.checked)
                        }
                        type="checkbox"
                      />
                      Retornável
                    </label>
                  </div>
                ))}
            </article>
          ) : null}
        </div>
      </section>
    </main>
  );
}
