import {
  Banknote,
  Cable,
  ChefHat,
  ClipboardList,
  CreditCard,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  MapPinned,
  PackageOpen,
  Palette,
  Printer,
  QrCode,
  Rocket,
  Settings,
  ShieldCheck,
  Store,
  Truck,
  Users,
} from "lucide-react";

export type AppNavigationGroup = "operation" | "management" | "growth" | "settings" | "ecosystem";

export type AppNavigationItem = {
  group: AppNavigationGroup;
  icon: LucideIcon;
  labelKey: string;
  href: string;
  permissions: readonly string[];
};

export const appNavigationItems = [
  {
    group: "operation",
    icon: LayoutDashboard,
    labelKey: "nav.dashboard",
    href: "/app",
    permissions: [],
  },
  {
    group: "operation",
    icon: ClipboardList,
    labelKey: "nav.pos",
    href: "/app/pos",
    permissions: ["pos:operate"],
  },
  {
    group: "operation",
    icon: MapPinned,
    labelKey: "nav.salon",
    href: "/app/salon",
    permissions: ["pos:operate"],
  },
  {
    group: "operation",
    icon: Users,
    labelKey: "nav.waiter",
    href: "/app/waiter",
    permissions: ["pos:operate"],
  },
  {
    group: "operation",
    icon: ChefHat,
    labelKey: "nav.kds",
    href: "/app/kds",
    permissions: ["kds:operate"],
  },
  {
    group: "management",
    icon: PackageOpen,
    labelKey: "nav.inventory",
    href: "/app/inventory",
    permissions: ["inventory:manage"],
  },
  {
    group: "management",
    icon: Banknote,
    labelKey: "nav.cash",
    href: "/app/cash",
    permissions: ["cash:manage"],
  },
  {
    group: "management",
    icon: CreditCard,
    labelKey: "nav.reports",
    href: "/app/reports",
    permissions: ["reports:read"],
  },
  {
    group: "growth",
    icon: Users,
    labelKey: "nav.customers",
    href: "/app/customers",
    permissions: ["pos:operate"],
  },
  {
    group: "growth",
    icon: Truck,
    labelKey: "nav.delivery",
    href: "/app/delivery",
    permissions: ["delivery:manage"],
  },
  {
    group: "settings",
    icon: QrCode,
    labelKey: "nav.catalog",
    href: "/app/catalog",
    permissions: ["catalog:manage"],
  },
  {
    group: "settings",
    icon: QrCode,
    labelKey: "nav.qr",
    href: "/app/qr",
    permissions: ["tenant:manage"],
  },
  {
    group: "settings",
    icon: Printer,
    labelKey: "nav.printing",
    href: "/app/printing",
    permissions: ["hardware:manage", "printing:manage"],
  },
  {
    group: "settings",
    icon: Rocket,
    labelKey: "nav.onboarding",
    href: "/app/onboarding",
    permissions: ["tenant:manage"],
  },
  {
    group: "ecosystem",
    icon: CreditCard,
    labelKey: "nav.billing",
    href: "/app/billing",
    permissions: ["tenant:manage"],
  },
  {
    group: "ecosystem",
    icon: Cable,
    labelKey: "nav.doseClub",
    href: "/app/integrations/dose-club",
    permissions: ["tenant:manage"],
  },
  {
    group: "settings",
    icon: ShieldCheck,
    labelKey: "nav.operationPolicies",
    href: "/app/settings/operation",
    permissions: ["approvals:manage"],
  },
  {
    group: "settings",
    icon: Palette,
    labelKey: "nav.branding",
    href: "/app/settings/branding",
    permissions: ["tenant:manage"],
  },
  {
    group: "settings",
    icon: ShieldCheck,
    labelKey: "nav.security",
    href: "/app/security",
    permissions: ["tenant:manage"],
  },
  {
    group: "settings",
    icon: Settings,
    labelKey: "nav.team",
    href: "/app/team",
    permissions: ["tenant:manage"],
  },
  {
    group: "settings",
    icon: FileCheck2,
    labelKey: "nav.fiscal",
    href: "/app/fiscal",
    permissions: ["fiscal:manage"],
  },
  {
    group: "settings",
    icon: Gauge,
    labelKey: "nav.outbox",
    href: "/app/outbox",
    permissions: ["tenant:manage"],
  },
  {
    group: "settings",
    icon: Gauge,
    labelKey: "nav.audit",
    href: "/app/audit",
    permissions: ["tenant:manage"],
  },
  {
    group: "ecosystem",
    icon: Store,
    labelKey: "nav.backoffice",
    href: "/platform",
    permissions: ["platform:manage"],
  },
] as const satisfies readonly AppNavigationItem[];

export function filterNavigationByPermissions(
  permissions: readonly string[],
  items: readonly AppNavigationItem[] = appNavigationItems,
) {
  return items.filter((item) => canAccessNavigationItem(item, permissions));
}

export function canAccessNavigationItem(item: AppNavigationItem, permissions: readonly string[]) {
  return (
    item.permissions.length === 0 ||
    item.permissions.some((permission) => permissions.includes(permission))
  );
}

export function requiredNavigationItemForPath(
  currentPath: string,
  items: readonly AppNavigationItem[] = appNavigationItems,
) {
  return [...items]
    .filter((item) => item.href !== "/app")
    .sort((first, second) => second.href.length - first.href.length)
    .find((item) => currentPath === item.href || currentPath.startsWith(`${item.href}/`));
}

export function canAccessAppPath(currentPath: string, permissions: readonly string[]) {
  if (currentPath === "/app") {
    return true;
  }
  const item = requiredNavigationItemForPath(currentPath);
  return item ? canAccessNavigationItem(item, permissions) : false;
}

export function groupNavigationItems(items: readonly AppNavigationItem[]) {
  const groups: Array<{ group: AppNavigationGroup; items: AppNavigationItem[] }> = [];

  for (const item of items) {
    const existing = groups.find((group) => group.group === item.group);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ group: item.group, items: [item] });
    }
  }

  return groups;
}

export function isNavigationItemActive(item: AppNavigationItem, currentPath: string) {
  if (item.href === "/app") {
    return currentPath === "/app";
  }
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}
