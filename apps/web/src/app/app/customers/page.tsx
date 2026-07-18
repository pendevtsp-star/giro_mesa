"use client";

import { ContactRound, History, Plus, Search, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  type Customer,
  type CustomerOrderHistory,
  createCustomer,
  formatMoney,
  getCustomerHistory,
  listCustomers,
} from "../../../lib/giromesa-api";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [history, setHistory] = useState<CustomerOrderHistory[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Carregando base de clientes...");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    birthday: "",
    marketingOptIn: false,
  });
  const [busy, setBusy] = useState(false);

  async function load(query = "") {
    try {
      const rows = await listCustomers(query);
      setCustomers(rows);
      setMessage(`${rows.length} cliente(s) encontrado(s).`);
    } catch {
      setMessage("Entre com um perfil de operação para consultar clientes.");
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: carregamento inicial da base de clientes.
  useEffect(() => {
    void load();
  }, []);

  async function selectCustomer(customer: Customer) {
    setSelected(customer);
    try {
      setHistory(await getCustomerHistory(customer.id));
    } catch {
      setHistory([]);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await createCustomer({
        name: form.name.trim(),
        ...(form.phone ? { phone: form.phone } : {}),
        ...(form.email ? { email: form.email } : {}),
        ...(form.birthday ? { birthday: form.birthday } : {}),
        marketingOptIn: form.marketingOptIn,
      });
      setForm({ name: "", phone: "", email: "", birthday: "", marketingOptIn: false });
      await load(search);
      setMessage("Cliente cadastrado com consentimento registrado.");
    } catch {
      setMessage("Não foi possível cadastrar o cliente. Revise os campos e permissões.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-page customers-workspace">
      <header className="workspace-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <a className="button secondary" href="/app?view=pos">
          Abrir PDV
        </a>
      </header>
      <section className="workspace-heading">
        <span className="section-kicker">
          <ContactRound size={16} /> Relacionamento
        </span>
        <h1>Clientes</h1>
        <p>{message}</p>
      </section>
      <section className="customers-grid">
        <article className="workspace-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <Plus size={15} /> Cadastro
              </span>
              <h2>Novo cliente</h2>
            </div>
          </div>
          <form className="workspace-form" onSubmit={submit}>
            <label>
              Nome
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Nome completo"
              />
            </label>
            <div className="workspace-form-grid">
              <label>
                Telefone
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone: event.target.value }))
                  }
                  placeholder="(00) 00000-0000"
                />
              </label>
              <label>
                Aniversário
                <input
                  type="date"
                  value={form.birthday}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, birthday: event.target.value }))
                  }
                />
              </label>
            </div>
            <label>
              E-mail
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="cliente@email.com"
              />
            </label>
            <label className="check-label">
              <input
                checked={form.marketingOptIn}
                onChange={(event) =>
                  setForm((current) => ({ ...current, marketingOptIn: event.target.checked }))
                }
                type="checkbox"
              />{" "}
              Autoriza comunicações e ofertas
            </label>
            <button className="button primary" disabled={busy} type="submit">
              <Plus size={16} /> Cadastrar cliente
            </button>
          </form>
        </article>
        <article className="workspace-panel customer-detail">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">
                <History size={15} /> Consumo
              </span>
              <h2>{selected?.name || "Selecione um cliente"}</h2>
            </div>
          </div>
          {selected ? (
            <>
              <p className="muted-copy">
                {selected.phone || selected.email || "Sem contato informado"}
              </p>
              <div className="customer-consent">
                <ShieldCheck size={16} />{" "}
                {selected.marketingOptIn
                  ? "Opt-in de comunicação registrado"
                  : "Sem opt-in de comunicação"}
              </div>
              <div className="customer-history">
                {history.map((order) => (
                  <div className="inventory-row" key={order.id}>
                    <div>
                      <strong>
                        {order.channel === "table" ? "Atendimento no salão" : order.channel}
                      </strong>
                      <small>
                        {order.closedAt
                          ? new Date(order.closedAt).toLocaleDateString("pt-BR")
                          : "Em aberto"}
                      </small>
                    </div>
                    <strong>{formatMoney(order.totalCents)}</strong>
                  </div>
                ))}
                {!history.length ? (
                  <p className="muted-copy">Ainda não há pedidos vinculados a este cliente.</p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="muted-copy">
              A seleção mostra o histórico de consumo e o status de consentimento.
            </p>
          )}
        </article>
      </section>
      <section className="workspace-list-section customers-list">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">Base do estabelecimento</span>
            <h2>Clientes cadastrados</h2>
          </div>
          <label className="customer-search">
            <span className="visually-hidden">Buscar cliente</span>
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void load(search);
              }}
              placeholder="Buscar nome, telefone ou e-mail"
            />
          </label>
        </div>
        <div className="customer-table">
          {customers.map((customer) => (
            <button
              className={selected?.id === customer.id ? "customer-row selected" : "customer-row"}
              key={customer.id}
              onClick={() => void selectCustomer(customer)}
              type="button"
            >
              <div>
                <strong>{customer.name}</strong>
                <small>{customer.phone || customer.email || "Sem contato"}</small>
              </div>
              <span>{customer.marketingOptIn ? "Opt-in" : "Sem opt-in"}</span>
            </button>
          ))}
          {!customers.length ? <p className="muted-copy">Nenhum cliente cadastrado.</p> : null}
        </div>
      </section>
    </main>
  );
}
