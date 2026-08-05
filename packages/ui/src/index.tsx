"use client";

import {
  type ComponentPropsWithoutRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let bodyScrollLocks = 0;
let bodyOverflowBeforeLock = "";

function lockBodyScroll() {
  if (typeof document === "undefined") return;
  if (bodyScrollLocks === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bodyScrollLocks += 1;
}

function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
  if (bodyScrollLocks === 0) document.body.style.overflow = bodyOverflowBeforeLock;
}

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
  initialFocusRef,
  closeLabel = "Fechar",
  dismissible = true,
  className = "",
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
  dismissible?: boolean;
  className?: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll();
    const focusFrame = window.requestAnimationFrame(() => {
      const requested = initialFocusRef?.current;
      const fallback =
        dialogRef.current?.querySelector<HTMLElement>("[data-dialog-initial-focus]") ??
        dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (requested ?? fallback ?? dialogRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      unlockBodyScroll();
      window.requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, [initialFocusRef, open]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && dismissible) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    ).filter((element) => !element.hasAttribute("hidden") && element.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  if (!open) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer dismissal is supplemental; keyboard dismissal is handled by the dialog.
    <div
      className="gm-dialog-backdrop"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={`gm-dialog ${className}`.trim()}
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          {dismissible ? (
            <button
              aria-label={closeLabel}
              className="gm-icon-button"
              onClick={onClose}
              type="button"
            >
              <span aria-hidden="true" className="gm-close-icon" />
            </button>
          ) : null}
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
  initialFocusRef,
  closeLabel = "Fechar",
  dismissible = true,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
  dismissible?: boolean;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll();
    const focusFrame = window.requestAnimationFrame(() => {
      const requested = initialFocusRef?.current;
      const fallback =
        drawerRef.current?.querySelector<HTMLElement>("[data-dialog-initial-focus]") ??
        drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (requested ?? fallback ?? drawerRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      unlockBodyScroll();
      window.requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, [initialFocusRef, open]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && dismissible) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    ).filter((element) => !element.hasAttribute("hidden") && element.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      drawerRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  if (!open) return null;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: pointer dismissal is supplemental; keyboard dismissal is handled by the drawer.
    <div
      className="gm-drawer-backdrop"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className="gm-drawer"
        onKeyDown={handleKeyDown}
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          {dismissible ? (
            <button
              aria-label={closeLabel}
              className="gm-icon-button"
              onClick={onClose}
              type="button"
            >
              <span aria-hidden="true" className="gm-close-icon" />
            </button>
          ) : null}
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
