export function BrandMark({ className = "" }: { className?: string }) {
  return (
    // biome-ignore lint/performance/noImgElement: the local SVG must render before Next image hydration.
    <img
      alt=""
      aria-hidden="true"
      className={`gm-brand-mark brand-mark ${className}`.trim()}
      height="40"
      src="/images/giromesa-symbol.svg"
      width="40"
    />
  );
}

export function BrandLink({ compact = false }: { compact?: boolean }) {
  return (
    <a className="gm-brand-link" href="/app" aria-label="Ir para o painel GiroMesa">
      <BrandMark />
      {compact ? null : <span>GiroMesa</span>}
    </a>
  );
}
