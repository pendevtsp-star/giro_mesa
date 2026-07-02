import type { ComponentPropsWithoutRef, ReactNode } from "react";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`gm-button gm-button-${variant} ${className}`.trim()} {...props} />;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return <span className={`gm-badge gm-badge-${tone}`}>{children}</span>;
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <section className="gm-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </section>
  );
}
