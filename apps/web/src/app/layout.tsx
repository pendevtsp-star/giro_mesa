import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GiroMesa | Gestão que gira. Resultados que ficam.",
  description:
    "SaaS multi-tenant para PDV, mesas, comandas, KDS, cardápio digital, estoque e financeiro.",
  openGraph: {
    title: "GiroMesa | Gestão que gira. Resultados que ficam.",
    description: "Operação, salão, cozinha e caixa em uma plataforma SaaS.",
    type: "website",
  },
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/icon.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0D1B2A",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={poppins.variable} lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
