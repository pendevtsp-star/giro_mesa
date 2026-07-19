"use client";

import { Badge } from "@giromesa/ui";
import { ClipboardList, PackageOpen } from "lucide-react";
import { toggleValue } from "../../lib/formatters/app-dashboard";
import type { Category, Product } from "../../lib/giromesa-api";

export type CatalogCategoryForm = {
  name: string;
  sortOrder: string;
};

export type CatalogProductForm = {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  cost: string;
  channels: string[];
  isClubEligible: boolean;
  bottleVolumeMl: string;
  defaultDoseMl: string;
  spiritType: string;
  fiscalNcm: string;
  fiscalCfop: string;
  fiscalOrigin: string;
  fiscalCsosn: string;
};

type CatalogManagementPanelProps = {
  categories: Category[];
  products: Product[];
  categoryForm: CatalogCategoryForm;
  productForm: CatalogProductForm;
  isBusy: boolean;
  onCategoryFormChange: (updater: (current: CatalogCategoryForm) => CatalogCategoryForm) => void;
  onProductFormChange: (updater: (current: CatalogProductForm) => CatalogProductForm) => void;
  onCreateCategory: () => void;
  onCreateProduct: () => void;
};

export function CatalogManagementPanel({
  categories,
  products,
  categoryForm,
  productForm,
  isBusy,
  onCategoryFormChange,
  onProductFormChange,
  onCreateCategory,
  onCreateProduct,
}: CatalogManagementPanelProps) {
  return (
    <article className="panel catalog-panel">
      <div className="panel-title">
        <div>
          <span className="section-kicker">Catálogo</span>
          <h2>Produtos e categorias</h2>
        </div>
        <Badge tone="info">{products.length} itens</Badge>
      </div>
      <div className="hardware-forms">
        <form
          className="hardware-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateCategory();
          }}
        >
          <strong>Nova categoria</strong>
          <label>
            Nome
            <input
              value={categoryForm.name}
              onChange={(event) =>
                onCategoryFormChange((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label>
            Ordem
            <input
              inputMode="numeric"
              value={categoryForm.sortOrder}
              onChange={(event) =>
                onCategoryFormChange((current) => ({
                  ...current,
                  sortOrder: event.target.value,
                }))
              }
            />
          </label>
          <button className="button secondary full" type="submit" disabled={isBusy}>
            <ClipboardList size={17} /> Cadastrar categoria
          </button>
        </form>

        <form
          className="hardware-form"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateProduct();
          }}
        >
          <strong>Novo produto</strong>
          <div className="form-grid-compact">
            <label>
              Nome
              <input
                value={productForm.name}
                onChange={(event) =>
                  onProductFormChange((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              Categoria
              <select
                value={productForm.categoryId}
                onChange={(event) =>
                  onProductFormChange((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Descrição
            <input
              value={productForm.description}
              onChange={(event) =>
                onProductFormChange((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <div className="form-grid-compact">
            <label>
              Preço
              <input
                inputMode="decimal"
                value={productForm.price}
                onChange={(event) =>
                  onProductFormChange((current) => ({ ...current, price: event.target.value }))
                }
              />
            </label>
            <label>
              Custo
              <input
                inputMode="decimal"
                value={productForm.cost}
                onChange={(event) =>
                  onProductFormChange((current) => ({ ...current, cost: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="check-row">
            <label>
              <input
                type="checkbox"
                checked={productForm.channels.includes("pos")}
                onChange={(event) =>
                  onProductFormChange((current) => ({
                    ...current,
                    channels: toggleValue(current.channels, "pos", event.target.checked),
                  }))
                }
              />
              PDV
            </label>
            <label>
              <input
                type="checkbox"
                checked={productForm.channels.includes("qr")}
                onChange={(event) =>
                  onProductFormChange((current) => ({
                    ...current,
                    channels: toggleValue(current.channels, "qr", event.target.checked),
                  }))
                }
              />
              QR
            </label>
            <label>
              <input
                type="checkbox"
                checked={productForm.isClubEligible}
                onChange={(event) =>
                  onProductFormChange((current) => ({
                    ...current,
                    isClubEligible: event.target.checked,
                  }))
                }
              />
              Dose Club
            </label>
          </div>
          {productForm.isClubEligible ? (
            <div className="form-grid-compact">
              <label>
                Garrafa ml
                <input
                  inputMode="numeric"
                  value={productForm.bottleVolumeMl}
                  onChange={(event) =>
                    onProductFormChange((current) => ({
                      ...current,
                      bottleVolumeMl: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Dose ml
                <input
                  inputMode="numeric"
                  value={productForm.defaultDoseMl}
                  onChange={(event) =>
                    onProductFormChange((current) => ({
                      ...current,
                      defaultDoseMl: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          ) : null}
          <button className="button primary full" type="submit" disabled={isBusy}>
            <PackageOpen size={17} /> Cadastrar produto
          </button>
        </form>
      </div>
    </article>
  );
}
