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

export function Dialog({
  open,
  title,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="gm-dialog-backdrop">
      <section
        aria-label={title}
        aria-modal="true"
        className="gm-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Fechar" className="gm-icon-button" onClick={onClose} type="button">
            <span aria-hidden="true" className="gm-close-icon" />
          </button>
        </header>
        <div className="gm-dialog-body">{children}</div>
        {actions ? <footer>{actions}</footer> : null}
      </section>
    </div>
  );
}

export function Drawer({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="gm-drawer-backdrop">
      <aside
        aria-label={title}
        aria-modal="true"
        className="gm-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <h2>{title}</h2>
          <button aria-label="Fechar" className="gm-icon-button" onClick={onClose} type="button">
            <span aria-hidden="true" className="gm-close-icon" />
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}

export function MoneyInput({
  label,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"input"> & { label: string }) {
  return (
    <label className="gm-field">
      <span>{label}</span>
      <span className="gm-money-input">
        <b>R$</b>
        <input className={`gm-input ${className}`.trim()} inputMode="decimal" {...props} />
      </span>
    </label>
  );
}

export function PinInput({
  label = "PIN do gerente",
  ...props
}: ComponentPropsWithoutRef<"input"> & { label?: string }) {
  return (
    <label className="gm-field">
      <span>{label}</span>
      <input
        autoComplete="one-time-code"
        className="gm-input gm-pin-input"
        inputMode="numeric"
        maxLength={6}
        pattern="[0-9]*"
        type="password"
        {...props}
      />
    </label>
  );
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  destructive = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      actions={
        <>
          <Button onClick={onCancel} variant="ghost">
            Cancelar
          </Button>
          <Button onClick={onConfirm} variant={destructive ? "danger" : "primary"}>
            {confirmLabel}
          </Button>
        </>
      }
      onClose={onCancel}
      open={open}
      title={title}
    >
      <p>{description}</p>
    </Dialog>
  );
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
