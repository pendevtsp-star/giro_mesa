# Backup e Restore

## Escopo

- PostgreSQL.
- Arquivos de midia e anexos.
- Configuracoes criticas.
- Logs/auditoria conforme retencao.

## Politica inicial

- Backup completo validado a cada hora durante o piloto.
- Retencao minima de 7 diarios, 4 semanais e 6 mensais.
- Copia fora da VPS, idealmente R2 ou S3 compativel.
- Teste de restore antes do piloto e mensalmente depois dele.

`scripts/backup-postgres.sh` cria dump custom, valida o catálogo, registra SHA-256,
recusa arquivo anormalmente pequeno e atualiza `backups/latest.json`. A cópia externa
criptografada deve ser realizada por uma credencial diferente da usada pelo banco.

## Restore

1. Pausar aplicacao.
2. Criar snapshot do estado atual.
3. Executar `ALLOW_RESTORE_DRILL=true BACKUP_FILE=... scripts/restore-drill-postgres.sh`.
4. Validar login, tenants, pedidos, caixa, estoque e auditoria no banco isolado.
5. Elaborar o comando de promoção e obter dupla aprovação humana.
6. Promover restore para produção somente pelo runbook de incidente.
7. Registrar RPO, RTO, checksum, responsável e auditoria.

`scripts/restore-postgres.sh` é deliberadamente bloqueado para impedir escrita direta
no banco vivo pelo backoffice ou por execução acidental.
