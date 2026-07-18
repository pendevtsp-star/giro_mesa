"use client";
import { Building2, Plus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { createSupplier, listSuppliers, type Supplier } from "../../../../lib/giromesa-api";
export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [message, setMessage] = useState("Carregando fornecedores...");
  const [form, setForm] = useState({
    name: "",
    document: "",
    contactName: "",
    phone: "",
    email: "",
  });
  async function load() {
    try {
      setSuppliers(await listSuppliers());
      setMessage("Fornecedores disponíveis para entradas de compra.");
    } catch {
      setMessage("Entre com uma conta de estoque para administrar fornecedores.");
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: carregamento inicial de fornecedores.
  useEffect(() => {
    void load();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    await createSupplier({
      name: form.name,
      ...(form.document ? { document: form.document } : {}),
      ...(form.contactName ? { contactName: form.contactName } : {}),
      ...(form.phone ? { phone: form.phone } : {}),
      ...(form.email ? { email: form.email } : {}),
    });
    setForm({ name: "", document: "", contactName: "", phone: "", email: "" });
    await load();
  }
  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <a className="brand" href="/app/inventory">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <Building2 size={16} /> Compras
        </span>
        <h1>Fornecedores</h1>
        <p>{message}</p>
      </section>
      <section className="catalog-layout">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <Plus size={15} /> Cadastro
              </span>
              <h2>Novo fornecedor</h2>
            </div>
          </div>
          <form className="workspace-form" onSubmit={submit}>
            <label>
              Razão social / nome
              <input
                value={form.name}
                onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
              />
            </label>
            <label>
              CPF / CNPJ
              <input
                value={form.document}
                onChange={(e) => setForm((c) => ({ ...c, document: e.target.value }))}
              />
            </label>
            <label>
              Contato
              <input
                value={form.contactName}
                onChange={(e) => setForm((c) => ({ ...c, contactName: e.target.value }))}
              />
            </label>
            <div className="workspace-form-grid">
              <label>
                Telefone
                <input
                  value={form.phone}
                  onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                />
              </label>
            </div>
            <button className="button primary" type="submit">
              Cadastrar fornecedor
            </button>
          </form>
        </article>
        <article className="workspace-list-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Base de compras</span>
              <h2>Fornecedores ativos</h2>
            </div>
          </div>
          {suppliers.map((supplier) => (
            <div className="inventory-row" key={supplier.id}>
              <div>
                <strong>{supplier.name}</strong>
                <small>
                  {supplier.contactName || supplier.phone || supplier.email || "Sem contato"}
                </small>
              </div>
              <span className="count-chip">Ativo</span>
            </div>
          ))}
        </article>
      </section>
    </main>
  );
}
