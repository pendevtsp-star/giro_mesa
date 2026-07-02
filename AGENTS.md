# AGENTS.md

## Projeto

GiroMesa e um SaaS multi-tenant para gestao de bares, restaurantes, pubs, cozinhas e operacoes food service. O produto deve nascer comercializavel, seguro, auditavel e preparado para integracoes brasileiras.

## Stack padrao

- Monorepo com pnpm e Turborepo.
- Web/PWA: Next.js, React e CSS modular/global simples.
- API: NestJS com adapter Fastify.
- Worker: BullMQ + Redis.
- Banco: PostgreSQL + Drizzle ORM.
- Validacao: Zod.
- Testes: Vitest e Playwright.
- Deploy: Docker, VPS Hostinger, Cloudflare e GitHub Actions.

## Comandos

- `pnpm install`
- `pnpm dev`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `docker compose up -d postgres redis`

## Regras obrigatorias

- Nunca hardcodar segredo, token, senha, credencial fiscal, chave Asaas, chave Meta, certificado, CSC, chave Cloudflare ou dado sensivel.
- `.env.example` deve conter apenas placeholders.
- Toda tabela de negocio deve ter `tenant_id`; use `branch_id` quando a regra depender de filial.
- Todo endpoint privado deve resolver o tenant no backend; nao confiar em `tenant_id` vindo do frontend.
- Autorizacao e permissoes ficam no backend. UI so pode esconder opcoes, nunca ser a barreira principal.
- Operacoes sensiveis devem gerar auditoria append-only.
- Webhooks devem ser idempotentes e processados por fila.
- Logs devem ser estruturados e sanitizados.
- Fiscal, pagamentos e LGPD exigem validacao humana especializada.

## Padroes de modulo

- Regras de dominio em `packages/domain`.
- Schema e migrations em `packages/db`.
- Configuracao e env em `packages/config`.
- API exposta por modulos em `apps/api/src/modules`.
- Telas e rotas publicas/privadas em `apps/web/src/app`.
- Jobs e consumidores em `apps/worker`.

## Definition of done

- Typecheck, testes e build passam.
- Fluxos multi-tenant incluem teste de isolamento quando aplicavel.
- Alteracoes sensiveis incluem auditoria e permissao backend.
- Novas integracoes incluem doc, `.env.example`, provider mock e tratamento de webhook/idempotencia.
- Antes de PR/release: rodar Codex Security para auth, autorizacao, multi-tenancy, pagamentos, webhooks, fiscal, certificados e logs sensiveis.
