# Plano de implementacao: estabilizacao mestra

## Tranche 0 - correcao e seguranca

1. Passar a transacao Drizzle aos repositories usados por pedido, pagamento, caixa, estoque,
   auditoria e outbox.
2. Aplicar `expectedVersion` e `409` em mutacoes concorrentes.
3. Fazer idempotencia retornar resultado anterior para mesma chave/payload e `409` para mismatch.
4. Remover equivalencia ampla `pos:* => pos:operate`; testar permissao exata e isolamento.
5. Tornar demo propriedade explicita do tenant.
6. Impedir migration destrutiva em novo rollout; adotar expand-migrate-contract.
7. Validar 20 chamadas concorrentes para pagamento, fechamento e pedido QR.

## Tranche 1 - fundacao visual

1. Corrigir ordem e escopo do CSS, importar estilos usados e eliminar classes inexistentes.
2. Aplicar shells administrativo e operacional.
3. Canonicalizar rotas e preservar `tableId`, filial e tarefa.
4. Padronizar loading, vazio, erro, offline, conflito e permissao.
5. Remover hardcodes e fallback demo de tenant real.

## Tranche 2 - operacao interna

1. Corrigir mapa com Pointer Events, versao e fluxo de recepcao.
2. Unificar camada de pedido do PDV e garcom.
3. Conectar desconto, cancelamento, divisao, transferencia, pagamento e caixa.
4. Entregar KDS realtime com fallback e impressao interna por fila.

## Tranche 3 - QR

1. Adicionar schema e migration para configuracao, versao de token e chamados.
2. Implementar token assinado, rate limit Redis e APIs publicas sem `tenantSlug` confiado.
3. Criar `/app/qr`, modelos, lote, preview e exportacao.
4. Conectar pedido, acompanhamento, comanda real, chamado e pre-conta.

## Tranche 4 - gestao e integracoes

1. Completar catalogo, estoque, relatorios, delivery, equipe e onboarding.
2. Cobrir rotas especializadas com E2E e QA visual.
3. Deixar providers externos code-ready.
4. Homologar somente com credenciais, hardware, contador e ambientes fornecidos.

## Definition of done

- Lint, typecheck, unitarios, integracao PostgreSQL, build e `git diff --check`.
- E2E por papel, isolamento multitenant, concorrencia, idempotencia e perda de conexao.
- QA visual em 1440x900, 1024x768, 768x1024, 390x844 e KDS 1920x1080.
- Backup externo e restore comprovado antes de go-live.
