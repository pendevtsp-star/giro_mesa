# GiroMesa - memoria operacional do projeto

Este arquivo guarda o panorama curto do projeto para orientar as proximas sessoes sem depender de relembrar tudo pela conversa.

## Estado atual

- O GiroMesa esta em fase de MVP local/pre-piloto.
- O produto ja tem base de monorepo, API, web/PWA, banco, Docker, seed demo, auth/RBAC, MFA, auditoria, PDV, mesas, KDS, caixa, cardapio QR, estoque, fiscal por provider, impressao, integracao preparada com Dose Club e documentacao tecnica/legal inicial.
- O nivel atual e bom para demonstracao guiada e evolucao de piloto controlado, mas ainda nao e um SaaS publico pronto para venda ampla.
- Visual e UX sao prioridade de produto: cada nova tela deve parecer vendavel, clara para operador real e consistente com a identidade GiroMesa.
- Personalizacao por estabelecimento entrou como requisito de produto: cada tenant pode exibir nome/logo, tema claro ou escuro e cor de destaque pre-definida, sem misturar identidade entre clientes.
- A rodada atual ampliou a personalizacao para painel, relatorios e modo garcom, com eventos auditaveis especificos para upload/remocao de logo.
- Relatorios financeiros agora caminham para contrato de API mais comercial, com ticket medio, mix de pagamentos e margem operacional estimada.
- A navegacao do painel ganhou atalhos por perfil para dono/gerente, caixa, garcom e estoque.
- Rodada atual adicionou periodo customizado em relatorios, prontidao de fechamento, mix percentual por metodo, sinais de cobranca/trial/onboarding no backoffice, renderizadores de pre-conta/resumo de caixa e rotina por perfil no manual.
- Bloco seguinte conectou pre-conta e resumo de caixa a jobs reais de impressao, criou detalhe de tenant em `/platform/:tenantId` e preparou Asaas homologacao/mock com checkout, simulacao de inadimplencia e webhook com segredo opcional.
- Rodada atual acrescentou comparativo com periodo anterior e receita por canal nos relatorios, filtros de busca/status no backoffice, notas comerciais persistidas por tenant e preparacao Asaas com fallback mock ou checkout hospedado quando houver `ASAAS_API_KEY`.
- Rodada atual ampliou o backoffice com responsavel comercial, SLA, follow-up e historico de contato por tenant, e os relatorios passaram a expor leitura por operador e sessoes de caixa do periodo.
- Rodada atual transformou o suporte em fila operacional simples no backoffice com status por tenant e evoluiu os relatorios para fechamento gerencial por caixa, incluindo divergencia e taxa de conferencia.
- Rodada atual abriu o modulo `/platform/support`, adicionou filtros, contadores e timeline ativa da fila, e os relatorios ganharam exportacao executiva do fechamento por caixa em CSV e PDF via impressao.
- Rodada atual consolidou uma camada compartilhada de padronizacao visual para documentos e emails, reaproveitada por convites, reset e relatorio imprimivel de fechamento por caixa.
- Rodada atual estendeu essa camada para pre-conta executiva, resumo executivo de caixa, comprovante operacional, exportacoes da fila de suporte e comunicacoes SaaS de trial, cobranca e follow-up.
- Rodada atual expandiu o mesmo padrao para resumo visual no QR de mesa, anexo fiscal auxiliar, exportacao executiva do backoffice principal, exportacao do detalhe do tenant e central de comunicacoes por conta.
- Rodada atual elevou o modo garcom com filtros de mesa/produto, observacao operacional e leitura rapida de ocupacao; reforcou relatorios com radar executivo, filtros de metodo/conferencia e exportacao executiva; amadureceu o backoffice com pipeline comercial e agenda do dia; e transformou manual e tela de seguranca em materiais mais proximos de onboarding e release real.
- Rodada atual seguinte levou parte dos filtros de relatorio para o backend, adicionou preflight dedicado para E2E local, script de execucao Playwright em dev e preflight tecnico de seguranca para release.
- Rodada atual moveu o resumo comercial do backoffice para endpoint consolidado no backend e ampliou o preflight para validar headers, cookies e webhooks por ambiente.
- Rodada atual preparou Google Sign-In com callback server-side, `state` assinado, MFA step-up, vinculo explicito em `oauth_accounts` e base para unlink seguro.

## Panorama comercial

- Demo comercial: aproximadamente 80%.
- Piloto controlado com poucos estabelecimentos: aproximadamente 65%.
- SaaS publico com onboarding, cobranca, suporte e operacao autonoma: aproximadamente 40-50%.
- VPS/producao ficam para depois que os fluxos principais estiverem mais robustos localmente.

## Lacunas importantes

- Experiencia dedicada por perfil: garcom, caixa, gerente, cozinha e dono precisam ganhar rotas e navegacao filtrada por permissao.
- Relatorios financeiros ja tem painel gerencial inicial com periodo, metodo de pagamento, ticket medio, DRE simples e exportacao; ainda falta consolidar filtros avancados, comparativos e exportacao profissional.
- Backoffice SaaS precisa controlar tenants, planos, trials, inadimplencia, suspensao, onboarding e suporte.
- Manual do cliente precisa ser simples, visual e orientado a rotina, alem da documentacao tecnica existente.
- Personalizacao do ambiente ja cobre configuracao inicial, painel, cardapio QR, modo garcom, relatorios, impressao e comunicacoes basicas; a base padronizada de documentos/emails foi criada, mas ainda falta aplicar em recibos, fiscal, comprovantes e templates por canal.
- O fluxo do garcom ficou visualmente mais vendavel, mas ainda precisa validacao com operador real em tela pequena durante atendimento de mesa.
- Relatorios financeiros estao mais maduros para dono/gerente, mas ainda faltam filtros mais profundos no backend e leitura multi-filial.
- Backoffice comercial ja tem sinais bons de operacao, suporte e follow-up, mas ainda falta consolidar cobranca real e lifecycle completo do cliente SaaS.
- A base de seguranca esta melhor exposta em UI e docs, mas o scan formal continua pendente antes de release.
- Politicas legais existem como templates e precisam de revisao juridica antes de venda.

## Economia de tokens e rotina de trabalho

- Construir por blocos coerentes e validar em lote.
- Usar buscas direcionadas com `rg` em vez de reler arquivos grandes.
- Rodar `lint`, `typecheck` e testes unitarios quando o lote de codigo fechar.
- Rodar E2E e screenshots nos checkpoints de UX ou antes de considerar um fluxo demonstravel.
- Evitar VPS, deploy e automacoes externas ate o produto local ter mais maturidade.
- Registrar decisoes e proximos passos neste arquivo ou em docs especificos para reduzir recapitulacoes longas.

## Prioridades imediatas

1. Revisar payload real de checkout Asaas com chave sandbox valida e consolidar criacao de assinatura/cliente conforme conta.
2. Refinar leitura por operador/caixa com filtros, consolidacao por fechamento e exportacao.
3. Evoluir suporte SaaS para responsavel, SLA e historico de contato com status de chamado e fila.
4. Fiscal Focus em homologacao com fluxo de credenciais seguro.
5. E2E das telas vendaveis antes de preparar repositorio/PR.
6. Scan de seguranca antes de release.

## Proximo bloco aprovado

1. Asaas real: validar payload final em sandbox e completar ciclo customer/subscription/webhook.
2. Suporte comercial: adicionar responsavel pelo relacionamento, SLA e timeline de contato.
3. Relatorios: fechamento por operador, exportacao profissional e leitura por filial/caixa.
- 2026-07-08: waiter flow expanded with service-mode split (mesa/balcao), next-action guidance, note presets, service mix counters and recent action feed in `/app/waiter`.
- 2026-07-08: client onboarding raised in `/manual` and `docs/CLIENT_MANUAL.md` with go-live criteria, role expectations and staged rollout guidance.
- 2026-07-08: OAuth migration `0008_quiet_login.sql` still pending application in local DB because PostgreSQL is not reachable on `localhost:55432` and Docker daemon is currently unavailable.
- 2026-07-09: POS evolved with order payment listing, partial/mixed payment support in the operational dashboard, and stricter cash-session closing semantics in backend/controller contracts.
- 2026-07-09: Backoffice SaaS summary gained watchlist indicators for overdue follow-ups, trials without relationship owner, and stale trials older than 7 days.
- 2026-07-09: Operations docs expanded with runbook scenarios and FAQ in `docs/FAQ_OPERACIONAL.md`.
