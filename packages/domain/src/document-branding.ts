export type DocumentAccentPreset = "emerald" | "blue" | "amber" | "rose" | "violet";
export type DocumentThemeMode = "light" | "dark" | "system";

export type DocumentBranding = {
  displayName: string;
  logoUrl: string | null;
  themeMode?: DocumentThemeMode;
  accentPreset?: DocumentAccentPreset;
};

export type DocumentMetric = {
  label: string;
  value: string;
};

export type DocumentMetadataItem = {
  label: string;
  value: string;
};

const accentPalette: Record<DocumentAccentPreset, string> = {
  emerald: "#0b826d",
  blue: "#2563a8",
  amber: "#b97014",
  rose: "#bd3f4a",
  violet: "#6658b7",
};

export function accentPresetToHex(preset: DocumentAccentPreset | undefined) {
  return accentPalette[preset ?? "emerald"];
}

export function buildDocumentInitial(displayName: string) {
  return displayName.trim().slice(0, 1).toUpperCase() || "G";
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderBrandMark(branding: DocumentBranding, accentHex: string) {
  if (branding.logoUrl) {
    return `<img src="${escapeHtml(branding.logoUrl)}" alt="" style="width:52px;height:52px;border-radius:14px;object-fit:cover;border:1px solid rgba(11,130,109,0.14);">`;
  }

  return `<div style="width:52px;height:52px;border-radius:14px;background:${accentHex};color:#ffffff;display:grid;place-items:center;font-weight:800;font-size:20px;letter-spacing:0;">${escapeHtml(
    buildDocumentInitial(branding.displayName),
  )}</div>`;
}

function renderMetadata(items: DocumentMetadataItem[]) {
  if (!items.length) {
    return "";
  }

  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:24px 0 0;">${items
    .map(
      (
        item,
      ) => `<div style="padding:14px 16px;border:1px solid #dce4df;border-radius:14px;background:#f8faf8;">
        <div style="font-size:11px;line-height:1.3;text-transform:uppercase;letter-spacing:0.08em;color:#6b7772;">${escapeHtml(item.label)}</div>
        <div style="margin-top:6px;font-size:14px;line-height:1.45;color:#14201d;font-weight:700;">${escapeHtml(item.value)}</div>
      </div>`,
    )
    .join("")}</div>`;
}

function renderMetrics(metrics: DocumentMetric[]) {
  if (!metrics.length) {
    return "";
  }

  return `<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin:28px 0;">${metrics
    .map(
      (
        metric,
      ) => `<article style="padding:16px;border-radius:16px;border:1px solid #dce4df;background:#ffffff;box-shadow:0 12px 30px rgba(20,32,29,0.06);">
        <div style="font-size:12px;line-height:1.3;color:#6b7772;">${escapeHtml(metric.label)}</div>
        <strong style="display:block;margin-top:8px;font-size:22px;line-height:1.1;color:#14201d;">${escapeHtml(metric.value)}</strong>
      </article>`,
    )
    .join("")}</section>`;
}

export function renderBrandedEmail(input: {
  branding: DocumentBranding;
  title: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  footerNote?: string;
}) {
  const accentHex = accentPresetToHex(input.branding.accentPreset);
  const footerNote =
    input.footerNote ??
    `${input.branding.displayName} usa GiroMesa para operacao, atendimento e gestao food service.`;

  return `<div style="margin:0;padding:32px 16px;background:#eff4f1;font-family:Inter,Segoe UI,Arial,sans-serif;color:#14201d;">
    <div style="max-width:620px;margin:0 auto;border-radius:24px;overflow:hidden;background:#ffffff;border:1px solid #dce4df;box-shadow:0 22px 60px rgba(20,32,29,0.12);">
      <div style="padding:22px 24px;background:linear-gradient(135deg, ${accentHex}, #14201d);">
        <div style="display:flex;align-items:center;gap:14px;">
          ${renderBrandMark(input.branding, accentHex)}
          <div>
            <div style="font-size:11px;line-height:1.3;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.72);">Comunicacao oficial</div>
            <div style="margin-top:4px;font-size:18px;line-height:1.2;font-weight:800;color:#ffffff;">${escapeHtml(input.branding.displayName)}</div>
          </div>
        </div>
      </div>
      <div style="padding:28px 24px 26px;">
        <h1 style="margin:0 0 10px;font-size:28px;line-height:1.08;color:#14201d;">${escapeHtml(input.title)}</h1>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#5f6d67;">${escapeHtml(input.body)}</p>
        <a href="${escapeHtml(input.actionUrl)}" style="display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 18px;border-radius:12px;background:${accentHex};color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">${escapeHtml(input.actionLabel)}</a>
        <div style="margin-top:22px;padding-top:18px;border-top:1px solid #e3ebe6;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#73807a;">${escapeHtml(footerNote)}</p>
        </div>
      </div>
    </div>
  </div>`;
}

export function renderBrandedPrintDocument(input: {
  branding: DocumentBranding;
  documentLabel: string;
  title: string;
  subtitle?: string;
  metadata?: DocumentMetadataItem[];
  metrics?: DocumentMetric[];
  bodyHtml: string;
  footerNote?: string;
}) {
  const accentHex = accentPresetToHex(input.branding.accentPreset);
  const metadata = input.metadata ?? [];
  const metrics = input.metrics ?? [];
  const footerNote =
    input.footerNote ?? `Documento emitido por GiroMesa para ${input.branding.displayName}.`;

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(input.title)}</title>
      <style>
        :root {
          color-scheme: light;
        }
        * {
          box-sizing: border-box;
        }
        body {
          margin: 0;
          background: #edf3ef;
          color: #14201d;
          font-family: Inter, "Segoe UI", Arial, sans-serif;
          padding: 28px;
        }
        .sheet {
          max-width: 980px;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #dce4df;
          border-radius: 28px;
          overflow: hidden;
          box-shadow: 0 28px 80px rgba(20, 32, 29, 0.14);
        }
        .hero {
          padding: 24px 28px;
          background: linear-gradient(135deg, ${accentHex}, #14201d);
          color: #ffffff;
        }
        .hero-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .brand small,
        .hero-tag {
          display: block;
          font-size: 11px;
          line-height: 1.3;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.72);
        }
        .brand strong {
          display: block;
          margin-top: 4px;
          font-size: 18px;
          line-height: 1.2;
        }
        .hero-tag {
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.16);
          color: #ffffff;
        }
        .content {
          padding: 28px;
        }
        h1 {
          margin: 0;
          font-size: 30px;
          line-height: 1.08;
          color: #14201d;
        }
        .subtitle {
          margin: 12px 0 0;
          font-size: 15px;
          line-height: 1.7;
          color: #607069;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 18px;
        }
        th,
        td {
          padding: 12px 10px;
          border-bottom: 1px solid #e5ece8;
          text-align: left;
          vertical-align: top;
          font-size: 13px;
        }
        th {
          font-size: 11px;
          line-height: 1.3;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6a7772;
        }
        .section {
          margin-top: 26px;
          padding: 18px 20px;
          border: 1px solid #dce4df;
          border-radius: 18px;
          background: #f8faf8;
        }
        .section h2 {
          margin: 0 0 12px;
          font-size: 16px;
          line-height: 1.2;
          color: #14201d;
        }
        .footer {
          margin-top: 28px;
          padding-top: 18px;
          border-top: 1px solid #e5ece8;
          font-size: 12px;
          line-height: 1.6;
          color: #6f7d77;
        }
        @media print {
          body {
            padding: 0;
            background: #ffffff;
          }
          .sheet {
            border: 0;
            border-radius: 0;
            box-shadow: none;
            max-width: none;
          }
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <header class="hero">
          <div class="hero-row">
            <div class="brand">
              ${renderBrandMark(input.branding, accentHex)}
              <div>
                <small>Documento padronizado</small>
                <strong>${escapeHtml(input.branding.displayName)}</strong>
              </div>
            </div>
            <div class="hero-tag">${escapeHtml(input.documentLabel)}</div>
          </div>
        </header>
        <section class="content">
          <h1>${escapeHtml(input.title)}</h1>
          ${input.subtitle ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>` : ""}
          ${renderMetadata(metadata)}
          ${renderMetrics(metrics)}
          ${input.bodyHtml}
          <div class="footer">${escapeHtml(footerNote)}</div>
        </section>
      </main>
    </body>
  </html>`;
}
