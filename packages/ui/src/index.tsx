import type { ComponentPropsWithoutRef, ReactNode } from "react";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
};

export function Button({
  variant = "primary",
  className = "",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`gm-button gm-button-${variant} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? "Carregando..." : children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
}) {
  return <span className={`gm-badge gm-badge-${tone}`}>{children}</span>;
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
}) {
  return <span className={`gm-status-pill gm-status-pill-${tone}`}>{children}</span>;
}

export function Card({ children, className = "", ...props }: ComponentPropsWithoutRef<"section">) {
  return (
    <section className={`gm-card ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="gm-page-header">
      <div>
        {kicker ? <span className="gm-kicker">{kicker}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="gm-page-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="gm-section-header">
      <div>
        {kicker ? <span className="gm-kicker">{kicker}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="gm-section-actions">{actions}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <section className="gm-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </section>
  );
}

export const StatCard = MetricCard;

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="gm-empty-state">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div>{action}</div> : null}
    </section>
  );
}

export function Alert({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children?: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  return (
    <section className={`gm-alert gm-alert-${tone}`}>
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </section>
  );
}

export function Input({ className = "", ...props }: ComponentPropsWithoutRef<"input">) {
  return <input className={`gm-input ${className}`.trim()} {...props} />;
}

export function Select({ className = "", ...props }: ComponentPropsWithoutRef<"select">) {
  return <select className={`gm-input ${className}`.trim()} {...props} />;
}

export function Textarea({ className = "", ...props }: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={`gm-input ${className}`.trim()} {...props} />;
}

export function SimpleTable({
  columns,
  rows,
  emptyLabel = "Nenhum registro encontrado.",
}: {
  columns: string[];
  rows: Array<{ id: string; cells: Array<{ key: string; content: ReactNode }> }>;
  emptyLabel?: string;
}) {
  return (
    <div className="gm-table-wrap">
      <table className="gm-simple-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell) => (
                  <td key={cell.key}>{cell.content}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{emptyLabel}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
