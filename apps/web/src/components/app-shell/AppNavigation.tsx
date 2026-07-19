import type { TenantBranding } from "../../lib/giromesa-api";
import { type AppNavigationItem, groupNavigationItems, isNavigationItemActive } from "./navigation";

export function AppNavigation({
  branding,
  items,
  currentPath,
}: {
  branding: TenantBranding;
  items: readonly AppNavigationItem[];
  currentPath: string;
}) {
  const groups = groupNavigationItems(items);

  return (
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="GiroMesa">
        <span className="brand-mark">G</span>
        <span>GiroMesa</span>
      </a>
      <div className="tenant-chip">
        {branding.logoUrl ? (
          <span
            className="tenant-logo"
            style={{ backgroundImage: `url(${branding.logoUrl})` }}
            aria-hidden="true"
          />
        ) : (
          <span className="tenant-mini-mark" aria-hidden="true">
            {branding.displayName.slice(0, 1).toUpperCase() || "G"}
          </span>
        )}
        <span>{branding.displayName}</span>
      </div>
      <nav aria-label="Módulos">
        {groups.map((group) => (
          <div className="nav-group" key={group.group}>
            <span className="nav-group-label">{group.group}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  className={isNavigationItemActive(item, currentPath) ? "active" : ""}
                  href={item.href}
                  key={item.label}
                >
                  <Icon size={18} />
                  {item.label}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
