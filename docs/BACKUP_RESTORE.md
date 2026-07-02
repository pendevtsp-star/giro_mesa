# Backup e Restore

## Escopo

- PostgreSQL.
- Arquivos de midia e anexos.
- Configuracoes criticas.
- Logs/auditoria conforme retencao.

## Politica inicial

- Backup diario completo do Postgres.
- Retencao minima de 7 diarios, 4 semanais e 6 mensais.
- Copia fora da VPS, idealmente R2 ou S3 compativel.
- Teste de restore mensal.

## Restore

1. Pausar aplicacao.
2. Criar snapshot do estado atual.
3. Restaurar banco em ambiente isolado.
4. Validar integridade.
5. Promover restore para producao se aprovado.
6. Registrar incidente e auditoria.
