"use client";

import { ArrowLeft, ExternalLink, ImageUp, Palette, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getTenantBranding,
  removeTenantLogo,
  type TenantBranding,
  updateTenantBranding,
  uploadTenantLogo,
} from "../../../../lib/giromesa-api";

const fallbackBranding: TenantBranding = {
  displayName: "Bar Aurora",
  logoUrl: null,
  themeMode: "light",
  accentPreset: "emerald",
};

const accentOptions: Array<{
  value: TenantBranding["accentPreset"];
  label: string;
  color: string;
}> = [
  { value: "emerald", label: "Verde", color: "#0b826d" },
  { value: "blue", label: "Azul", color: "#2563a8" },
  { value: "amber", label: "Âmbar", color: "#b97014" },
  { value: "rose", label: "Rosa", color: "#bd3f4a" },
  { value: "violet", label: "Violeta", color: "#6658b7" },
];

export default function BrandingSettingsPage() {
  const [branding, setBranding] = useState<TenantBranding>(fallbackBranding);
  const [form, setForm] = useState<TenantBranding>(fallbackBranding);
  const [status, setStatus] = useState("Carregando identidade do estabelecimento.");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    getTenantBranding()
      .then((response) => {
        if (!ignore) {
          setBranding(response);
          setForm(response);
          setStatus("Identidade carregada.");
        }
      })
      .catch(() => {
        if (!ignore) {
          setStatus("Prévia ilustrativa disponível enquanto a identidade não é carregada.");
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  async function run(action: () => Promise<void>) {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar identidade.");
    } finally {
      setIsBusy(false);
    }
  }

  function saveBranding() {
    void run(async () => {
      const updated = await updateTenantBranding(form);
      setBranding(updated);
      setForm(updated);
      setStatus("Identidade visual salva.");
    });
  }

  function uploadLogo(file: File | null) {
    if (!file) {
      return;
    }

    void run(async () => {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        throw new Error("Use uma logo PNG, JPEG ou WebP.");
      }
      if (file.size > 512 * 1024) {
        throw new Error("A logo deve ter no máximo 512 KB.");
      }

      const dataUrl = await readFileAsDataUrl(file);
      const response = await uploadTenantLogo({ fileName: file.name, dataUrl });
      setBranding(response.branding);
      setForm(response.branding);
      setStatus("Logo enviada e aplicada.");
    });
  }

  function clearLogo() {
    void run(async () => {
      const response = await removeTenantLogo();
      setBranding(response.branding);
      setForm(response.branding);
      setStatus("Logo removida do ambiente.");
    });
  }

  const initial = form.displayName.slice(0, 1).toUpperCase() || "G";

  return (
    <main className="branding-page" data-theme={form.themeMode} data-accent={form.accentPreset}>
      <header className="branding-page-header">
        <a className="button secondary" href="/app">
          <ArrowLeft size={17} /> Voltar
        </a>
        <div>
          <span className="section-kicker">Identidade visual</span>
          <h1>Personalização do ambiente</h1>
          <p>Defina como o estabelecimento aparece no painel, cardápio QR e comunicações.</p>
        </div>
      </header>

      <section className="branding-settings-layout">
        <article className="panel branding-settings-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Marca</span>
              <h2>Dados visuais</h2>
            </div>
            <Palette size={20} />
          </div>
          <form
            className="branding-form"
            onSubmit={(event) => {
              event.preventDefault();
              saveBranding();
            }}
          >
            <label>
              Nome exibido
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, displayName: event.target.value }))
                }
                placeholder="Nome do estabelecimento"
              />
            </label>
            <label>
              URL da logo
              <input
                value={form.logoUrl ?? ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, logoUrl: event.target.value || null }))
                }
                placeholder="https://..."
              />
            </label>
            <label className="logo-upload-dropzone" htmlFor="tenant-logo-upload">
              <ImageUp size={22} />
              <span>Enviar logo</span>
              <small>PNG, JPEG ou WebP · até 512 KB</small>
              <input
                id="tenant-logo-upload"
                className="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => uploadLogo(event.target.files?.[0] ?? null)}
              />
            </label>
            <div className="form-grid-compact">
              <label>
                Tema
                <select
                  value={form.themeMode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      themeMode: event.target.value as TenantBranding["themeMode"],
                    }))
                  }
                >
                  <option value="light">Claro</option>
                  <option value="dark">Escuro</option>
                  <option value="system">Sistema</option>
                </select>
              </label>
              <label>
                Cor
                <select
                  value={form.accentPreset}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      accentPreset: event.target.value as TenantBranding["accentPreset"],
                    }))
                  }
                >
                  {accentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="color-swatches">
              <legend>Cores pre-definidas</legend>
              {accentOptions.map((option) => (
                <button
                  className={
                    option.value === form.accentPreset ? "color-swatch selected" : "color-swatch"
                  }
                  type="button"
                  key={option.value}
                  style={{ backgroundColor: option.color }}
                  onClick={() => setForm((current) => ({ ...current, accentPreset: option.value }))}
                  aria-label={`Usar cor ${option.label}`}
                  title={option.label}
                />
              ))}
            </fieldset>
            <div className="ticket-actions">
              <button className="button primary" type="submit" disabled={isBusy}>
                <Palette size={17} /> Salvar identidade
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={clearLogo}
                disabled={isBusy || !branding.logoUrl}
              >
                <Trash2 size={17} /> Remover logo
              </button>
            </div>
          </form>
        </article>

        <aside className="panel branding-preview-panel">
          <div className="panel-title">
            <div>
              <span className="section-kicker">Prévia</span>
              <h2>Como o time verá</h2>
            </div>
            <span className="gm-badge gm-badge-info">{readThemeMode(form.themeMode)}</span>
          </div>
          <div className="branding-preview-shell large">
            <div className="branding-preview-sidebar">
              <span className="tenant-avatar large">
                {form.logoUrl ? (
                  <span
                    className="tenant-logo cover"
                    style={{ backgroundImage: `url(${form.logoUrl})` }}
                    aria-hidden="true"
                  />
                ) : (
                  initial
                )}
              </span>
              <strong>{form.displayName || "Seu estabelecimento"}</strong>
              <span>PDV</span>
              <span>Mesas</span>
              <span>Relatórios</span>
            </div>
            <div className="branding-preview-card">
              <span>Prévia do ambiente</span>
              <strong>Turno jantar</strong>
              <p>{form.displayName} com identidade propria em painel, QR e comunicações.</p>
              <button className="button primary compact" type="button">
                Botao principal
              </button>
            </div>
          </div>
          <div className="branding-public-links">
            <a
              className="button secondary"
              href="/m/bar-aurora-demo"
              target="_blank"
              rel="noopener"
            >
              <ExternalLink size={16} /> Cardápio
            </a>
            <a className="button secondary" href="/q/M03" target="_blank" rel="noopener">
              <ExternalLink size={16} /> QR mesa
            </a>
          </div>
          <p className="muted-copy">{status}</p>
        </aside>
      </section>
    </main>
  );
}

function readThemeMode(themeMode: TenantBranding["themeMode"]) {
  const labels: Record<TenantBranding["themeMode"], string> = {
    light: "claro",
    dark: "escuro",
    system: "sistema",
  };
  return labels[themeMode];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Falha ao ler arquivo."));
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(file);
  });
}
