# CI/CD

## CI

GitHub Actions executa install, lint, typecheck, testes, build e audit. PostgreSQL e Redis sobem como services.

## CD

O build e a publicação de imagens podem ocorrer após merge em `main`; o job de produção usa o
environment GitHub `production` e deve exigir aprovação manual. O digest aprovado é promovido sem
rebuild. Imagens devem ser publicadas no GHCR ou registry privado.

O secret `VPS_SSH_KNOWN_HOSTS` contém a chave SSH da VPS conferida fora do workflow. O deploy
falha em ausência ou divergência e nunca usa `accept-new`.

## Gates

- Migrations revisadas.
- Backup recente.
- Codex Security em fluxos sensiveis.
- Variaveis de ambiente configuradas por ambiente.
- Fingerprint SSH pinado e environment `production` protegido.
- Rollback documentado.
