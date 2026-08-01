# GiroMesa — entrega da Fase 1

Data: 2026-07-31  
Branch: `main`  
HEAD inicial: `4774e38`

## Escopo concluído

- Reserva N:N com bloqueio concorrente, capacidade combinada, versão otimista e acomodação transacional.
- Configuração operacional por filial: limpeza manual/automática, pagamento por garçom, tema e entrada KDS.
- Horários semanais e exceções datadas, incluindo turnos que atravessam meia-noite.
- PIN pessoal Argon2id, dispositivo operacional com token retornado uma vez e apenas hash persistido.
- Consulta inequívoca de comanda ativa por mesa ou pedido e sessão agregada de turno, caixa, comanda e cursor de eventos.
- Prévia e envio de produção por estação, categoria, KDS, impressora ou modo híbrido.
- Eventos operacionais versionados e recuperáveis por cursor, sempre limitados a tenant e filial.
- Abertura/fechamento de turno, abertura/movimentação/fechamento de caixa, união/separação de mesas e acomodação protegidos por transação e constraints.
- Fechamentos de caixa e turno idempotentes; divisão de conta usa o total persistido do pedido, nunca valor enviado pelo cliente.
- Pedido QR entra como novos itens identificados na comanda ativa da mesa; não abre uma segunda comanda concorrente.

O contrato HTTP está em `docs/openapi/operational-v1.yaml`.

## Banco

- `0019_operational_foundation.sql`: modelos operacionais, reserva N:N, versão de mesa/reserva/turno, eventos, preferências, dispositivos e roteamento. Antes de criar a trava de uma comanda ativa por mesa, reconcilia comandas legadas duplicadas de forma determinística e auditada.
- `0020_atomic_cash_sessions.sql`: versão e idempotência do caixa. O índice de uma sessão aberta por filial já existia desde a migration 0011 e foi apenas incorporado ao schema atual.
- `0021_qr_items_join_active_order.sql`: origem operacional por item para revisão do QR dentro da comanda ativa.
- Snapshot Drizzle recomposto para incluir as migrations manuais 0017/0018; `pnpm db:generate` agora encerra com `No schema changes` sem prompt interativo.
- Sequência completa aplicada em banco PostgreSQL vazio e em banco local existente.

## Gate executado

| Gate | Resultado |
| --- | --- |
| Migration safety | aprovado |
| Migrations em banco vazio | aprovado, 0000–0021 |
| Dry-run transacional sobre o estado de produção | aprovado; 19 comandas legadas supersedidas foram identificadas e o `ROLLBACK` de teste foi confirmado |
| Geração Drizzle sem diff | aprovado |
| Typecheck | aprovado, 8/8 pacotes |
| Testes unitários | aprovado |
| Integração PostgreSQL | aprovado, 25 testes incluindo QR na comanda ativa, concorrência, multitenancy e idempotência |
| Build | aprovado, 8/8 pacotes |
| Lint | executado em Linux porque o Windows App Control bloqueia `biome.exe` local |
| `git diff --check` | aprovado |

## Rollback e limites

As migrations são aditivas. O aplicativo pode voltar para o commit anterior mantendo as novas tabelas e colunas. Depois que dados reais forem gravados, remover a estrutura exige backup/restauração coordenada; não há migration reversa destrutiva automática.

A Fase 1 entrega o domínio e os contratos, não o novo frontend. Verificação/troca de operador por PIN entra na Fase 5; telas de PDV, salão, garçom, KDS e configurações seguem os gates das fases 2–7.
