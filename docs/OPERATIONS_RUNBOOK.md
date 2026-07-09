# Runbook Operacional

## Fechamento de turno

1. Conferir pedidos abertos em `GET /api/v1/pos/cash-sessions/summary`.
2. Conferir pagamentos por metodo e valor esperado do caixa.
3. Contar o caixa fisico/manual.
4. Fechar com `POST /api/v1/pos/cash-sessions/:id/close`.
5. Se houver diferenca, o caixa fica `disputed` e deve gerar revisao operacional.

### Antes de encerrar o caixa

- nao deixar contas em `opened`, `waiting_payment` ou `partially_paid`;
- revisar pre-contas emitidas e confirmar se viraram pagamento real;
- conferir comprovantes reimpressos, cancelamentos e descontos do turno;
- registrar quem contou o caixa e em qual horario.

### Se o caixa fechar com divergencia

1. salvar o valor contado e a diferenca;
2. revisar pagamentos parciais e mistos;
3. revisar pedidos fechados nos ultimos minutos do turno;
4. revisar reimpressao, estorno e ajustes auditados;
5. abrir tratativa interna antes do proximo turno.

## Estoque minimo

- `GET /api/v1/inventory/alerts?branchId=:branchId` retorna itens abaixo do minimo ou negativos.
- Ajustes continuam auditados por `POST /api/v1/inventory/adjustments`.
- Venda/cancelamento deve ser revisado contra movimentos de estoque no fechamento diario.

## Suporte operacional rapido

### Quando a cozinha nao recebe

1. conferir se o pedido foi enviado ao KDS;
2. conferir se existe rota de impressao/KDS ativa para a filial;
3. revisar jobs pendentes ou com falha;
4. revisar se houve cancelamento apos envio.

### Quando o pagamento nao bate

1. revisar historico de pagamentos por pedido;
2. confirmar se houve parcial, misto ou duplicidade de tentativa;
3. revisar `payment.confirmed` na auditoria;
4. revisar o resumo do caixa e o outbox.

### Quando o fiscal falha

1. confirmar se o pedido foi fechado e o pagamento ficou registrado;
2. validar provider/configuracao fiscal;
3. revisar pendencia administrativa, sem reabrir a conta operacional;
4. acionar contador ou operador fiscal quando necessario.

## Backup

Na VPS, no diretorio do deploy:

```bash
scripts/backup-postgres.sh
```

Backups ficam em `./backups`. Copiar periodicamente para armazenamento externo.

## Restore

```bash
scripts/restore-postgres.sh backups/giromesa-YYYYMMDD-HHMMSS.sql.gz
```

Execute restore primeiro em homologacao. Restore em producao exige janela de manutencao.

## Deploy

```bash
scripts/deploy-prod.sh
```

O script faz backup antes do deploy, puxa imagens, sobe containers e valida healthchecks.
No primeiro deploy, se o Postgres ainda nao estiver rodando, o backup pre-deploy e pulado.

## Checklist de producao

- `.env` real preenchido, sem placeholders.
- `POSTGRES_PASSWORD`, `SESSION_SECRET`, `PASSWORD_PEPPER`, `MFA_SECRET_ENCRYPTION_KEY` fortes.
- SMTP, Focus NFe, Asaas e Cloudflare configurados por secrets.
- Postgres e Redis sem portas publicas.
- Cloudflare SSL Full Strict ativo.
- Backups testados e monitorados.
- Scan de seguranca antes de release.

## Rotina local de demonstracao e E2E

- `pnpm demo:reset`
- `pnpm test:e2e:preflight`
- subir API e web em dev
- `pnpm test:e2e:dev`

## Retomada rapida no dia seguinte

1. subir Docker Desktop;
2. `docker compose up -d postgres redis`;
3. `pnpm db:migrate`;
4. `pnpm demo:reset`;
5. subir API e web;
6. rodar testes de integracao e E2E;
7. rodar scan de seguranca antes de release.
