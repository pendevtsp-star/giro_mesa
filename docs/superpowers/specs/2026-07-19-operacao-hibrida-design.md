# Operacao hibrida: salao e balcao

## Decisao

Construir um nucleo operacional unico para pedidos, pagamentos, producao,
estoque e auditoria. Balcao, salao, garcom e QR sao canais de atendimento do
mesmo pedido; nao sao modulos com dados ou regras financeiras separados.

O objetivo e servir estabelecimentos que operam simultaneamente por mesa e
balcao sem duplicar estoque, fechar caixa duas vezes ou perder rastreabilidade.

## Abordagens avaliadas

1. Telas independentes por canal: mais rapida inicialmente, mas cria regras e
   dados duplicados. Rejeitada.
2. Nucleo unico com experiencias por perfil: pedido unico e superficies
   especializadas para balcao, garcom, caixa, gerente e cozinha. Aprovada.
3. ERP completo na mesma rodada: amplia demais escopo e adia validacao da
   operacao principal. Rejeitada.

## Escopo do primeiro bloco

### Pedido e atendimento

- Todo pedido possui canal `counter`, `table` ou `qr` e pertence a tenant e
  filial resolvidos no backend.
- Balcao prioriza busca, favoritos, retirada/senha, pagamento rapido e
  impressao.
- Salao prioriza mapa, mesa/comanda, garcom, consumo continuo, pre-conta,
  transferencia, uniao e divisao de conta.
- QR gera solicitacao controlada; configuracao da filial define se item exige
  aprovacao antes de seguir para producao.
- Bloqueios pessimistas e transicoes de estado impedem dois operadores de
  pagar, fechar ou alterar o mesmo pedido simultaneamente.

### Pagamento e caixa central

- Garcom e caixa podem registrar pagamento, conforme permissao.
- Pagamento registra origem operacional (`waiter` ou `cashier`) e responsavel.
- Dinheiro recebido pelo garcom fica `pending_cash_handover` ate entrega ao
  caixa central. O caixa confirma recebimento durante a rotina de fechamento.
- Pix e cartao podem ser registrados pelo garcom, com referencia ou
  comprovante quando a politica exigir; conciliacao permanece no caixa.
- Nenhum caixa individual por garcom existe neste bloco.
- Divergencia entre valor recebido, entregue e conferido gera ocorrencia
  auditavel, sem editar ou apagar pagamento original.

### Descontos, cancelamentos e aprovacoes

- O dono configura politicas por filial e perfil: permitir desconto, teto
  percentual ou monetario, desconto por item/pedido, acumulacao e motivo
  obrigatorio.
- Desconto acima do teto vira solicitacao de aprovacao.
- Cancelamento de item ja enviado para cozinha/bar sempre exige aprovacao.
- Aprovacao padrao acontece no mesmo dispositivo por PIN do gerente autorizado.
- Auditoria guarda solicitante, aprovador, motivo, pedido/item, valores antes e
  depois, data, dispositivo e origem do fluxo.
- Cancelamento aprovado cria evento visivel no KDS ou impressao de producao;
  nunca remove historico do item.

### Salao, reservas e fila

- Mapa de salao organiza setores, areas, mesas, capacidade e posicao.
- Mesa possui estados operacionais: disponivel, reservada, aguardando cliente,
  ocupada, aguardando limpeza, bloqueada e em fechamento.
- Reserva inclui cliente, horario, quantidade de pessoas, observacoes, status
  e origem. Fila registra chegada, previsao, prioridade e mesa atribuida.
- Chegada pode abrir comanda diretamente na mesa reservada.
- Transferir, unir e separar mesas preserva pedidos, responsaveis e auditoria.
- Indicadores mostram atraso de reserva, tempo de espera, tempo de ocupacao e
  giro por setor sem expor dados sensiveis ao garcom alem do necessario.

### KDS e producao

- Itens enviados criam tickets por estacao e rota de producao.
- KDS mostra prioridade, cronometro, atrasos, alteracoes e cancelamentos
  aprovados.
- Status do ticket e do item continuam independentes; um pedido pode ter itens
  prontos e itens em producao.
- Impressao e KDS seguem mesma regra de roteamento por categoria, produto e
  modificador.

### Estoque e custo

- Venda baixa estoque uma unica vez na politica configurada do tenant (por
  exemplo, confirmacao do pedido ou fechamento), nunca uma vez por canal.
- Cancelamento ou estorno gera movimento reverso somente quando a baixa ja
  ocorreu e a politica permitir retorno.
- Movimentos preservam pedido, item, motivo e autor para custo, inventario e
  auditoria futuros.

## Limites deste bloco

Nao entram agora: TEF/maquininha integrada, pagamento online real, fiscal real,
delivery marketplace, caixa individual por garcom, offline-first completo,
fidelidade avancada e otimizacao automatica de reservas.

As interfaces devem manter portas para esses recursos, sem simular integracoes
que ainda nao existem.

## Componentes e limites de responsabilidade

| Modulo | Responsabilidade |
| --- | --- |
| `pos` | Pedido, itens, pagamento, divisao, transferencia e fechamento. |
| `floor` | Setores, mesas, reservas, fila e ocupacao. |
| `waiter` | Atendimento de mesa e captura operacional de pagamento. |
| `cash` | Caixa central, entrega de dinheiro, conciliacao e fechamento. |
| `approvals` | Politicas, solicitacoes, PIN gerente e decisoes auditadas. |
| `kds` | Tickets, estacoes, prioridade e progresso de producao. |
| `inventory` | Movimentos, baixa, reversao e custo. |
| `audit` | Registro append-only de eventos sensiveis. |

Cada modulo deve receber `TenantContext` do backend. Nenhum endpoint aceita
`tenant_id` livre do frontend, QR ou integracao.

## Dados e estados novos

Adicionar apenas em migration revisada:

- politica de desconto/aprovacao por tenant, filial e perfil;
- solicitacao de aprovacao com estado `pending`, `approved`, `rejected` ou
  `expired`;
- referencia de pagamento ao registrador, origem e status de entrega de
  dinheiro;
- reservas, fila, setores e estados de mesa;
- eventos de transferencia/uniao/separacao de mesa;
- referencias de evento de producao e de estoque, sem excluir registros.

Estados de pagamento, pedido, item, caixa e aprovacao devem ser state machines
backend. Mudancas livres por `PATCH` sao proibidas.

## Superficies UX

- `/app/pos`: balcao focado, com busca, carrinho e pagamento rapido.
- `/app/waiter`: mesa, comanda fixa, envio, pre-conta e pagamento autorizado.
- `/app/floor`: mapa, reservas, fila e atribuicao de mesa.
- `/app/kds`: producao por estacao, sem controles de caixa.
- `/app/cash`: caixa central, entrega de dinheiro e fechamento.
- `/app/settings/operation`: politicas de desconto, aprovacao, QR e estoque.

Cada pagina mostra somente a proxima acao necessaria ao perfil. Estados de
erro, vazio, carregamento e perda de conexao precisam ser claros e curtos.

## Seguranca e auditoria

- PIN de aprovacao nao substitui sessao: confirma identidade de gerente no
  dispositivo e expira imediatamente apos uso.
- PIN, senha, token, cookie e comprovante sensivel nunca entram em logs ou
  auditoria em texto puro.
- Aprovacoes, descontos, cancelamentos, pagamentos, divergencias e transferencias
  sao append-only.
- Regras de permissao sao verificadas no backend e cobertas por testes
  cross-tenant.

## Estrategia de entrega

1. Extrair contratos e state machines de pagamento, aprovacao e mesa.
2. Implementar politicas e PIN de gerente com auditoria e testes.
3. Fechar fluxo de garcom, caixa central e entrega de dinheiro.
4. Evoluir mapa para setores, reservas e fila persistentes.
5. Conectar eventos a KDS, impressao e estoque.
6. Polir superfices por perfil e executar E2E de ponta a ponta.

## Cenarios obrigatorios de teste

- Garcom registra dinheiro; caixa confirma entrega; fechamento concilia.
- Garcom registra Pix/cartao; caixa confere sem duplicar pagamento.
- Desconto dentro e acima do limite configurado.
- Cancelamento apos envio bloqueado ate PIN de gerente valido.
- Cancelamento aprovado aparece no KDS e preserva historico.
- Reserva chega, recebe mesa e abre comanda.
- Duas pessoas tentam pagar ou fechar mesmo pedido.
- Mudanca de mesa, uniao e divisao mantem total, estoque e auditoria.
- Usuario de outro tenant ou sem permissao e rejeitado.
- Baixa e reversao de estoque nao ocorrem duas vezes.

## Criterio de aceite

Um estabelecimento misto opera balcao e salao no mesmo turno; garcom registra
consumo e pagamento; caixa central confere dinheiro; gerente aprova excecoes;
cozinha recebe alteracoes corretas; reserva vira mesa; estoque, relatorios e
auditoria permanecem consistentes.
