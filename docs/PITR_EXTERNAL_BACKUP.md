# PITR externo do GiroMesa

Este procedimento implementa a base técnica da meta do piloto: RPO de até cinco
minutos e RTO de até sessenta minutos. Não declare o gate concluído até executar um
restore em ambiente isolado com evidência registrada.

## Arquitetura

PostgreSQL arquiva WAL em `./backups/wal` a cada segmento ou, no máximo, a cada 60
segundos. Um job do host envia dumps e WAL para um remoto R2/S3 através do `rclone`.
O remoto e o arquivo de configuração do rclone ficam exclusivamente na VPS, fora do
repositório. A cópia externa é obrigatória: um backup no disco da VPS não é recuperação
de desastre.

## Preparação na VPS

1. Instale `rclone` pelo gerenciador oficial do sistema e crie um remoto com uma
   credencial limitada somente ao bucket/prefixo de backup.
2. No diretório de deploy, crie `.backup.env` com permissão `0600`:

```sh
BACKUP_RCLONE_REMOTE=remote-seguro:giromesa-pilot
BACKUP_RCLONE_CONFIG=/root/.config/rclone/rclone.conf
BACKUP_DIR=./backups
WAL_ARCHIVE_DIR=./backups/wal
BACKUP_MAX_WAL_AGE_SECONDS=300
```

3. Crie o diretório e garanta escrita pelo usuário PostgreSQL do container:

```sh
mkdir -p backups/wal
chown -R 70:70 backups/wal
chmod 700 backups backups/wal
```

4. Reinicie somente o PostgreSQL na janela de manutenção para aplicar
`archive_mode=on`; confirme os parâmetros com `SHOW archive_mode;` e
`SHOW archive_command;`.
5. Gere um backup completo validado e envie-o ao remoto. Em seguida execute
`./scripts/backup-pitr-preflight.sh` até confirmar que o WAL externo está dentro de
cinco minutos.
6. Instale a agenda usando `./scripts/install-backup-schedule.sh /srv/apps/giro_mesa`.

## Restore drill

O restore nunca é feito no banco vivo. Em um host ou banco isolado, recupere o dump e
WAL remoto até o horário escolhido, valide checksum, tenants, pedidos, pagamentos,
caixa, estoque e auditoria. Registre horário do último WAL aplicado, início/fim do
drill, RPO calculado e RTO calculado.

Se `backup-pitr-preflight.sh` falhar, o piloto deve ser tratado como sem proteção externa
até que o envio e o alerta sejam corrigidos.
