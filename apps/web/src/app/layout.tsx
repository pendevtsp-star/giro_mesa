import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GiroMesa | Gestao moderna para food service",
  description:
    "SaaS multi-tenant para PDV, mesas, comandas, KDS, cardapio digital, estoque e financeiro.",
  openGraph: {
    title: "GiroMesa",
    description: "Operacao, salao, cozinha e caixa em uma plataforma SaaS.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101820",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
