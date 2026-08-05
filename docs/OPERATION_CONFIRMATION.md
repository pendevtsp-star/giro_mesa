# Confirmação durável de operações

Uma ação operacional tem quatro estados visíveis:

- `pending`: registrada localmente com chave idempotente; ainda sem confirmação do servidor.
- `confirmed`: o servidor devolveu recibo com `operationId`, versão e horário.
- `failed`: não foi aceita e pode ser corrigida/repetida com nova decisão do operador.
- `requires_attention`: existe conflito, sessão revogada ou ambiguidade que exige decisão.

`apps/web/src/lib/operational-outbox.ts` fornece o armazenamento local mínimo para esse
contrato. Ele é segregado por tenant/filial, usa `navigator.locks` quando disponível e
não persiste tokens, cookies, senhas, PAN, CVV ou autenticação. Recibos confirmados ficam
por 24 horas; eles não consomem o limite de operações pendentes.

Nesta alteração a biblioteca está pronta e testada, mas ainda não foi ligada às mutações
de PDV/salão. O rascunho existente do garçom continua usando sua própria fila de itens.
Não anunciar continuidade de pedidos fora desse fluxo até a integração de cada mutação,
os recibos reais da API e a reconciliação forem entregues juntos.

Antes de conectar uma mutação, o fluxo deve:

1. Gerar uma chave idempotente uma única vez.
2. Persistir o envelope antes do primeiro envio.
3. Reutilizar a mesma chave e o mesmo payload em timeout/reconexão.
4. Marcar sucesso somente após recibo do servidor.
5. Consultar/reconciliar a operação em resposta ambígua; nunca reenviar com nova chave.

O backend deve manter negócio, evento operacional, outbox e auditoria na mesma transação.
O Hub BYOD reutilizará o mesmo envelope depois de seu contrato ser ligado às APIs de domínio.
