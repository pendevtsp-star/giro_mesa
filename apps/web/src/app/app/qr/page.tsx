"use client";

import {
  Download,
  ExternalLink,
  Eye,
  Palette,
  Printer,
  QrCode,
  RefreshCw,
  RotateCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type Category,
  createQrArtwork,
  createQrExperienceDraft,
  type GuestExperienceRevision,
  getErrorMessage,
  getQrExperience,
  getQrSettings,
  listCategories,
  listProducts,
  listQrTables,
  type Product,
  previewQrExperience,
  publishQrExperience,
  type QrAdminTable,
  type QrArtwork,
  type QrBranchSettings,
  type QrCapability,
  rollbackQrExperience,
  rotateQrTable,
  scheduleQrExperience,
  updateQrSettings,
} from "../../../lib/giromesa-api";

const capabilityLabels: Record<QrCapability, string> = {
  menu: "Ver cardápio",
  order: "Fazer pedido",
  review_before_kds: "Revisar antes do KDS",
  track_preparation: "Acompanhar preparo",
  view_tab: "Ver comanda",
  call_waiter: "Chamar garçom",
  request_pre_bill: "Solicitar pré-conta",
};

export default function QrManagementPage() {
  const [settings, setSettings] = useState<QrBranchSettings | null>(null);
  const [experience, setExperience] = useState<{
    draft: GuestExperienceRevision | null;
    published: GuestExperienceRevision | null;
    history: GuestExperienceRevision[];
  } | null>(null);
  const [tables, setTables] = useState<QrAdminTable[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [artwork, setArtwork] = useState<QrArtwork | null>(null);
  const [format, setFormat] = useState<"svg" | "png" | "pdf">("svg");
  const [size, setSize] = useState<"plate_10x15" | "sticker_8x8" | "a4">("plate_10x15");
  const [message, setMessage] = useState("Carregando configuração de QR...");
  const [busy, setBusy] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [preview, setPreview] = useState<GuestExperienceRevision["config"] | null>(null);

  const allSelected = tables.length > 0 && selected.size === tables.length;
  async function load() {
    setBusy(true);
    try {
      const [nextSettings, nextTables, nextExperience, nextCategories, nextProducts] =
        await Promise.all([
          getQrSettings(),
          listQrTables(),
          getQrExperience(),
          listCategories(),
          listProducts(),
        ]);
      setSettings(nextSettings);
      setExperience(nextExperience);
      setScheduledAt(toDateTimeLocal(nextExperience.draft?.scheduledAt));
      const activeExperience = nextExperience.draft ?? nextExperience.published;
      if (activeExperience) {
        setSettings({
          ...nextSettings,
          ...(activeExperience.config.welcomeMessage
            ? { welcomeMessage: activeExperience.config.welcomeMessage }
            : {}),
          ...(activeExperience.config.menuHeadline
            ? { menuHeadline: activeExperience.config.menuHeadline }
            : {}),
          ...(activeExperience.config.fontPreset
            ? { fontPreset: activeExperience.config.fontPreset }
            : {}),
          ...(activeExperience.config.marketingEnabled !== undefined
            ? { marketingEnabled: activeExperience.config.marketingEnabled }
            : {}),
          ...(activeExperience.config.coverUrl !== undefined
            ? { coverUrl: activeExperience.config.coverUrl }
            : {}),
          ...(activeExperience.config.language
            ? { language: activeExperience.config.language }
            : {}),
          ...(activeExperience.config.highlights
            ? { highlights: activeExperience.config.highlights }
            : {}),
          ...(activeExperience.config.campaignMessage
            ? { campaignMessage: activeExperience.config.campaignMessage }
            : {}),
          ...(activeExperience.config.houseInfo
            ? { houseInfo: activeExperience.config.houseInfo }
            : {}),
          ...(activeExperience.config.categoryLabels
            ? { categoryLabels: activeExperience.config.categoryLabels }
            : {}),
          ...(activeExperience.config.recommendedProductIds
            ? { recommendedProductIds: activeExperience.config.recommendedProductIds }
            : {}),
          ...(activeExperience.config.serviceRequestReasons
            ? { serviceRequestReasons: activeExperience.config.serviceRequestReasons }
            : {}),
        });
      }
      setCategories(
        nextCategories.filter(
          (category) =>
            category.isActive &&
            (category.branchId === null || category.branchId === nextSettings.branchId),
        ),
      );
      setProducts(
        nextProducts.filter(
          (product) =>
            product.isActive !== false && product.isAvailable && product.channels.includes("qr"),
        ),
      );
      setTables(nextTables);
      setSelected((current) => {
        const valid = new Set(
          nextTables.filter((table) => current.has(table.id)).map((table) => table.id),
        );
        return valid.size > 0 ? valid : new Set(nextTables.map((table) => table.id));
      });
      setMessage(`${nextTables.length} mesa(s) disponível(is) para gerar material.`);
    } catch (error) {
      setMessage(getErrorMessage(error, "Não foi possível carregar os QR codes."));
    } finally {
      setBusy(false);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: bootstrap único; recargas seguintes são explícitas.
  useEffect(() => {
    void load();
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setBusy(true);
    try {
      const updated = await updateQrSettings({
        mode: settings.mode,
        presenceMethods: settings.presenceMethods,
        tabVisibility: settings.tabVisibility,
        presenceCodeTtlMinutes: settings.presenceCodeTtlMinutes,
        guestSessionTtlMinutes: settings.guestSessionTtlMinutes,
        capabilities: settings.capabilities,
        reviewBeforeKds: settings.reviewBeforeKds,
        template: settings.template,
        primaryColor: settings.primaryColor,
        instruction: settings.instruction,
        showLogo: settings.showLogo,
      });
      setSettings({
        ...updated,
        ...(settings.welcomeMessage ? { welcomeMessage: settings.welcomeMessage } : {}),
        ...(settings.menuHeadline ? { menuHeadline: settings.menuHeadline } : {}),
        ...(settings.marketingEnabled !== undefined
          ? { marketingEnabled: settings.marketingEnabled }
          : {}),
        ...(settings.coverUrl !== undefined ? { coverUrl: settings.coverUrl } : {}),
        ...(settings.language ? { language: settings.language } : {}),
        ...(settings.highlights ? { highlights: settings.highlights } : {}),
        ...(settings.campaignMessage ? { campaignMessage: settings.campaignMessage } : {}),
        ...(settings.houseInfo ? { houseInfo: settings.houseInfo } : {}),
        ...(settings.categoryLabels ? { categoryLabels: settings.categoryLabels } : {}),
        ...(settings.recommendedProductIds
          ? { recommendedProductIds: settings.recommendedProductIds }
          : {}),
        ...(settings.serviceRequestReasons
          ? { serviceRequestReasons: settings.serviceRequestReasons }
          : {}),
      });
      setMessage("Política e identidade dos QR codes salvas.");
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao salvar a configuração."));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (selected.size === 0) {
      setMessage("Selecione pelo menos uma mesa.");
      return;
    }
    setBusy(true);
    try {
      const result = await createQrArtwork({ tableIds: [...selected], format, size });
      setArtwork(result);
      setMessage(`${result.items.length} material(is) gerado(s) com quiet zone e correção alta.`);
      if (format === "pdf" && result.printHtml) {
        printHtml(result.printHtml);
      }
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao gerar os materiais."));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!settings) return;
    const scheduledIso = toScheduledIso(scheduledAt);
    if (scheduledAt && !scheduledIso) {
      setMessage("Escolha uma data e hora validas para o agendamento.");
      return;
    }
    setBusy(true);
    try {
      const { branchId: _branchId, ...experienceInput } = settings;
      const revision = await createQrExperienceDraft(
        scheduledIso ? { ...experienceInput, scheduledAt: scheduledIso } : experienceInput,
      );
      setExperience((current) => ({
        draft: revision,
        published: current?.published ?? null,
        history: [revision, ...(current?.history ?? [])],
      }));
      setScheduledAt(toDateTimeLocal(revision.scheduledAt));
      setMessage(
        revision.scheduledAt
          ? `Rascunho v${revision.version} agendado para publicação.`
          : `Rascunho v${revision.version} salvo. Publique quando estiver pronto.`,
      );
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao salvar o rascunho."));
    } finally {
      setBusy(false);
    }
  }

  async function showPreview() {
    if (!settings) return;
    setBusy(true);
    try {
      const { branchId: _branchId, ...experienceInput } = settings;
      const result = await previewQrExperience(experienceInput);
      setPreview(result.config);
      setMessage("Prévia calculada sem salvar rascunho nem publicar alterações.");
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao gerar a prévia sem persistência."));
    } finally {
      setBusy(false);
    }
  }

  async function scheduleDraft() {
    const revisionId = experience?.draft?.id;
    const scheduledIso = toScheduledIso(scheduledAt);
    if (!revisionId || !scheduledIso) {
      setMessage("Escolha uma data e hora futuras para agendar o rascunho.");
      return;
    }
    setBusy(true);
    try {
      const scheduled = await scheduleQrExperience(revisionId, scheduledIso);
      setExperience((current) => ({
        draft: scheduled,
        published: current?.published ?? null,
        history: [
          scheduled,
          ...(current?.history ?? []).filter((item) => item.id !== scheduled.id),
        ],
      }));
      setScheduledAt(toDateTimeLocal(scheduled.scheduledAt));
      setMessage(`Publicação da v${scheduled.version} agendada.`);
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao agendar a experiência."));
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    const revisionId = experience?.draft?.id;
    if (!revisionId) return;
    setBusy(true);
    try {
      const published = await publishQrExperience(revisionId);
      setExperience((current) => ({
        draft: null,
        published,
        history: [published, ...(current?.history ?? [])],
      }));
      setScheduledAt("");
      setMessage(`Experiência v${published.version} publicada sem trocar os QR codes.`);
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao publicar a experiência."));
    } finally {
      setBusy(false);
    }
  }

  async function rollback(revision: GuestExperienceRevision) {
    if (revision.status === "draft" || revision.id === experience?.published?.id) return;
    if (
      !window.confirm(
        `Restaurar a experiencia v${revision.version}? Uma nova versao publicada sera criada sem trocar os QR codes.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const restored = await rollbackQrExperience(revision.id);
      setExperience((current) => ({
        draft: null,
        published: restored,
        history: [restored, ...(current?.history ?? []).filter((item) => item.id !== restored.id)],
      }));
      setSettings((current) =>
        current
          ? {
              ...current,
              ...restored.config,
            }
          : current,
      );
      setScheduledAt("");
      setMessage(
        `Experiencia restaurada a partir da v${revision.version} como v${restored.version}.`,
      );
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao restaurar a experiencia."));
    } finally {
      setBusy(false);
    }
  }

  async function rotate(table: QrAdminTable) {
    if (
      !window.confirm(
        `Rotacionar o QR da ${table.name}? O material impresso anteriormente deixará de funcionar imediatamente.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await rotateQrTable(table.id);
      setArtwork(null);
      await load();
      setMessage(`QR da ${table.name} rotacionado e material anterior invalidado.`);
    } catch (error) {
      setMessage(getErrorMessage(error, "Falha ao rotacionar o QR."));
    } finally {
      setBusy(false);
    }
  }

  function toggleCapability(capability: QrCapability) {
    if (!settings) return;
    const enabled = settings.capabilities.includes(capability);
    const capabilities = enabled
      ? settings.capabilities.filter((item) => item !== capability)
      : [...settings.capabilities, capability];
    if (capabilities.length === 0) return;
    setSettings({ ...settings, capabilities });
  }

  function togglePresenceMethod(method: QrBranchSettings["presenceMethods"][number]) {
    if (!settings) return;
    const enabled = settings.presenceMethods.includes(method);
    const presenceMethods = enabled
      ? settings.presenceMethods.filter((item) => item !== method)
      : [...settings.presenceMethods, method];
    if (presenceMethods.length > 0) setSettings({ ...settings, presenceMethods });
  }

  function setCategoryLabel(categoryId: string, label: string) {
    if (!settings) return;
    const categoryLabels = { ...(settings.categoryLabels ?? {}) };
    if (label.trim()) categoryLabels[categoryId] = label;
    else delete categoryLabels[categoryId];
    setSettings({ ...settings, categoryLabels });
  }

  function toggleRecommendation(productId: string) {
    if (!settings) return;
    const current = settings.recommendedProductIds ?? [];
    const recommendedProductIds = current.includes(productId)
      ? current.filter((id) => id !== productId)
      : current.length < 12
        ? [...current, productId]
        : current;
    setSettings({ ...settings, recommendedProductIds });
  }

  return (
    <main className="workspace-page qr-admin-page">
      <header className="workspace-topbar">
        <a className="brand" href="/app">
          <span className="brand-mark brand-mark-logo" aria-hidden="true" />
          <span>GiroMesa</span>
        </a>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>

      <section className="workspace-heading qr-heading">
        <div>
          <span className="section-kicker">
            <QrCode size={16} /> Atendimento digital
          </span>
          <h1>QR personalizado por mesa</h1>
          <p>Configure recursos, gere lotes prontos para impressão e revogue materiais antigos.</p>
        </div>
        <span className="qr-security-chip">Token assinado e revogável</span>
      </section>

      <p className="workspace-message" role="status">
        {message}
      </p>

      {settings ? (
        <section className="qr-admin-grid">
          <article className="workspace-list-section qr-settings-card">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">
                  <Palette size={15} /> Modelo
                </span>
                <h2>Identidade e política</h2>
              </div>
            </div>

            <fieldset className="qr-capabilities">
              <legend>Como os clientes usarão o QR?</legend>
              {[
                ["disabled", "QR desligado", "Nenhum acesso pelo QR nesta filial."],
                ["menu_only", "Somente cardápio", "Consulta preços e produtos, sem ações na mesa."],
                [
                  "waiter_assisted",
                  "Atendimento com garçom",
                  "Cardápio, comanda e solicitações; o garçom conduz os pedidos.",
                ],
                [
                  "self_service",
                  "Autoatendimento",
                  "O cliente também envia pedidos após confirmar presença.",
                ],
              ].map(([value, label, description]) => (
                <label key={value}>
                  <input
                    checked={settings.mode === value}
                    name="qr-mode"
                    onChange={() =>
                      setSettings({ ...settings, mode: value as QrBranchSettings["mode"] })
                    }
                    type="radio"
                  />
                  <span>
                    <strong>{label}</strong>
                    <small className="muted-copy">{description}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            {settings.mode === "waiter_assisted" || settings.mode === "self_service" ? (
              <details>
                <summary>Segurança para confirmar que o cliente está na mesa</summary>
                <p className="muted-copy">
                  O QR identifica a mesa. A primeira ação protegida exige uma confirmação
                  temporária.
                </p>
                <fieldset className="qr-capabilities">
                  <legend>Formas aceitas</legend>
                  {[
                    ["code", "Código de 6 dígitos mostrado pela equipe"],
                    ["approval", "Aprovação rápida do garçom"],
                    ["network", "Rede autorizada do estabelecimento"],
                  ].map(([value, label]) => (
                    <label key={value}>
                      <input
                        checked={settings.presenceMethods.includes(
                          value as QrBranchSettings["presenceMethods"][number],
                        )}
                        onChange={() =>
                          togglePresenceMethod(value as QrBranchSettings["presenceMethods"][number])
                        }
                        type="checkbox"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
                <div className="form-grid two-columns">
                  <label>
                    Comanda visível
                    <select
                      value={settings.tabVisibility}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          tabVisibility: event.target.value as QrBranchSettings["tabVisibility"],
                        })
                      }
                    >
                      <option value="shared">Toda a mesa, sem dados pessoais</option>
                      <option value="own_items">Somente itens deste aparelho</option>
                    </select>
                  </label>
                  <label>
                    Sessão confirmada por (minutos)
                    <input
                      max={1440}
                      min={5}
                      onChange={(event) =>
                        setSettings({
                          ...settings,
                          guestSessionTtlMinutes: Number(event.target.value) || 5,
                        })
                      }
                      type="number"
                      value={settings.guestSessionTtlMinutes}
                    />
                  </label>
                </div>
              </details>
            ) : null}

            <div className="form-grid two-columns">
              <label>
                Modelo visual
                <select
                  value={settings.template}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      template: event.target.value as QrBranchSettings["template"],
                    })
                  }
                >
                  <option value="classic">Clássico</option>
                  <option value="minimal">Minimalista</option>
                  <option value="premium">Premium</option>
                  <option value="gastronomia">Gastronomia</option>
                  <option value="bar_noturno">Bar noturno</option>
                  <option value="cafe">Café</option>
                  <option value="doseclub">DoseClub</option>
                </select>
              </label>
              <label>
                Fonte da experiência
                <select
                  value={settings.fontPreset ?? "system"}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      fontPreset: event.target.value as NonNullable<QrBranchSettings["fontPreset"]>,
                    })
                  }
                >
                  <option value="system">Sistema (Poppins)</option>
                  <option value="serif">Serifada editorial</option>
                  <option value="display">Display acolhedora</option>
                </select>
                <span className="muted-copy">
                  A fonte é aplicada ao publicar a experiência; não aceita CSS ou fontes externas.
                </span>
              </label>
              <label>
                Cor principal
                <input
                  aria-label="Cor principal"
                  onChange={(event) =>
                    setSettings({ ...settings, primaryColor: event.target.value })
                  }
                  type="color"
                  value={settings.primaryColor}
                />
              </label>
            </div>
            <label>
              Instrução impressa
              <input
                maxLength={180}
                onChange={(event) => setSettings({ ...settings, instruction: event.target.value })}
                value={settings.instruction}
              />
            </label>
            <div className="form-grid two-columns">
              <label>
                Título do cardápio
                <input
                  maxLength={120}
                  onChange={(event) =>
                    setSettings({ ...settings, menuHeadline: event.target.value })
                  }
                  placeholder="Pedido da mesa"
                  value={settings.menuHeadline ?? ""}
                />
              </label>
              <label>
                Mensagem de boas-vindas
                <input
                  maxLength={180}
                  onChange={(event) =>
                    setSettings({ ...settings, welcomeMessage: event.target.value })
                  }
                  placeholder="Bem-vindo ao nosso atendimento"
                  value={settings.welcomeMessage ?? ""}
                />
              </label>
            </div>
            <div className="form-grid two-columns">
              <label>
                Imagem de capa
                <input
                  maxLength={500}
                  onChange={(event) =>
                    setSettings({ ...settings, coverUrl: event.target.value || null })
                  }
                  placeholder="https://... ou /uploads/capa.webp"
                  value={settings.coverUrl ?? ""}
                />
                <span className="muted-copy">Somente HTTPS ou arquivos em /uploads/.</span>
              </label>
              <label>
                Idioma da experiência pública
                <select
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      language: event.target.value as NonNullable<QrBranchSettings["language"]>,
                    })
                  }
                  value={settings.language ?? "pt-BR"}
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </label>
            </div>
            <div className="form-grid two-columns">
              <label>
                Destaques da casa
                <input
                  maxLength={500}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      highlights: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean)
                        .slice(0, 6),
                    })
                  }
                  placeholder="Happy hour, música ao vivo, varanda"
                  value={settings.highlights?.join(", ") ?? ""}
                />
              </label>
              <label>
                Mensagem de campanha
                <input
                  maxLength={180}
                  onChange={(event) =>
                    setSettings({ ...settings, campaignMessage: event.target.value })
                  }
                  placeholder="Hoje: rodada dupla até 20h"
                  value={settings.campaignMessage ?? ""}
                />
              </label>
            </div>
            <label>
              Informações da casa
              <textarea
                maxLength={300}
                onChange={(event) => setSettings({ ...settings, houseInfo: event.target.value })}
                placeholder="Wi-Fi, acessibilidade, horários ou orientações úteis"
                rows={3}
                value={settings.houseInfo ?? ""}
              />
            </label>
            <label>
              Motivos rápidos para chamar atendimento
              <input
                maxLength={640}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    serviceRequestReasons: event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean)
                      .slice(0, 8),
                  })
                }
                placeholder="Mais guardanapos, Repor bebida, Dúvida no cardápio"
                value={settings.serviceRequestReasons?.join(", ") ?? ""}
              />
              <span className="muted-copy">Até 8 motivos; nenhum dado pessoal é solicitado.</span>
            </label>
            {categories.length ? (
              <fieldset className="qr-category-labels">
                <legend>Nomes das categorias na experiência pública</legend>
                {categories.map((category) => (
                  <label key={category.id}>
                    <span>{category.name}</span>
                    <input
                      maxLength={80}
                      onChange={(event) => setCategoryLabel(category.id, event.target.value)}
                      placeholder={category.name}
                      value={settings.categoryLabels?.[category.id] ?? ""}
                    />
                  </label>
                ))}
              </fieldset>
            ) : null}
            {products.length ? (
              <fieldset className="qr-capabilities">
                <legend>Recomendações em destaque (até 12)</legend>
                {products.map((product) => (
                  <label key={product.id}>
                    <input
                      checked={settings.recommendedProductIds?.includes(product.id) ?? false}
                      onChange={() => toggleRecommendation(product.id)}
                      type="checkbox"
                    />
                    <span>{product.name}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className="qr-switch-row">
              <input
                checked={settings.marketingEnabled !== false}
                onChange={(event) =>
                  setSettings({ ...settings, marketingEnabled: event.target.checked })
                }
                type="checkbox"
              />
              <span>Exibir a assinatura discreta Tecnologia GiroMesa na experiência pública</span>
            </label>
            <label className="qr-switch-row">
              <input
                checked={settings.showLogo}
                onChange={(event) => setSettings({ ...settings, showLogo: event.target.checked })}
                type="checkbox"
              />
              <span>Exibir a marca do estabelecimento no material e na experiência pública</span>
            </label>

            <details>
              <summary>Recursos avançados do QR</summary>
              <fieldset className="qr-capabilities">
                <legend>Recursos disponíveis ao cliente</legend>
                {Object.entries(capabilityLabels).map(([value, label]) => (
                  <label key={value}>
                    <input
                      checked={settings.capabilities.includes(value as QrCapability)}
                      onChange={() => toggleCapability(value as QrCapability)}
                      type="checkbox"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
              <label className="qr-switch-row">
                <input
                  checked={settings.reviewBeforeKds}
                  onChange={(event) =>
                    setSettings({ ...settings, reviewBeforeKds: event.target.checked })
                  }
                  type="checkbox"
                />
                <span>Equipe revisa pedidos QR antes de enviar ao KDS</span>
              </label>
            </details>
            {experience?.draft ? (
              <label className="qr-schedule-field">
                Publicar rascunho automaticamente em (opcional)
                <input
                  min={minimumDateTimeLocal()}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  type="datetime-local"
                  value={scheduledAt}
                />
                <span className="muted-copy">
                  A publicação ocorre na primeira leitura do QR após o horário, sem trocar o token.
                </span>
              </label>
            ) : null}
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void saveSettings()}
              type="button"
            >
              Salvar configuração
            </button>
            <div className="qr-experience-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void showPreview()}
                type="button"
              >
                <Eye size={16} /> Pré-visualizar sem salvar
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void saveDraft()}
                type="button"
              >
                Salvar rascunho
              </button>
              {experience?.draft ? (
                <>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void publishDraft()}
                    type="button"
                  >
                    Publicar v{experience.draft.version}
                  </button>
                  {scheduledAt ? (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void scheduleDraft()}
                      type="button"
                    >
                      Agendar publicação
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
            {preview ? (
              <article className="panel" aria-label="Prévia não persistida">
                <span className="section-kicker">Prévia local</span>
                <h3>{preview.welcomeMessage || "Bem-vindo"}</h3>
                <p>{preview.menuHeadline || preview.instruction}</p>
                <small className="muted-copy">
                  Modelo {preview.template} · cor {preview.primaryColor} · nenhuma versão foi criada
                </small>
              </article>
            ) : null}
            <p className="muted-copy">
              {experience?.published
                ? `Versão publicada: v${experience.published.version}. Alterações ficam em rascunho até a publicação.`
                : "Nenhuma versão publicada ainda; a política atual continua ativa."}
            </p>
          </article>

          <article className="workspace-list-section qr-generation-card">
            <div className="panel-heading">
              <div>
                <span className="section-kicker">
                  <Printer size={15} /> Saída
                </span>
                <h2>Gerar material</h2>
              </div>
            </div>
            <div className="form-grid two-columns">
              <label>
                Formato
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value as typeof format)}
                >
                  <option value="svg">SVG vetorial</option>
                  <option value="png">PNG 1024 px</option>
                  <option value="pdf">Imprimir / salvar PDF</option>
                </select>
              </label>
              <label>
                Tamanho
                <select
                  value={size}
                  onChange={(event) => setSize(event.target.value as typeof size)}
                >
                  <option value="plate_10x15">Placa 10 × 15 cm</option>
                  <option value="sticker_8x8">Adesivo 8 × 8 cm</option>
                  <option value="a4">Folha A4</option>
                </select>
              </label>
            </div>
            <div className="qr-generation-summary">
              <strong>{selected.size}</strong>
              <span>mesa(s) selecionada(s)</span>
            </div>
            <button
              className="button primary"
              disabled={busy || selected.size === 0}
              onClick={() => void generate()}
              type="button"
            >
              <QrCode size={17} /> Gerar e visualizar
            </button>
            <p className="muted-copy">
              O QR usa correção alta, margem de quatro módulos e contraste validado para impressão.
            </p>
          </article>
        </section>
      ) : null}

      {experience?.history.length ? (
        <section className="workspace-list-section qr-history-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Historico</span>
              <h2>Versoes da experiencia publica</h2>
            </div>
            <span className="muted-copy">Restaurar cria uma nova versao auditavel.</span>
          </div>
          <div className="qr-history-list">
            {experience.history.slice(0, 8).map((revision) => {
              const canRestore =
                revision.status !== "draft" && revision.id !== experience.published?.id;
              return (
                <article className="qr-history-row" key={revision.id}>
                  <div>
                    <strong>v{revision.version}</strong>
                    <span>{experienceStatusLabel(revision.status)}</span>
                  </div>
                  <time dateTime={revision.createdAt}>
                    {formatExperienceDate(revision.createdAt)}
                  </time>
                  {revision.id === experience.published?.id ? (
                    <span className="count-chip">Publicada agora</span>
                  ) : canRestore ? (
                    <button
                      className="button secondary compact"
                      disabled={busy}
                      onClick={() => void rollback(revision)}
                      type="button"
                    >
                      <RotateCw size={14} /> Restaurar
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="workspace-list-section">
        <div className="panel-heading qr-table-heading">
          <div>
            <span className="section-kicker">Mesas</span>
            <h2>Seleção e rotação</h2>
          </div>
          <label className="qr-select-all">
            <input
              checked={allSelected}
              onChange={(event) =>
                setSelected(
                  event.target.checked ? new Set(tables.map((table) => table.id)) : new Set(),
                )
              }
              type="checkbox"
            />
            Selecionar todas
          </label>
        </div>
        <div className="qr-table-list">
          {tables.map((table) => (
            <article className="qr-table-row" key={table.id}>
              <input
                aria-label={`Selecionar ${table.name}`}
                checked={selected.has(table.id)}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(table.id);
                    else next.delete(table.id);
                    return next;
                  })
                }
                type="checkbox"
              />
              <div>
                <strong>{table.code}</strong>
                <span>
                  {table.name} · {table.seats} lugares
                </span>
              </div>
              <span className="count-chip">v{table.qrTokenVersion}</span>
              <a
                className="button secondary compact"
                href={table.publicUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={14} /> Abrir
              </a>
              <button
                className="button secondary compact"
                disabled={busy}
                onClick={() => void rotate(table)}
                type="button"
              >
                <RotateCw size={14} /> Rotacionar
              </button>
            </article>
          ))}
          {tables.length === 0 && !busy ? (
            <p className="empty-state">Cadastre mesas no mapa do salão primeiro.</p>
          ) : null}
        </div>
      </section>

      {artwork ? (
        <section className="workspace-list-section">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">Prévia</span>
              <h2>Materiais gerados</h2>
            </div>
            {artwork.printHtml ? (
              <button
                className="button secondary"
                onClick={() => printHtml(artwork.printHtml ?? "")}
                type="button"
              >
                <Printer size={16} /> Imprimir / PDF
              </button>
            ) : null}
          </div>
          <div className="qr-preview-grid">
            {artwork.items.map((item) => (
              <article className="qr-preview-card" key={item.tableId}>
                {artwork.branding?.logoUrl ? (
                  // biome-ignore lint/performance/noImgElement: branding URLs are tenant-managed.
                  <img className="qr-preview-logo" src={artwork.branding.logoUrl} alt="" />
                ) : null}
                <span>{artwork.branding?.displayName ?? "GiroMesa"}</span>
                <strong>{item.tableName}</strong>
                <span>{item.tableCode}</span>
                {/* biome-ignore lint/performance/noImgElement: prévia SVG gerada em runtime pelo backend. */}
                <img
                  alt={`QR da ${item.tableName}`}
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svg)}`}
                />
                <p>{artwork.settings.instruction}</p>
                {artwork.format === "pdf" ? (
                  <small className="muted-copy">
                    Use “Imprimir / PDF” para exportar este lote.
                  </small>
                ) : (
                  <button
                    className="button secondary compact"
                    onClick={() =>
                      downloadData(
                        item.fileName,
                        item.png ??
                          `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svg)}`,
                      )
                    }
                    type="button"
                  >
                    <Download size={14} /> Baixar
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function printHtml(html: string) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Permita pop-ups para imprimir ou salvar o PDF.");
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  popup.print();
}

function downloadData(fileName: string, data: string) {
  const anchor = document.createElement("a");
  anchor.href = data;
  anchor.download = fileName;
  anchor.click();
}

function experienceStatusLabel(status: GuestExperienceRevision["status"]) {
  if (status === "published") return "Publicada";
  if (status === "draft") return "Rascunho";
  return "Arquivada";
}

function formatExperienceDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function toScheduledIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function minimumDateTimeLocal() {
  return toDateTimeLocal(new Date(Date.now() + 60_000).toISOString());
}
