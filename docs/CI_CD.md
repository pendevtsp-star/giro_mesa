# CI/CD

## CI

GitHub Actions executa install, lint, typecheck, testes, build e audit. PostgreSQL e Redis sobem como services.

## CD

Deploy para staging deve ser automatico apos merge em `main`; producao deve exigir aprovacao manual. Imagens devem ser publicadas no GHCR ou registry privado.

## Gates

- Migrations revisadas.
- Backup recente.
- Codex Security em fluxos sensiveis.
- Variaveis de ambiente configuradas por ambiente.
- Rollback documentado.
