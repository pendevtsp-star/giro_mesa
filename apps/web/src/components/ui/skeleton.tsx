import type { ReactNode } from "react";

interface SkeletonProps {
  className?: string;
  children?: ReactNode;
}

export function Skeleton({ className = "", children }: SkeletonProps) {
  return (
    <div className={`gm-skeleton ${className}`} aria-hidden="true">
      {children}
    </div>
  );
}

export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`gm-skeleton-text ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders never reorder or hold state.
          key={i}
          className="gm-skeleton-line"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`gm-skeleton-card ${className}`} aria-hidden="true">
      <div className="gm-skeleton-card-header">
        <div className="gm-skeleton-circle" />
        <div className="gm-skeleton-text" style={{ flex: 1 }}>
          <div className="gm-skeleton-line" style={{ width: "40%" }} />
          <div className="gm-skeleton-line" style={{ width: "60%" }} />
        </div>
      </div>
      <div className="gm-skeleton-card-body">
        <div className="gm-skeleton-line" style={{ width: "100%" }} />
        <div className="gm-skeleton-line" style={{ width: "80%" }} />
        <div className="gm-skeleton-line" style={{ width: "60%" }} />
      </div>
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className = "",
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={`gm-skeleton-table ${className}`} aria-hidden="true">
      <div className="gm-skeleton-table-header">
        {Array.from({ length: cols }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders never reorder or hold state.
          <div key={i} className="gm-skeleton-table-cell gm-skeleton-table-cell-header">
            <div className="gm-skeleton-line" style={{ width: "70%" }} />
          </div>
        ))}
      </div>
      <div className="gm-skeleton-table-body">
        {Array.from({ length: rows }, (_, rowIndex) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders never reorder or hold state.
          <div key={rowIndex} className="gm-skeleton-table-row">
            {Array.from({ length: cols }, (_, colIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders never reorder or hold state.
              <div key={colIndex} className="gm-skeleton-table-cell">
                <div
                  className="gm-skeleton-line"
                  style={{ width: `${50 + Math.random() * 40}%` }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
