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

- Restaurante: `admin@bar-aurora-demo.local` / `Demo@12345`
- Backoffice SaaS: `owner@giromesa.local` / `Platform@12345`

O seed demo é idempotente e limitado ao tenant `bar-aurora-demo`. Ele pode ser executado várias
vezes para recompor dados previsíveis de QA sem apagar tenants reais. Em produção real, use tenants
próprios e segredos fortes; a demo pública existe para avaliação guiada e não substitui onboarding
comercial, fiscal, pagamentos e LGPD revisados.

### Demo, desenvolvimento e produção

- Desenvolvimento: aceita defaults locais para facilitar setup em máquina nova.
- Demo pública: usa backend real, sessão cookie `HttpOnly`, RBAC e dados seedados do Bar Aurora.
- Produção real: falha no boot quando secrets críticos estão ausentes, fracos ou iguais a
  placeholders de desenvolvimento/CI.

Consulte também `docs/QA_TEST_ACCESS.md` para perfis adicionais de garçom, caixa, cozinha, bar,
financeiro e gerente.

## Fluxo operacional base

- `/app/onboarding`: checklist persistente, readiness, bloqueios e próximos passos.
- `/app/cash`: abertura/fechamento de turno, abertura/fechamento de caixa, suprimento, sangria e resumo.
- `/app`: painel de prontidão com estado de onboarding, turno e caixa.

As ações sensíveis resolvem tenant/filial no backend, exigem RBAC e geram auditoria append-only.

## Arquitetura

O MVP usa modular monolith: uma API modular, um worker assíncrono e uma web PWA. O banco e compartilhado entre tenants, com `tenant_id` obrigatorio, filtros centralizados e RLS planejado como defesa adicional.

A UI interna está organizada em shell, features, fixtures, formatters, hooks e estilos por camada. Veja `docs/FRONTEND_ARCHITECTURE.md` antes de adicionar novos módulos ou expandir o dashboard.

## Seguranca

Nao comitar segredos. Use `.env`, GitHub Secrets ou secret manager. Para pagamentos, fiscal e WhatsApp, comece com providers mock/sandbox e habilite producao por feature flag.

Mutações autenticadas usam proteção CSRF via `GET /api/v1/auth/csrf` e header `x-csrf-token`.
Webhooks públicos não usam CSRF porque devem validar segredo/assinatura própria e idempotência.

## Documentacao

Comece por:

- `docs/PRD.md`
- `docs/MVP_SCOPE.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_MODEL.md`
- `docs/SECURITY.md`
- `docs/ROADMAP.md`
