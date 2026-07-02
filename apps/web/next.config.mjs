import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@giromesa/ui", "@giromesa/domain", "@giromesa/config"],
  typedRoutes: true,
  outputFileTracingRoot: path.join(dirname, "../.."),
};

export default nextConfig;
