# Deploy Hostinger + Cloudflare

## Topologia

- VPS Hostinger roda Docker Compose.
- Cloudflare gerencia DNS, SSL, WAF, rate limiting e cache da landing.
- Banco PostgreSQL e Redis em containers no inicio, com backups externos.

## Passos

1. Configurar dominio no Cloudflare.
2. Apontar DNS para a VPS ou usar Cloudflare Tunnel.
3. Criar `.env` em producao com secrets reais.
4. Subir `docker-compose.prod.yml`.
5. Habilitar SSL Full Strict.
6. Configurar WAF, rate limits e Turnstile em login/cadastro.
7. Configurar monitoramento e backup.

## Comandos operacionais

```bash
scripts/backup-postgres.sh
scripts/deploy-prod.sh
docker compose -f docker-compose.prod.yml ps
```

O primeiro deploy pode pular o backup pre-deploy se o banco ainda nao estiver rodando. A partir do segundo deploy, o backup deve ser criado antes da troca dos containers.

Para restore:

```bash
scripts/restore-postgres.sh backups/giromesa-YYYYMMDD-HHMMSS.sql.gz
```

## Cuidados

- Nunca expor Postgres/Redis publicamente.
- Limitar SSH por chave e firewall.
- Usar secrets no GitHub Actions para deploy.
- Testar rollback antes de producao.
- Manter `backups/` fora do Git e copiar backups para storage externo.
