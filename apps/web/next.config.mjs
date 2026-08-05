import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const apiUrl = process.env.API_URL ?? "http://localhost:3333";
function cspFor(nodeEnv) {
  const developmentEval = nodeEnv === "production" ? "" : " 'unsafe-eval'";
  return `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${developmentEval}; connect-src 'self' http: https: ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
}

export function buildCspHeaders(
  reportOnly = process.env.CSP_REPORT_ONLY === "true",
  nodeEnv = process.env.NODE_ENV,
) {
  const csp = cspFor(nodeEnv);
  return [
    { key: "Content-Security-Policy", value: csp },
    ...(reportOnly
      ? [
          {
            key: "Content-Security-Policy-Report-Only",
            value: `${csp}; report-uri /api/csp-report`,
          },
        ]
      : []),
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@giromesa/ui", "@giromesa/domain", "@giromesa/config"],
  typedRoutes: true,
  outputFileTracingRoot: path.join(dirname, "../.."),
  headers: async () => [
    {
      source: "/:path*",
      headers: buildCspHeaders(),
    },
    {
      source: "/_next/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
    {
      source: "/app/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
    {
      source: "/platform/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
    {
      source: "/login",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
  ],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/webhooks/:path*",
        destination: `${apiUrl}/webhooks/:path*`,
      },
    ];
  },
};

export default nextConfig;
