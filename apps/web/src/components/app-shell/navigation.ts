import {
  Banknote,
  ChefHat,
  ClipboardList,
  CreditCard,
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
  Users,
} from "lucide-react";

export type AppNavigationGroup = "Operação" | "Gestão" | "Configuração" | "Plataforma";

export type AppNavigationItem = {
  group: AppNavigationGroup;
  icon: LucideIcon;
  label: string;
  href: string;
  permissions: readonly string[];
};

export const appNavigationItems = [
  { group: "Operação", icon: LayoutDashboard, label: "Dashboard", href: "/app", permissions: [] },
  {
    group: "Operação",
    icon: ClipboardList,
    label: "PDV",
    href: "/app?view=pos",
    permissions: ["pos:operate"],
  },
  {
    group: "Operação",
    icon: MapPinned,
    label: "Salão",
    href: "/app/salon",
    permissions: ["pos:operate"],
  },
  {
    group: "Operação",
    icon: Users,
    label: "Garçom",
    href: "/app/waiter",
    permissions: ["pos:operate"],
  },
  {
    group: "Operação",
    icon: ChefHat,
    label: "KDS",
    href: "/app/kds",
    permissions: ["pos:kds_send", "kds:operate"],
  },
  {
    group: "Gestão",
    icon: Users,
    label: "Clientes",
    href: "/app/customers",
    permissions: ["pos:operate"],
  },
  {
    group: "Gestão",
    icon: PackageOpen,
    label: "Estoque",
    href: "/app/inventory",
    permissions: ["inventory:manage"],
  },
  {
    group: "Gestão",
    icon: Banknote,
    label: "Caixa",
    href: "/app/cash",
    permissions: ["pos:payment_manage"],
  },
  {
    group: "Gestão",
    icon: CreditCard,
    label: "Relatórios",
    href: "/app/reports",
    permissions: ["reports:read"],
  },
  {
    group: "Configuração",
    icon: QrCode,
    label: "Cardápio",
    href: "/app/catalog",
    permissions: ["catalog:manage", "pos:qr_review"],
  },
  {
    group: "Configuração",
    icon: Printer,
    label: "Impressão",
    href: "/app/printing",
    permissions: ["hardware:manage", "printing:manage"],
  },
  {
    group: "Configuração",
    icon: Rocket,
    label: "Implantação",
    href: "/app/onboarding",
    permissions: ["tenant:manage"],
  },
  {
    group: "Configuração",
    icon: Palette,
    label: "Personalização",
    href: "/app/settings/branding",
    permissions: ["tenant:manage"],
  },
  {
    group: "Configuração",
    icon: ShieldCheck,
    label: "Segurança",
    href: "/app/security",
    permissions: ["tenant:manage"],
  },
  {
    group: "Configuração",
    icon: Settings,
    label: "Equipe",
    href: "/app/team",
    permissions: ["tenant:manage"],
  },
  {
    group: "Plataforma",
    icon: Store,
    label: "Backoffice",
    href: "/platform",
    permissions: ["platform:manage"],
  },
] as const satisfies readonly AppNavigationItem[];

export function filterNavigationByPermissions(
  permissions: readonly string[],
  items: readonly AppNavigationItem[] = appNavigationItems,
) {
  return items.filter((item) =>
    item.permissions.length === 0
      ? true
      : item.permissions.some((permission) => permissions.includes(permission)),
  );
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
  if (item.href === "/app?view=pos") {
    return currentPath === item.href;
  }
  if (item.href === "/app") {
    return currentPath === "/app";
  }
  return currentPath === item.href || currentPath.startsWith(`${item.href}/`);
}
