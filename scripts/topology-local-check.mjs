import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const compose = parse(await readFile("docker-compose.topology-local.yml", "utf8"));
const proxy = await readFile("ops/topology-local/nginx.conf", "utf8");
const services = compose?.services ?? {};
const failures = [];

for (const name of ["api-a", "api-b"]) {
  const environment = services[name]?.environment ?? {};
  if (!services[name]) failures.push(`${name} is missing`);
  if (environment.DATABASE_URL !== "postgres://giromesa:giromesa@postgres:5432/giromesa")
    failures.push(`${name} does not share the local Postgres service`);
  if (environment.REDIS_URL !== "redis://redis:6379")
    failures.push(`${name} does not share the local Redis service`);
  if (!Number.isInteger(environment.DATABASE_POOL_MAX))
    failures.push(`${name} has no explicit database pool limit`);
  if (!proxy.includes(`server ${name}:3333`)) failures.push(`proxy does not route to ${name}`);
}
if (!services["api-proxy"]) failures.push("api-proxy is missing");
if (failures.length) throw new Error(failures.join("\n"));

console.log("Two-instance local topology is structurally valid.");
