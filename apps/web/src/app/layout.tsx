import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import "../styles/foundation-v2.css";
import { CookieConsent } from "../components/CookieConsent";
import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";

const themeBootstrap = `(()=>{try{const k="gm_theme",s=localStorage.getItem(k)||"system",d=s==="dark"||(s==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.dataset.themePreference=s}catch{document.documentElement.dataset.theme="light"}})()`;

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
    icon: [{ url: "/images/giromesa-symbol.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.png", type: "image/png" }],
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0D1B2A",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={poppins.variable} lang="pt-BR" suppressHydrationWarning>
      <head>
        <script>{themeBootstrap}</script>
      </head>
      <body>
        <ServiceWorkerRegistration />
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
