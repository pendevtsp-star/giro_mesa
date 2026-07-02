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

- Web: http://localhost:3000
- API: http://localhost:3333
- API health: http://localhost:3333/health
- PostgreSQL local Docker: `localhost:55432`
- Redis local Docker: `localhost:6380`

## Comandos

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:generate
pnpm db:migrate
pnpm --filter @giromesa/db db:seed
```

## Demo local

Depois de subir Postgres e Redis:

```bash
docker compose up -d postgres redis
pnpm db:migrate
pnpm --filter @giromesa/db db:seed
pnpm --filter @giromesa/api dev
pnpm --filter @giromesa/web exec next dev --hostname 0.0.0.0 --port 3002
```

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
