# Seed de homologacao visual

O comando `pnpm demo:reset` recria somente o tenant demo `bar-aurora-demo` e e seguro para
repetir em banco de homologacao. Ele aplica migrations antes do seed e nao apaga outros tenants.

As contas de teste sao individuais por perfil e estao em `QA_TEST_ACCESS.md`. Para uma rodada
compartilhada, substitua as senhas sem gravar o valor no repositorio:

```bash
SEED_TEST_PASSWORD="uma-senha-com-12-ou-mais-caracteres" pnpm demo:reset
SEED_PLATFORM_PASSWORD="outra-senha-com-12-ou-mais" pnpm demo:reset
```

`SEED_TEST_PASSWORD` e aplicada a todas as contas do estabelecimento. `SEED_PLATFORM_PASSWORD`
altera somente `owner@giromesa.local`. O seed rejeita valores configurados com menos de 12
caracteres. Em ambiente compartilhado, use variaveis do runner/deploy e nao reutilize os defaults.

O cenario inclui catalogo, modificadores, fichas tecnicas, estoque, clientes ficticios, mesas,
reserva com mesa associada, fila com estados distintos, comanda ativa, pedido pago, pagamento,
turno, caixa, chamados de garcom, KDS e fila de impressao termica simulada.
