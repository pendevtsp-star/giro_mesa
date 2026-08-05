# Ensaio de carga do piloto

Este ensaio mede o modo cloud sem Hub. Execute-o em staging equivalente à produção,
nunca contra o banco vivo do estabelecimento.

## Modelo A1

- 120 mesas dedicadas ficam com comandas simultaneamente abertas.
- 12 operadores autenticados controlam 10 mesas cada.
- O setup abre cada mesa e captura o `orderId` retornado pela API.
- Leitura, lançamento e envio para produção usam esse `orderId` capturado; o
  arquivo não aceita comandas pré-informadas para essas 120 mesas.
- A resposta da abertura precisa devolver a mesma `tableId` do alvo. Qualquer troca
  de mesa ou ausência de `orderId` interrompe o ensaio.

O preflight também interrompe a execução antes da primeira requisição quando:

- não existem exatamente 12 identidades ou `PILOT_LOAD_VUS` é diferente de 12;
- uma sessão está ausente ou foi repetida entre operadores;
- uma das 120 mesas está ausente ou repetida;
- o pool não cobre ao menos 120 mesas ou não pode ser dividido igualmente;
- o setup não captura `orderId` ou não verifica a relação mesa-comanda.

## Pré-requisitos

- Base de staging limpa, com 120 mesas livres e exclusivas para o teste.
- Até 500 produtos e 100 tickets ativos para representar o pico esperado.
- Doze sessões de operadores diferentes em `PILOT_LOAD_SESSION_01..12`.
- IDs das mesas em `PILOT_LOAD_TABLE_001..120`.
- `PILOT_LOAD_BRANCH_ID`, `PILOT_LOAD_PRODUCT_ID` e `PILOT_LOAD_STATION_ID`.
- Opcionalmente, doze comandas dedicadas com saldo final conhecido de R$ 0,01 em
  `PILOT_LOAD_PAID_ORDER_01..12`, para pagamento e fechamento no teardown.
- Opcionalmente, QR, transferência e cancelamento dedicados ao ensaio.
- Métricas e logs da API, PostgreSQL, Redis e worker disponíveis.

Cookies, tokens, senhas e IDs reais ficam somente no ambiente seguro que executa o
teste. Não os inclua no JSON nem no Git.

## Execução

1. Copie `scripts/pilot-load-scenario.example.json` para fora do repositório e
   altere apenas a URL ou o mix quando necessário.
2. Exporte as variáveis externas descritas acima.
3. Valide o contrato local do runner:

```sh
node scripts/pilot-load-test.mjs --self-test
```

4. Execute 90 minutos com 12 usuários virtuais:

```sh
PILOT_LOAD_SCENARIO=/secure/pilot-load.json \
PILOT_LOAD_VUS=12 \
PILOT_LOAD_DURATION_SECONDS=5400 \
PILOT_LOAD_MAX_ERROR_RATE=0.01 \
PILOT_LOAD_MAX_P95_MS=500 \
node scripts/pilot-load-test.mjs
```

5. Execute novamente com um pico de 15 minutos ajustado à distribuição real do
   F1. Durante cada execução, reinicie uma instância da API, injete atraso
   temporário no PostgreSQL/Redis e desconecte um terminal de teste.
6. Anexe `artifacts/pilot-load-report.json`, dashboards e a reconciliação ao gate.

O runner reutiliza a mesma chave idempotente em todas as tentativas de uma mesma
requisição. Cada operador executa o setup de suas dez mesas, o mix sustentado em
rodízio sobre elas e o teardown. O exemplo cobre abertura, leitura, lançamento,
KDS, pagamento, fechamento, transferência, cancelamento, chamado QR e reconexão
SSE. Ele não substitui os testes de concorrência e reconciliação do domínio.

## Critérios de aceite

- Taxa de erro abaixo de 1% e p95 das rotas comuns abaixo de 500 ms.
- As 120 mesas permanecem cobertas e vinculadas às comandas abertas no setup.
- Nenhuma operação confirmada é duplicada, perdida, fora de ordem ou aplicada a
  outro tenant.
- Nenhum saldo negativo, divergência de pagamento ou ticket perdido.
- Os operadores continuam recebendo feedback local sem bloqueio prolongado.
- O resultado é repetido com o volume real de pedidos/hora informado pelo F1.
- O gate só é aprovado após 90 minutos, duas instâncias da API e evidência dos
  testes de reinício, atraso e reconexão.

O self-test valida parser, cobertura, unicidade, distribuição e o contrato de
captura mesa-comanda. Ele não comprova capacidade de produção.
