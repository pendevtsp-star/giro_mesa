# GiroMesa

SaaS multi-tenant para gestao de bares, restaurantes, pubs, lounges, cafeterias, dark kitchens, food trucks e operacoes food service.

## O que existe neste primeiro scaffold

- Monorepo pnpm + Turborepo.
- API NestJS/Fastify com modulos iniciais de tenant, auth, catalogo, PDV, KDS, webhooks e health.
- Web Next.js com landing page, login, painel do estabelecimento, backoffice da plataforma, cardapio publico e QR de mesa.
- Worker BullMQ para filas de webhooks, pagamentos, fiscal, mensagens e estoque.
- Pacotes compartilhados para dominio, schema Drizzle, configuracao e UI.
- Docker local para PostgreSQL e Redis.
- CI GitHub Actions.
- Documentacao inicial de produto, arquitetura, seguranca, LGPD, pagamentos, fiscal, integracoes, deploy, testes e roadmap.

## Setup local

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm dev
```

URLs padrao:

- Web demo: http://localhost:3002
- API: http://localhost:3333
- API health: http://localhost:3333/health
- PostgreSQL local Docker: `localhost:55432`
- Redis local Docker: `localhost:6380`

## Comandos

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm db:generate
pnpm db:migrate
pnpm demo:reset
```

## Demo local

Depois de subir Postgres e Redis:

```bash
docker compose up -d postgres redis
pnpm demo:reset
pnpm --filter @giromesa/api dev
pnpm --filter @giromesa/web exec next dev --hostname localhost --port 3002
```

Use `localhost` para web e API durante o desenvolvimento local. Misturar `localhost` e `127.0.0.1` pode impedir que o cookie `gm_session` seja enviado nos `fetch` autenticados. O comando `pnpm demo:reset` aplica migrations e recria o tenant `bar-aurora-demo` para manter produtos, mesas, estoque e credenciais demo previsiveis. O E2E builda a web, inicia `next start` em `3004` e executa o fluxo real da API quando `3333` esta disponivel.

Credenciais seed:

- E-mail: `admin@bar-aurora-demo.local`
- Senha: `Demo@12345`

## Arquitetura

O MVP usa modular monolith: uma API modular, um worker assíncrono e uma web PWA. O banco e compartilhado entre tenants, com `tenant_id` obrigatorio, filtros centralizados e RLS planejado como defesa adicional.

## Seguranca

Nao comitar segredos. Use `.env`, GitHub Secrets ou secret manager. Para pagamentos, fiscal e WhatsApp, comece com providers mock/sandbox e habilite producao por feature flag.

## Documentacao

Comece por:

- `docs/PRD.md`
- `docs/MVP_SCOPE.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY.md`
- `docs/ROADMAP.md`
