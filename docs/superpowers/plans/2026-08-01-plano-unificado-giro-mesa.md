# GiroMesa e DoseClub — plano único de estabilização, produção e piloto

> **Para agentes executores:** usar `superpowers:subagent-driven-development` ou
> `superpowers:executing-plans`, respeitando os checkboxes e os gates deste documento.

**Objetivo:** entregar um piloto real, fechado, assistido e reversível dos dois produtos
sem refazer as fases já aceitas nem ativar integração não homologada.

**Arquitetura:** GiroMesa e DoseClub mantêm códigos, bancos, sessões e deploys separados.
Contratos assinados, outbox, idempotência e entitlements conectam somente os recursos
aprovados; integrações externas ficam atrás de flags por tenant/filial.

**Stack:** pnpm/Turborepo, Next.js/React, NestJS/Fastify, PostgreSQL, Drizzle no GiroMesa,
Prisma no DoseClub, Redis/BullMQ, Docker, GitHub Actions, Cloudflare e VPS.

**Data de consolidação:** 2026-08-01  
**Revisão de prontidão:** 2026-08-03  
**Meta do piloto assistido:** 2026-08-06, horário de Brasília  
**Substitui:** `2026-07-31-redesign-operacional-plan.md`, `2026-07-28-estabilizacao-mestra-plan.md`
e `docs/PLANO_MESTRE_PRODUÇÃO _GIROMESA+DOSECLUB.md`  
**Documento de referência visual/técnica:** `docs/superpowers/specs/2026-07-31-redesign-operacional-design.md`

Este é o único plano válido para a implementação e o piloto dos dois produtos. O plano de
31/07 foi usado como base quando havia duplicidade; itens exclusivos do plano
de 28/07 e o delta de prontidão de 03/08 foram incorporados nas fases
correspondentes. Os documentos substituídos devem permanecer excluídos para evitar
execução paralela. O objetivo imediato é um piloto fechado, assistido, observável e
reversível; disponibilidade geral depende de um gate posterior.

## Global Constraints

1. Preservar URLs públicas e operacionais, QR Code e funcionalidades existentes.
2. Manter dois shells: administrativo e operacional.
3. Usar um núcleo único para pedidos, pagamentos, produção, estoque, caixa e auditoria.
4. O backend é autoridade para tenant, filial, permissão, estado, valores e transições.
5. Toda operação financeira, destrutiva ou concorrente exige transação, versão,
   idempotência e auditoria proporcionais ao risco.
6. Dados demo pertencem explicitamente a um tenant demo; tenant real nunca recebe
   fallback silencioso.
7. Não criar UI decorativa: toda ação precisa de endpoint, transição e estado de erro.
8. Não publicar integração produtiva antes dos gates internos.
9. Nenhum segredo, senha de homologação ou token real entra no repositório.
10. A marca e as logos GiroMesa e DoseClub são preservadas; a UI pode ser refinada,
    mas deve mostrar apenas ações úteis ao perfil e módulos realmente habilitados.
11. Fases entram por flags quando necessário, mas a aplicação final será uma única
    substituição funcional, sem UI legada ou fallback antigo após o aceite.
12. Integração existente, mock ou scaffold não equivale a homologação; cada conector
    precisa de credencial real, teste de indisponibilidade, reconciliação e desligamento
    por filial antes de aparecer na operação.
13. WhatsApp Web/QR não oficial permanece laboratório isolado e não pode sustentar
    fluxo crítico ou marketing. No piloto, a contingência padrão é contato manual por
    `wa.me`, telefone ou e-mail; automação só entra após decisão jurídica e de risco.
14. Fiscal, TEF, iFood, hardware e parametrização tributária dependem de fornecedor,
    credenciais e/ou homologação externa. Até o gate, a UI informa indisponibilidade ao
    administrador e esconde a ação dos perfis operacionais.
15. Redação jurídica e parametrização fiscal exigem validação humana de advogado e
    contador. Este documento organiza o trabalho e não substitui parecer profissional.

## Checklist mestre de conclusão

As caixas só são marcadas depois do gate da fase e da evidência registrada.

- [x] Fase 0 — baseline, matriz de cobertura e prevenção de regressões.
- [x] Fase 1 — domínio, dados, segurança e contratos.
- [x] Fase 2 — fundação visual, shells e navegação.
- [x] Fase 3 — sessão operacional compartilhada e PDV.
- [x] Fase 4 — salão, reservas e fila (núcleo operacional entregue; hardening avançado pendente abaixo).
- [x] Fase 5 — garçom, perfis, PIN e dispositivos (núcleo de atendimento entregue; hardening avançado pendente abaixo).
- [x] Fase 6 — KDS, expedição e impressão (núcleo operacional entregue; hardening avançado pendente abaixo).
- [x] Fase 7 — dashboard, horário, turno e tema (núcleo entregue; hardening avançado pendente abaixo).
- [x] Fase 8 — limpeza, seed e cenário de homologação.
- [x] Fase 9 — QR personalizado por mesa.
- [x] Fase 10 — fundação Enterprise Premium.
- [x] Fase 11 — arquitetura de informação e gestão multiunidade.
- [x] Fase 12 — operação real e experiência do consumidor.
- [x] Fase 13 — personalização, QR premium e aquisição orgânica.
- [x] Fase 14 — ecossistema GiroMesa e DoseClub.
- [ ] Fase 15 — hardening de produção, jurídico e integrações externas.
- [ ] Fase 16 — aceite integral técnico, visual, operacional e jurídico.
- [ ] Fase 17 — handoff, backup, piloto e corte único.

### Registro de progresso já existente

Há implementação parcial em várias fases, mas nenhum gate deve ser considerado
fechado apenas por existir código:

- Fase 0: concluída no documento `docs/superpowers/baselines/2026-07-31-phase-0-baseline.md`.
- Fase 1: fundação operacional iniciada em `75701e7`.
- Fase 1: gate fechado nesta execução; transações de mesa/mapa/auditoria e revisão
  otimista de mesa foram concluídas em conjunto com as fundações já existentes.
- Fase 2: fundação visual iniciada em `03a6ed2`.
- Fase 2: gate fechado nesta execução após a validação dos shells, tokens, branding,
  estados, acessibilidade e rotas em todos os viewports de aceite.
- Fase 3: gate fechado nesta execução após a validação do PDV Mesa/Balcão, recuperação
  de comanda, pagamentos idempotentes, dinheiro, impressão térmica e atalhos.
- Fase 4: núcleo operacional entregue nesta execução: modo Operação/Edição, reservas
  com mesas múltiplas e estados de recepção, fila com estados e acomodação que abre
  atendimento, sugestão de junção, separação física, zoom acessível e limpeza manual.
  O gate de software foi fechado nesta execução com setores/formas, ocupação operacional,
  realtime, versão otimista e suíte E2E autenticada; aceite físico/touch permanece externo.
- Fases 3, 4 e 6: partes do PDV, salão, KDS e impressão estão em `83eae38`.
- Fase 10: implementação parcial nesta execução; landing recebeu logo real, tema claro
  inspirado no DoseClub e entrada discreta do ecossistema.
- Fase 10: auditoria visual pública executada em 1440×900, 1024×768, 768×1024 e
  390×844; contraste, overflow e erros de navegador passaram após o ajuste do tema
  claro e do menu móvel. A matriz autenticada foi concluída no bloco F11/F12 com
  credencial seed isolada, sem armazenar senha no repositório.
- Fase 10: gate fechado em 2026-08-03 após auditoria Impeccable nos dois produtos,
  matriz GiroMesa de 39 rotas, E2E Dose Club, consolidação de dialogs/drawers,
  contraste semântico, foco, teclado, alvos touch, dashboard e navegação móvel. As
  marcas oficiais foram preservadas; evidências estão em
  `docs/audits/2026-08-03-fase-10-enterprise-premium.md`.
- Fase 11: shell administrativo reorganizado por fluxo (Operação, Gestão,
  Configuração, Crescimento e Ecossistema), mantendo rotas e permissões; Clientes e
  Delivery agora ficam no grupo de crescimento. O dashboard executivo e a central
  de pendências completam a próxima ação por perfil; a validação visual autenticada
  passou nos quatro viewports de aceite.
- Fase 13: a experiência QR passou a aceitar somente fontes curadas (Sistema,
  Serifada ou Display), persistidas no rascunho/publicação e aplicadas no público;
  CSS, URLs e fontes externas continuam bloqueados.
- Fase 13: o QR público agora oferece CTA acessível “Conheça a tecnologia deste
  atendimento”, mantendo a assinatura discreta e o opt-out de marketing.
- Fases 12/13: o CTA de atribuição usa somente UTM agregado, o rodapé público
  anuncia mudanças com status acessível e o PDV traduz `pending_approval` para
  “Aguardando aprovação”; nenhum identificador de mesa, comanda, tenant ou token
  é exposto na divulgação.
- Fases 10/12: rotas QR legadas sem assinatura agora exigem `LEGACY_QR_ENABLED` e
  `LEGACY_QR_TENANT_SLUG`, resolvem somente o tenant demo configurado no servidor e
  não recebem mais `tenantSlug` nem fallback `bar-aurora-demo` do cliente; tokens
  assinados permanecem o caminho canônico.
- Fases 10/14: a landing do DoseClub recebeu navegação nomeada, controles rotulados
  e suporte a `prefers-reduced-motion`; CI, build e testes do repositório separado passaram.
- Fase 11: central de pendências role-scoped adicionada ao dashboard, consolidando
  onboarding, turno/caixa, pedidos QR, KDS, estoque e contas abertas com ação direta;
  comparação entre filiais agora usa resumos tenant-scoped; dashboards enxutos por
  perfil destacam a próxima ação sem misturar permissões.
- Fase 12/13: QR público passou a respeitar branding configurado, mostrar comanda real,
  recebimentos, restante, timeline e pré-conta com carrinho vazio.
- Fase 13: rollback formal de experiência versionada, prévia administrativa e agendamento
  com ativação automática foram concluídos para os modelos controlados Gastronomia,
  Bar noturno, Café e DoseClub, sem reimpressão do QR.
- Fase 14: landing do DoseClub passou a apresentar contratação independente e combo;
  o commit separado está no repositório do DoseClub e não altera o código GiroMesa.
- Fase 14: consumo DoseClub correlacionado opcionalmente por `orderId` validado em
  tenant/filial; auditoria, outbox, estorno idempotente e comanda/PDV informativos
  preservam a separação comercial. O DoseClub ainda precisa enviar o campo quando
  houver comanda GiroMesa, e a homologação externa permanece pendente.
- Fase 12: pacote de produtividade do PDV publicado em `da66fe1`; F2 busca, F3 alterna
  Mesa/Balcão, F4 recebe, F6 mesa, F8 produção, F9 pré-conta, F10 fechamento e Esc agora
  usam mapa testável, feedback de processamento e estados acessíveis. CI `30785428404`
  e deploy `30785428422` passaram.
- Fases 11 e 12: bloco final desta execução adiciona produção e estoque ao resumo executivo,
  conecta a central de pendências ao PDV pela fila QR e permite identificação temporária
  opcional por apelido/assento, persistida somente no navegador e sem dado pessoal obrigatório.
  A migração `0026_guest_order_label` mantém o rótulo no pedido QR real. Lint, typecheck,
  testes, build, banco E2E recriado e 57 cenários autenticados passaram; a auditoria visual
  dedicada passou nos 10 cenários (quatro viewports autenticados, quatro públicos e dois
  de plataforma), incluindo contraste, overflow e erros de navegador.
- Fase 14: pacote DoseClub de acesso comercial independente publicado em `e954582`; o
  onboarding registra DoseClub ou combo, o handoff para GiroMesa permanece separado e
  sem SSO falso. Migration, CI, testes, E2E e segurança passaram em `30785791198`.
- Fase 15: pagamentos operacionais não usam mais Asaas; métodos externos são registrados
  como manuais, boleto é rejeitado e webhook Asaas operacional é ignorado. Homologação SaaS
  externa permanece pendente.
- Fase 13: concluída em 2026-08-03 com experiência pública em português, inglês e
  espanhol, categorias e recomendações configuráveis, motivos rápidos de atendimento,
  identidade controlada e atribuição comercial exclusivamente agregada por dia.
- Fase 14: concluída em 2026-08-03 com catálogo e entitlements canônicos no GiroMesa,
  campanhas cruzadas opcionais, handoff HMAC de uso único e sessão própria no DoseClub.
  A landing DoseClub consome o catálogo central com fallback resiliente; DNS, proxy e
  segredos de produção permanecem na Fase 15.
- Fases 13 e 14: evidências consolidadas em
  `docs/audits/2026-08-03-fases-13-14-qr-ecossistema.md`; lint, typecheck, testes,
  builds, migrations, segurança e 58 cenários E2E passaram sem commit ou publicação.
- Fase 15: o transporte WhatsApp padrão passou a ser `disabled`; `qr_unofficial` não simula entrega e `meta_legacy` só funciona por opt-in explícito. A documentação marca o canal QR como não oficial; pareamento real, sessão criptografada e homologação de Resend, Google OAuth, Asaas e DoseClub continuam dependentes de credenciais reais.
- Fase 16: typecheck, lint, testes unitários, build, security preflight, integração
  PostgreSQL E2E e auditoria visual das rotas passaram; permanecem pendentes as jornadas
  integrais por perfil, hardware e homologações externas do aceite final.
- O checklist continua aberto até os testes, QA e evidências de cada gate serem
  concluídos e revisados.

## Corte de escopo para o piloto de 06/08/2026

### Estratégia aprovada pelo plano

Entre as três alternativas avaliadas, este documento adota a primeira:

1. **Piloto fechado e assistido, recomendado:** núcleo operacional completo, pagamentos
   manuais auditados e somente integrações que passarem homologação real.
2. **Ativar todos os conectores até quinta-feira:** rejeitado porque iFood, TEF, fiscal e
   WhatsApp automatizado dependem de terceiros, hardware ou aceitação de risco.
3. **Adiar todo o piloto:** contingência obrigatória se qualquer gate P0 continuar aberto.

O parceiro pode operar GiroMesa com PDV, salão, garçom, KDS, QR, estoque, pagamentos
manuais, caixa e relatórios. O DoseClub pode operar clubes, combos, saldo em mililitros,
consumo, estorno e auditoria. Integração de estoque entre produtos só é ativada após o
ensaio ponta a ponta com IDs e segredos do tenant piloto.

### Estado verificado em 03/08/2026

- [x] Repositórios canônicos GiroMesa e DoseClub localizados e auditados.
- [x] Fases 0–14 preservadas; não serão refeitas sem regressão comprovada.
- [x] `lint`, `typecheck`, testes unitários, `build`, segurança e migration safety locais
  aprovados nos escopos aplicáveis; testes PostgreSQL/E2E completos continuam no gate F16.
- [x] Repositório DoseClub acessível; o bloqueio do plano de produção anterior ficou obsoleto.
- [x] QR legado protegido por flag e limitado ao tenant demo.
- [ ] Consolidar os worktrees atuais de F13/F14 em SHAs reproduzíveis, um por repositório.
- [ ] Validar migrations `0027`, `0028` e a migration federada DoseClub em banco vazio e upgrade.

### Bloqueadores P0 ativos

- [ ] GiroMesa: substituir senha previsível do provisionamento de tenant por convite
  temporário, uso único e auditado.
- [ ] GiroMesa: privatizar `/health/detailed`, `/health/metrics` e `/health/alerts`;
  manter públicos apenas liveness/readiness sanitizados.
- [ ] GiroMesa: bloquear restore destrutivo pelo backoffice até existir cliente PostgreSQL,
  volume, autorização, backup externo e restore ensaiado fora do banco vivo.
- [ ] GiroMesa: remover fallback `Bar Aurora` do cardápio de tenant real em falha de API.
- [ ] GiroMesa: publicar documentos legais reais e aceite versionado; templates não contam.
- [ ] GiroMesa: preservar o plano escolhido em todos os CTAs e revalidá-lo no backend.
- [ ] GiroMesa: remover `EMAIL_FROM` duplicado e todo `example.com` de configuração de release.
- [ ] DoseClub: corrigir conversão `priceCents` para valor decimal do Asaas e nunca ativar
  assinatura/entitlement antes de webhook de pagamento confirmado.
- [ ] DoseClub: implementar ingresso autenticado, assinado e idempotente do webhook Asaas
  ou manter cobrança SaaS integralmente desligada.
- [ ] DoseClub: alinhar catálogo, preços e entitlements entre landing, backend e GiroMesa.
- [ ] DoseClub: corrigir Google OAuth público; sem `client_id` vazio, callback localhost ou
  resposta Fastify não finalizada.
- [ ] DoseClub: publicar o catálogo/SSO federado já implementado e homologar o exchange.
- [ ] Ambos: definir razão social, CNPJ, contatos, suporte, privacidade e responsáveis reais.
- [ ] Ambos: comprovar backup externo e restauração em ambiente isolado.

### Achados P1 incorporados

- [ ] Corrigir status público do GiroMesa e mover monitor/status para domínio externo à VPS.
- [ ] Remover criação demo pública e deixar onboarding do piloto somente por convite.
- [ ] Expor backoffice apenas após usuário interno, MFA, recuperação e auditoria reais.
- [ ] Tornar dependency audit e Trivy bloqueantes para vulnerabilidades críticas.
- [ ] Proteger ambiente GitHub `production`, pin de host SSH e aprovação manual.
- [ ] Remover dados demo em fallbacks de frontend e falsos positivos dos validadores de prontidão.
- [ ] Reduzir RPO do DoseClub de 24 horas para no máximo uma hora durante o piloto.

## Fase 0 — baseline e prevenção de regressões

**Estado:** concluída em 2026-07-31.  
**Evidência:** `docs/superpowers/baselines/2026-07-31-phase-0-baseline.md`.

### Entregas

- [x] Registrar branch, HEAD, worktree e comandos oficiais.
- [x] Inventariar rotas, perfis, permissões, APIs, migrations, tabelas, eventos,
  componentes, CSS e dependências.
- [x] Mapear ações para endpoint, transição, permissão e auditoria.
- [x] Identificar ações decorativas, fallbacks demo, hardcodes e estados locais duplicados.
- [x] Capturar screenshots nos viewports de aceite.
- [x] Registrar lint, typecheck, unitários, integração, E2E e build de referência.
- [x] Confirmar o contrato GiroMesa–Dose Club e as migrations pendentes.

### Gate

Baseline reproduzível e lacunas classificadas como frontend, contrato, dado,
permissão ou infraestrutura.

## Fase 1 — domínio, dados, segurança e contratos

### Trabalho

- [x] Reutilizar pedidos, pagamentos, split, descontos, cancelamentos, aprovações,
  floor plan, reservas, fila, KDS, impressão, caixa e turno existentes.
- [x] Passar a transação Drizzle aos repositories de pedido, pagamento, caixa,
  estoque, auditoria e outbox.
- [x] Aplicar `expectedVersion` e resposta `409` em mutações concorrentes.
- [x] Fazer idempotência retornar o resultado anterior para mesma chave/payload e
  `409` para mismatch.
- [x] Remover equivalência ampla `pos:* => pos:operate`; exigir a permissão exata.
- [x] Garantir tenant e filial no mesmo escopo transacional; nenhuma busca de negócio
  apenas por `id`.
- [x] Manter demo como propriedade explícita do tenant e bloquear fallback em tenant real.
- [x] Criar somente lacunas confirmadas: reserva N:N, horários e exceções, estado
  “A limpar”, dispositivo operacional, PIN pessoal, preferências de tema/KDS,
  comanda ativa, sessão agregada, roteamento de produção e eventos versionados.
- [x] Usar expand-migrate-contract e impedir migration destrutiva em rollout novo.
- [x] Atualizar tipos compartilhados e contratos OpenAPI.

### Testes e gate

- [x] Unitários de máquinas de estado, dinheiro e permissões.
- [x] Integração PostgreSQL em banco vazio e banco de baseline.
- [x] Isolamento multitenant, concorrência e repetição idempotente.
- [x] Pelo menos 20 chamadas concorrentes para pagamento, fechamento e pedido QR.
- [x] Rollback documentado para migrations que alterem dados.
- [x] Gate: contratos cobertos, constraints aplicadas e nenhuma ação cruza tenant.

## Fase 2 — fundação visual, shells e navegação

### Trabalho

- [x] Consolidar tokens semânticos de superfície, texto, borda, ação e estados para
  claro/escuro/automático.
- [x] Organizar CSS em tokens, base, componentes, shell e página; importar estilos
  usados e remover classes inexistentes/órfãs.
- [x] Manter shell administrativo para dashboard, catálogo, estoque, relatórios,
  equipe, configurações, billing e auditoria.
- [x] Manter shell operacional em tela cheia para PDV, salão, garçom e KDS.
- [x] Canonicalizar `/app/pos`, `/app/salon`, `/app/waiter` e `/app/kds`, preservando
  `tableId`, filial e tarefa.
- [x] Criar componentes comuns de botão, campo, select, filtro, card, tabela,
  drawer, diálogo, toast, skeleton, vazio, erro, offline, conflito, permissão e PIN.
- [x] Padronizar logo, branding, foco, contraste AA, alvos touch e ícones; emojis são
  proibidos no código ativo.
- [x] Remover links fixos de tenant/mesa e fallback demo em tenant real.

### Testes e gate

- [x] Story/harness dos componentes essenciais.
- [x] Screenshots em `1440×900`, `1024×768`, `768×1024`, `390×844` e KDS `1920×1080`.
- [x] Contraste AA, teclado, foco, labels e ausência de overflow.
- [x] Tema claro, escuro e automático sem flash de cor.
- [x] Gate: todos os shells navegáveis sem regressão de identidade.

## Fase 3 — sessão operacional compartilhada e PDV

### Trabalho

- [x] Criar cliente único da sessão operacional e invalidar cache por eventos.
- [x] Implementar Mesa/Balcão, recuperação da comanda ativa e leitura de `tableId` da rota.
- [x] Implementar busca, categorias, favoritos, grade, modificadores, observações,
  cliente e preferências.
- [x] Separar rascunhos de lotes enviados e permitir múltiplos ambientes KDS/impressoras.
- [x] Implementar prévia e envio automático para produção.
- [x] Traduzir estados por mapa central em português.
- [x] Implementar recebimento total/parcial, split por valor/pessoa/item, pagamento
  misto, dinheiro, troco, referências e histórico.
- [x] Implementar desconto, cancelamento e aprovação por PIN com política e auditoria.
- [x] Manter dinheiro do garçom como `pending_cash_handover` até confirmação física do caixa.
- [x] Implementar fechamento com pendências explícitas, concorrência e idempotência.
- [x] Conectar pré-conta e comprovante à fila térmica 58/80, não apenas ao popup A4.
- [x] Garantir atalhos de teclado, layout touch e operação rápida em alto fluxo.

### Testes e gate

- [x] Mesa, balcão, retomada da mesma comanda por dois dispositivos.
- [x] Modificadores, observações, múltiplos lotes e rotas Cozinha/Bar/Copa.
- [x] Parcial, split, pagamento misto, desconto e cancelamento com/sem aprovação.
- [x] Concorrência, duplicação, fechamento e recibo mock 58/80.
- [x] Gate: abrir → lançar → produzir → receber → fechar funciona sem ação decorativa
  e usa a mesma comanda em todas as leituras.

## Fase 4 — salão, reservas e fila

### Trabalho

- [x] Separar modos Operação e Editar mapa.
- [x] Corrigir Pointer Events, pointer capture, pan, zoom, ajuste de mapa, touch,
  teclado, cálculo de coordenadas e persistência.
- [x] Implementar desfazer local e aviso de mudanças não salvas.
- [x] Completar setores, formas, edição de capacidade, bloqueio e arquivamento seguro.
- [x] Detectar proximidade e sugerir união com prévia; separar mesas reposicionando-as.
- [x] Manter drawer rápido para pedido, produção, pré-conta, pagamento e fechamento.
- [x] Separar preserva as comandas vinculadas a cada mesa e exibe atraso da reserva.
- [x] Integrar reservas N:N: mesa(s), chegada, acomodação, cancelamento e no-show.
- [x] Integrar fila: notificação, previsão, acomodação, desistência e cancelamento.
- [x] Exibir ocupação, duração, reserva e próxima ação no mapa; o responsável permanece na comanda/auditoria.
- [x] Atualizar mapa simultaneamente por eventos e impedir sobrescrita com versão otimista.
- [x] Implementar “A limpar” e liberação manual.

### Testes e gate

- [x] Exercitar mouse, Pointer Events, teclado, pan, zoom e persistência após reload na suíte
  autenticada.
- [x] Exercitar união por aproximação, separação real e conflito simultâneo na suíte
  autenticada.
- [x] Exercitar reserva de uma e várias mesas, fila completa e conflito de acomodação.
- [x] Gate: nenhuma ação frequente sai do mapa; reserva/fila abrem atendimento real
  sem dupla ocupação.

## Fase 5 — garçom, perfis, PIN e dispositivos

Progresso desta execução: fluxo móvel do garçom foi conectado à comanda real,
reutilizando catálogo/pedido/pagamento do PDV, com recuperação de comanda,
envio para produção, pagamentos parciais ou totais e fechamento auditado.
Dispositivos, PIN, bloqueios e cobertura E2E foram fechados nesta execução; troca rápida de operador continua dependente de uma sessão dedicada.

Deploy da fase: commit `1675502` e correção de workflow `c21b2cd` publicados;
run `30694170209` passou em validação, publicação de imagens e deploy.

### Trabalho

- [x] Evoluir o stepper para central móvel de mesas e comandas.
- [x] Reutilizar sessão, catálogo, comanda, produção e pagamento do PDV.
- [x] Implementar lançamento de produtos, consumo contínuo, envio para produção,
  pagamento parcial/total e múltiplos recebimentos; pré-conta e transferência ficam
  no drawer compartilhado do PDV.
- [x] Implementar registro de dispositivo e PIN pessoal; a troca rápida continua dependente de uma sessão dedicada.
- [x] Implementar bloqueio, tentativas, revogação e auditoria.
- [x] Manter MFA opcional; exigir somente por política do tenant.
- [x] Revisar redirecionamento inicial por proprietário, gerente, caixa, recepção,
  garçom, cozinha, bar, estoque e financeiro.

### Testes e gate

- [x] E2E positivo e negativo por perfil, incluindo permissões no backend.
- [x] PIN inválido, bloqueio, revogação e aprovação.
- [x] Dinheiro entregue, divergente e confirmado pelo caixa.
- [x] Celular `390×844` e tablet `768×1024`.
- [x] Gate: cada perfil entra na superfície correta e nenhuma permissão depende só
  da visibilidade do botão.

## Fase 6 — KDS, expedição e impressão

Progresso desta execução: KDS recebeu grade responsiva, tela cheia, foco de
ticket por teclado, atalhos para atualizar/som/tela cheia/avançar e indicação
de conexão em tempo real com fallback de polling. A configuração de
impressoras térmicas, rotas, fila, retry e reimpressão já está reconectada ao
backend. Mapeamento administrativo de teclas e estados por item foram concluídos;
homologação física do conector permanece como aceite externo.

### Trabalho

- [x] Criar layout KDS por colunas/grade, vazio coerente e tela cheia.
- [x] Renderizar estação, itens, modificadores, observações, tempo, prioridade,
  alterações, cancelamentos e atraso.
- [x] Implementar estados por item, consolidação do ticket e expedição multiestação.
- [x] Implementar SSE autenticado e multitenant, reconexão, deduplicação e polling fallback.
- [x] Implementar som com permissão, volume e alerta acessível; funcionar com touch,
  mouse, teclado numérico e bump bar.
- [x] Criar mapeamento administrativo de teclas e modo sem tela touch.
- [x] Reconectar configuração de impressoras térmicas, rotas, fila, retry,
  reimpressão, conector e falhas visíveis.
- [x] Propagar cancelamento aprovado para KDS, impressão e estoque.

### Testes e gate

- [x] SSE, reconexão, deduplicação e fallback.
- [x] Item pronto individualmente, ticket consolidado e cancelamento em produção.
- [x] Teclado completo, bump bar simulado e som permitido/bloqueado.
- [x] Impressora mock 58/80, retry, contingência e recibo.
- [x] KDS indisponível sem bloquear pedido; conector físico ainda requer homologação.
- [x] Gate: pedido aparece sem refresh, opera sem touch e falha de impressão é
  visível e recuperável.

## Fase 7 — dashboard, horário, turno e tema

Progresso desta execução: dashboard direcionado por perfil, indicadores operacionais e
gerenciais, prontidão de abertura/fechamento, agenda semanal com exceções persistidas e
padrões da filial para tema e entrada do KDS foram conectados às APIs existentes. O
toggle rápido continua por dispositivo/usuário. O backend já aceita múltiplos intervalos;
o editor visual desta fase mantém um intervalo principal por dia para reduzir risco no
primeiro rollout.

### Trabalho

- [x] Criar dashboard estratégico do proprietário e operacional do gerente.
- [x] Criar início específico para caixa e recepção; direcionar garçom e produção
  às superfícies operacionais.
- [x] Remover banner permanente de conectividade e cards sem ação.
- [x] Implementar gráficos sóbrios, alternativa tabular e indicadores reconciliados
  com pedidos, caixa e estoque.
- [x] Implementar horário semanal, intervalos, madrugada, feriados e exceções.
- [x] Implementar checklist de abertura/fechamento e bloqueios de turno.
- [x] Integrar caixa, dinheiro pendente, produção e aprovações ao turno.
- [x] Implementar tema por usuário/dispositivo e padrão da filial.

### Testes e gate

- [x] Período vazio, pouco dado, erro real e totais conferidos.
- [x] Virada de madrugada, feriado, abertura excepcional e fechamento bloqueado.
- [x] Claro, escuro e automático.
- [x] Gate: proprietário identifica saúde do negócio e gerente identifica prioridades
  sem divergência financeira.

## Fase 8 — limpeza e seed de homologação

### Trabalho

- [x] Remover componentes, CSS, links, emojis e fallbacks antigos.
- [x] Verificar que nenhuma ação retorna `undefined` ou apenas muda mensagem.
- [x] Fazer backup aplicável antes de recriar banco local ou de homologação.
- [x] Criar seed determinístico com tenant e filial de homologação.
- [x] Popular catálogo, modificadores, ficha técnica, estoque, clientes, mesas,
  reservas, fila, pedidos, pagamentos, KDS, impressão e turnos coerentes.
- [x] Criar uma conta individual por perfil sem credenciais no Git.
- [x] Receber senha por `SEED_TEST_PASSWORD` ou mecanismo equivalente seguro.
- [x] Documentar comando de reset/reseed e garantir que o seed duplo não duplica dados.

### Gate

- [x] Um cenário limpo, reproduzível e visualmente navegável.
- [x] Login, permissões e dados coerentes para todos os perfis.
- [x] Nenhum dado pessoal real.

## Fase 9 — QR personalizado por mesa

### Administração

- [x] Criar `/app/qr` no shell administrativo com filial, mesas, status e rotação.
- [x] Criar geração individual/lote, prévia e modelos controlados para placa 10×15,
  adesivo 8×8 e folha A4.
- [x] Exportar PDF, PNG e SVG com logo, cor, estabelecimento, mesa e instrução.
- [x] Validar contraste, quiet zone, tamanho mínimo e legibilidade.
- [x] Rotacionar com confirmação, invalidar material antigo imediatamente e auditar.

### Segurança e operação pública

- [x] Criar `qr_branch_settings`, versão do token em `dining_tables` e `service_requests`.
- [x] Usar URL com token HMAC assinado contendo tenant, filial, mesa e versão.
- [x] Exigir `QR_SIGNING_SECRET` fora do repositório em produção.
- [x] Resolver tenant/filial no backend; endpoint público nunca confia em `tenant_id`
  ou `tenantSlug` enviado pelo cliente.
- [x] Aplicar rate limit, cooldown, idempotência e proteção contra reenvio.
- [x] Cardápio abre sem atendimento; pedido, comanda, pré-conta e chamados exigem mesa ativa.
- [x] Permitir acompanhar preparo, chamar garçom e solicitar pré-conta.
- [x] Resumo público usa comanda real, não carrinho como fonte de verdade, e não expõe
  cliente, usuário ou dado pessoal.
- [x] Persistir carrinho local e impedir pedido duplicado.
- [x] Manter pagamento online desativado até conector opcional de pagamentos homologado;
  Asaas não processa pagamentos operacionais.

### Endpoints e gate

- [x] Administrativos: `/api/v1/qr/settings`, `/tables`, `/tables/:tableId/rotate`,
  `/artwork`.
- [x] Públicos: `/api/v1/qr/public/:token/context`, `/order`, `/orders`,
  `/service-requests`.
- [x] Testar token válido, inválido, rotacionado, mesa inativa, rate limit, duplicidade,
  comanda e chamados.
- [x] Gate: dono gera lote personalizado, rotação desativa o anterior e o cliente
  conclui os fluxos permitidos em mesa ativa.

## Fase 10 — fundação Enterprise Premium

Registro desta execução (2026-08-02): GiroMesa recebeu configuração versionada da experiência pública QR por filial (`guest_experience_configs`), rascunho/publicação sem troca do token, mensagens/título configuráveis e assinatura discreta de marca. O shell recebeu busca global, troca explícita de filial e densidade compacta/confortável. Dose Club recebeu fronteira de pagamento operacional manual, entitlements independentes, catálogo de produtos incluídos nos planos e landing/subdomínio separado. O gate de software e QA visual foi fechado em 2026-08-03; credenciais externas e hardware permanecem nos gates finais.

Progresso desta execução: a landing passou a usar a marca real, ganhou tema claro
inspirado no DoseClub e entrada discreta do ecossistema; o shell mostra a filial
resolvida pelo contexto autenticado; a experiência QR respeita tema, instrução e
logo configurados e acompanha a comanda real com recebido, restante e timeline.
O limite operacional de pagamentos foi separado do Asaas: novos pagamentos e
estornos usam métodos externos/manuais idempotentes, enquanto webhooks Asaas
operacionais são ignorados com auditoria. A auditoria visual completa e os gates
de multiunidade foram concluídos; a homologação externa permanece pendente.
Estornos manuais agora aceitam chave idempotente e repetição devolve o mesmo
registro, sem duplicar movimento financeiro.

### Trabalho

- [x] Auditar visualmente rotas administrativas, operacionais, públicas e comerciais.
- [x] Consolidar tipografia, espaçamento, densidade, elevação, estados e componentes.
- [x] Refinar temas claro, escuro e automático mantendo navy, amarelo e identidade existente.
- [x] Criar densidades confortável e compacta para gestão e operação.
- [x] Padronizar páginas, drawers, modais, filtros, formulários, tabelas e feedback.
- [x] Remover ações decorativas, excesso de informação e textos técnicos desnecessários.
- [x] Aplicar a mesma qualidade às landings GiroMesa e DoseClub.

### Gate

- [x] Experiência visual coerente, acessível e sem regressão funcional em desktop, tablet e celular.

## Fase 11 — arquitetura de informação e gestão multiunidade

### Trabalho

- [x] Reorganizar navegação por operação, gestão, crescimento, configurações e ecossistema.
- [x] Criar busca global e acesso rápido às ações frequentes.
- [x] Tornar troca de filial explícita e preservar contexto em todas as rotas.
- [x] Criar dashboard executivo com vendas, caixa, margem, ocupação, produção, estoque e alertas.
- [x] Criar dashboards distintos para proprietário, gerente, caixa, recepção, estoque e produção.
- [x] Permitir comparação entre filiais sem misturar permissões ou dados.
- [x] Criar central de pendências com prioridade, responsável, prazo e ação direta.

### Gate

- [x] Cada perfil identifica a próxima ação sem interpretar indicadores desconectados.

## Fase 12 — operação real e experiência do consumidor

### Trabalho

- [x] Refinar PDV para reduzir cliques, melhorar atalhos e operar em alto giro.
- [x] Revisar jornadas de salão, reservas, fila, garçom, KDS, caixa e fechamento.
- [x] Garantir continuidade da mesma comanda entre dispositivos e perfis autorizados.
- [x] Expandir QR para pedido contínuo, repetição, acompanhamento, comanda e atendimento.
- [x] Criar linha do tempo: recebido, em revisão, enviado, preparando, pronto, entregue ou cancelado.
- [x] Permitir identificação temporária opcional por apelido ou assento, sem biometria.
- [x] Preparar seleção de itens, divisão igual, por pessoa ou por valor.
- [x] Manter recebimento assistido enquanto não existir conector bancário opcional homologado.
- [x] Permitir chamada de garçom por motivos configuráveis, com reconhecimento e resolução.
- [x] Permitir pré-conta mesmo com carrinho local vazio, usando a comanda real.

### Gate

- [x] Jornadas completas funcionam sem telas mortas, ambiguidades financeiras ou refresh manual.

## Fase 13 — personalização, QR premium e aquisição orgânica

### Trabalho

- [x] Criar `GuestExperienceConfig` versionado por tenant, com sobrescrita por filial.
- [x] Oferecer modelos controlados: Gastronomia, Bar Noturno, Café e DoseClub.
- [x] Personalizar logo, capa, paleta validada, fonte curada, textos e destaques.
- [x] Personalizar campanhas e informações da casa com validação no backend.
- [x] Traduzir a experiência pública, personalizar categorias/recomendações e motivos de atendimento.
- [x] Criar rascunho, prévia, publicação, agendamento e rollback.
- [x] Atualizar experiência pública sem exigir reimpressão do QR.
- [x] Preservar quiet zone, contraste, legibilidade e rotação segura do token.
- [x] Disponibilizar placas, adesivos e A4 com personalização controlada.
- [x] Exibir discretamente “Tecnologia GiroMesa”.
- [x] Exibir “DoseClub, por GiroMesa” quando recurso estiver habilitado.
- [x] Adicionar “Conheça a tecnologia deste atendimento” sem competir com pedido ou pagamento.
- [x] Registrar somente origem comercial agregada, sem mesa, pedido ou dado pessoal.

### Gate

- [x] Estabelecimento obtém identidade própria sem white-label total, código livre ou risco à leitura do QR.

## Fase 14 — ecossistema GiroMesa e DoseClub

### Trabalho

- [x] Criar landing em `doseclube.giromesa.com.br` com apresentação, contratação e acesso.
- [x] Manter GiroMesa, DoseClub e combo como produtos comerciais independentes.
- [x] Centralizar catálogo comercial, assinaturas e entitlements no GiroMesa.
- [x] Implementar federação de identidade destinada a `accounts.giromesa.com.br`.
- [x] Manter códigos, bancos, deploys e operação dos produtos separados.
- [x] Implementar SSO e handoff contextual sem compartilhar sessão de banco.
- [x] Implementar e validar localmente estoque compartilhado em mililitros por contrato,
  outbox e idempotência.
- [x] Cobrir consumo individual, combos, produtos elegíveis, estorno e reprocessamento.
- [x] Exibir consumo DoseClub na comanda GiroMesa como linha informativa sem cobrança duplicada.
- [x] Permitir aquisição somente de GiroMesa, somente de DoseClub ou do combo.
- [x] Manter carteiras de fidelidade separadas, com campanhas comerciais cruzadas opcionais.

### Gate

- [x] Indisponibilidade de um produto não corrompe nem bloqueia operação independente do outro.

## Fase 15 — hardening de produção, jurídico e integrações externas

Executar somente depois de todos os gates internos.

### 15.0 Congelamento e release reproduzível

**Arquivos de autoridade:** `.github/workflows/`, `docker-compose.prod.yml`,
`docker-compose.ghcr.yml`, `packages/db/drizzle/`, `apps/api/prisma/migrations/`,
`docs/BACKUP_RESTORE.md` e os manifests de cada repositório.

- [ ] Revisar e consolidar separadamente o diff GiroMesa e o diff DoseClub; nenhuma
  alteração de um produto entra no repositório do outro.
- [ ] Registrar SHA, imagens, lockfile, migrations e configuração não secreta da release.
- [ ] Validar instalação congelada, migration em banco vazio, upgrade do baseline e
  compatibilidade expand-migrate-contract antes do primeiro deploy.
- [ ] Criar ambiente staging/pilot com aprovação manual; o mesmo digest aprovado é
  promovido sem rebuild para produção.
- [ ] Fixar fingerprint SSH em `known_hosts`; remover `accept-new` e falhar em mismatch.
- [ ] Tornar audit de dependências e Trivy bloqueantes para `CRITICAL`; `HIGH` exige
  exceção registrada com owner, justificativa e validade.
- [ ] Definir baseline de cobertura e impedir regressão em auth, tenant, RBAC, pedido,
  pagamento, caixa, QR, estoque, webhooks, ledger DoseClub e billing.
- [ ] Confirmar o repositório oficial, arquivar a cópia legada `pendevtsp-star/giromesa`,
  remover credencial demo publicada, rotacioná-la onde tenha sido reutilizada e executar
  secrets scan no histórico dos dois produtos.

### 15.1 Segurança P0 e isolamento

**GiroMesa:** `apps/api/src/modules/platform/platform.service.ts`,
`apps/api/src/modules/health/health.controller.ts`, `apps/api/src/main.ts`,
`apps/api/src/modules/platform/backup.service.ts`, `apps/api/Dockerfile`,
`docker-compose.prod.yml`, `apps/web/src/app/m/[tenantSlug]/page.tsx`.

**DoseClub:** `scripts/pilot-readiness.mjs`, `apps/web/app/components/LoginScreen.tsx`,
`apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.service.ts`.

- [ ] Substituir senha previsível de novo tenant por convite de uso único, expiração,
  hash persistido, rate limit, auditoria e definição de senha pelo próprio usuário.
- [ ] Manter públicos somente `/health` e `/health/ready` sanitizados; métricas, alertas,
  memória, topologia, nomes de estoque e dependências exigem autenticação de plataforma
  ou rede privada.
- [ ] Desabilitar restore pelo backoffice até que execute em banco isolado, com backup
  verificável, dupla confirmação, permissão de plataforma e trilha append-only.
- [ ] Remover qualquer fallback demo de tenant real; falha de API produz erro explícito,
  retry e contato de suporte, nunca conteúdo Bar Aurora ou dados sintéticos.
- [ ] Tornar onboarding do piloto `invite-only`; `ENABLE_TESTING_ENDPOINTS`, simuladores
  e criação demo ficam `false` em produção.
- [ ] Corrigir o validador DoseClub para rejeitar placeholder, segredo ausente, worker
  parado e integração marcada pronta sem health real.
- [ ] Revisar logs de webhooks e autenticação para não registrar telefone, token, segredo,
  PAN, CVV, PIN ou PII desnecessária.
- [ ] Verificar headers na resposta real de Nginx/Cloudflare antes de alterar Next/API;
  aplicar CSP primeiro em report-only e somente depois bloquear sem quebrar QR, OAuth ou assets.

### 15.2 Comercial, landing, jurídico e consentimento

**GiroMesa:** `apps/web/src/app/page.tsx`, `apps/web/src/app/teste-gratis/page.tsx`,
`apps/web/src/app/status/page.tsx`, novas rotas públicas em `apps/web/src/app/termos/`,
`apps/web/src/app/privacidade/`, `apps/web/src/app/cookies/`,
`apps/web/src/app/cancelamento/`, `apps/web/src/app/contato/`,
`apps/web/src/app/seguranca/` e `apps/web/src/app/suboperadores/`,
além de `packages/db/src/schema.ts` e `apps/api/src/modules/auth/`.

**DoseClub:** `apps/web/app/components/LandingPage.tsx`, `apps/web/app/terms/page.tsx`,
`apps/web/app/privacy/page.tsx`, `apps/web/app/cookies/page.tsx`,
`apps/web/app/cancellation/page.tsx`, `apps/web/app/contact/page.tsx`,
`apps/api/src/tenants/tenants.service.ts` e `apps/api/prisma/schema.prisma`.

- [ ] Definir razão social, nome fantasia, CNPJ, endereço, contato de suporte, canal
  LGPD, responsável por incidentes e horário de atendimento reais.
- [ ] Publicar Termos de Uso, contrato SaaS B2B, Privacidade, Cookies, Cancelamento,
  DPA, suboperadores, segurança/incidentes, termos do QR e aviso de bebidas alcoólicas.
- [ ] Submeter redação a advogado e regras fiscais/retentivas a contador; templates
  internos e este checklist não equivalem a aprovação profissional.
- [ ] Persistir aceite append-only com documento, versão, hash, usuário/contexto,
  timestamp e origem; consentimentos opcionais permanecem separados e revogáveis.
- [ ] Corrigir landing GiroMesa para preservar `?plan=starter|professional|premium`,
  renderizar a escolha inicial e revalidar preço/plano no backend.
- [ ] Remover do DoseClub “dezenas de estabelecimentos”, SLA sem medição, white-label
  completo, isolamento absoluto, gerente dedicado e automação não homologada.
- [ ] Unificar preços e produtos da landing DoseClub com o catálogo central; fallback
  nunca publica preço diferente do backend.
- [ ] Identificar ambos como programa piloto/acesso antecipado, sem depoimento, número,
  disponibilidade ou resultado não comprovado.
- [ ] Implementar política de cookies com rejeição/revogação para analytics e marketing;
  cookies estritamente essenciais permanecem documentados.
- [ ] Aplicar age gate 18+ no DoseClub e em jornada QR com álcool, sem substituir a
  conferência humana pelo estabelecimento.
- [ ] Comprovante operacional deve mostrar estabelecimento, CNPJ, filial, endereço,
  pedido/mesa, data/hora, itens, taxa opcional, descontos, pagamentos parciais/mistos,
  operador e a indicação `COMPROVANTE NÃO FISCAL` enquanto fiscal estiver desligado.

#### Landing pages baseadas em evidência

- [ ] Preservar as logos oficiais e evoluir as duas landings incrementalmente; GiroMesa
  permanece claro e refinado nas superfícies comerciais, com produto operacional
  `dark-first`, enquanto DoseClub preserva a identidade navy premium.
- [ ] Substituir prova social inexistente por evidência verificável do produto: capturas
  reais, tour funcional GiroMesa `mesa → pedido → produção → pagamento → estoque` e tour
  DoseClub `oferta → venda → consumo → saldo → estorno`.
- [ ] Remover logos de clientes, avaliações, contadores, urgência artificial, badge
  “Popular”, “mais escolhido”, SLA, resultado financeiro e qualquer estatística sem
  origem, período, metodologia e autorização comprováveis.
- [ ] Apresentar a empresa como sediada em Maceió, Alagoas; razão social, CNPJ, endereço,
  contatos e horário somente entram na interface após validação documental.
- [ ] Manter navegação pública rasa e previsível: Produto, Operação, Planos, DoseClub,
  Segurança, Ajuda, Entrar e CTA principal; o menu móvel deve oferecer os mesmos destinos.
- [ ] Fazer “Demonstração” abrir uma demonstração real e “Agendar apresentação” abrir um
  fluxo real de contato/agendamento; nenhum CTA pode terminar silenciosamente no login.
- [ ] Preservar `produto`, `plano` e `origem` até o backend, que revalida catálogo,
  entitlement, preço e disponibilidade antes de criar trial ou cobrança.
- [ ] Integrar a landing DoseClub ao catálogo canônico; em indisponibilidade, ocultar o
  preço ou mostrar “Consulte condições”, nunca publicar outro valor fixo.
- [ ] Classificar integrações como `disponível`, `em piloto` ou `planejada` a partir de
  configuração real; conectores desativados não aparecem como benefício contratado.
- [ ] Migrar imagens externas frágeis para ativos próprios ou licenciados, com dimensões,
  `alt`, otimização e origem documentadas; capturas do produto têm prioridade sobre
  imagens genéricas.
- [ ] Explicar sem ambiguidade GiroMesa independente, DoseClub independente, combo,
  estoque compartilhado opcional e acesso federado condicionado a entitlement.

### 15.3 Acabamento do produto para proprietário, equipe e consumidor

**Superfícies:** GiroMesa `apps/web/src/app/app/`, `apps/web/src/app/q/[tableCode]/`,
`apps/web/src/app/platform/`; DoseClub `apps/web/app/components/` e
`apps/web/app/backoffice/`.

- [ ] Preservar logos e direção visual; corrigir apenas regressões comprovadas de
  hierarquia, densidade, contraste, responsividade, foco, teclado e touch.
- [ ] Proprietário/gerente recebe próxima ação, saúde do turno, alertas acionáveis e
  comparação de filial; logs, filas, JSON, IDs e diagnósticos ficam no backoffice.
- [ ] Caixa, garçom, cozinha/bar, recepção e estoque veem somente módulos e ações do
  perfil, filial, entitlement e feature flag atuais.
- [ ] Integração desativada não gera botão decorativo; o administrador recebe estado
  `não configurada`, `em homologação`, `ativa`, `degradada` ou `revogada` e a contingência.
- [ ] Onboarding do parceiro é retomável e termina somente com filial, horário, usuários,
  catálogo, estoque, mesas/QR, estações, impressão, caixa e suporte configurados.
- [ ] Consumidor QR vê estabelecimento/mesa corretos, preço/taxa, comanda, preparo,
  chamado, pré-conta, erro e indisponibilidade sem dados pessoais ou fallback demo.
- [ ] DoseClub explica e executa clube individual, combo, saldo em ml, consumo, estorno,
  idade e integração opcional, sem misturar pagamento do consumidor com assinatura SaaS.
- [ ] Rodar QA visual em `390×844`, `768×1024`, `1024×768`, `1440×900` e KDS
  `1920×1080`, incluindo vazio, erro, offline, conflito, permissão e integração desligada.

#### Operação de pico e economia de interação

- [ ] Criar perfil por dispositivo com filial, modo inicial (`mesa`, `balcão`, `bar`,
  `caixa`, `KDS` ou `expedição`), estação, impressora e permissão para trocar de modo.
- [ ] No garçom, manter mesa, total, estado e itens não enviados sempre visíveis; oferecer
  busca, categorias, favoritos, recentes e repetição de item em um toque.
- [ ] Permitir que um item comum, sem modificadores, seja adicionado e enviado em até três
  ações depois da seleção da mesa; modificadores só interrompem o fluxo quando existirem.
- [ ] Manter ação principal na zona inferior do celular, feedback imediato, sincronização
  explícita e recuperação sem perda de rascunho em erro ou reconexão.
- [ ] Unificar divisão/recebimento em um fluxo com modos por item, pessoa/assento, valor e
  partes iguais, mantendo total, recebido e restante visíveis em todas as etapas.
- [ ] Preservar os atalhos atuais do PDV, testar conflitos em campos/dialogs e exibir ajuda
  acessível; atalhos configuráveis ficam fora do gate do piloto.
- [ ] Exigir rota válida `produto/categoria → estação KDS → impressora de contingência`
  antes de ativar uma estação; bebida, comida e expedição não podem depender de escolha
  manual a cada pedido.
- [ ] Adicionar ou comprovar KDS de expedição, recall do último ticket e confirmação de
  entrega; permitir seleção, avanço, retorno e recall por teclado/bump bar sem touchscreen.
- [ ] Bloquear fechamento do turno enquanto existirem comandas, dinheiro de garçom,
  divergências, impressões, fiscal ou integrações pendentes, indicando a ação corretiva.
- [ ] Em perda de internet, mostrar capacidade reduzida sem sucesso falso, bloquear
  mutações inseguras e orientar contingência por impressora, 4G ou procedimento manual;
  offline transacional completo permanece fora do piloto.

#### Personalização controlada e marca do ecossistema

- [ ] Permitir logo da casa, capa, mensagem, cores dentro de faixas acessíveis, destaques,
  instruções, QR e modelos controlados; continuar proibindo CSS, script e fonte externa.
- [ ] Manter “Tecnologia GiroMesa” discreto, acessível e imutável no QR; mostrar
  “DoseClub conectado” apenas quando integração e entitlement estiverem ativos.
- [ ] Não permitir que personalização esconda preço, termos, estado, indisponibilidade,
  consentimento, marca mínima ou ação de suporte.

### E-mail e autenticação

- [ ] Homologar Resend para convites, recuperação, confirmação e alertas, mantendo SMTP como alternativa,
  bounce e rastreio.
- [ ] Manter uma única `EMAIL_FROM`, remetente e `reply-to` reais; eliminar `example.com`
  dos workflows e exemplos de release.
- [ ] Validar SPF, DKIM e DMARC; tratar webhook Resend assinado e deduplicado para
  delivered, bounced, complained e suppressed, sem revelar existência de conta.
- [ ] Exercitar convite, reenvio, reset de uso único, expiração, bounce e indisponibilidade
  em endereços externos reais; falha de e-mail não derruba sessões operacionais existentes.
- [ ] Homologar Google OAuth com origens, callback HTTPS, `state`, vínculo, revogação
  e encaminhamento público `/api/v1` sem duplicação `/api`.
- [ ] Validar nos dois produtos `openid email profile`, login, vínculo, desvínculo,
  MFA opcional e fallback por e-mail/senha; nenhum callback localhost entra em produção.
- [ ] Configurar no console Google homepage, domínio, termos, privacidade e callbacks
  exatos; segredos permanecem somente no ambiente protegido.

### Cobrança SaaS, pagamentos operacionais e Dose Club

- [ ] Isolar Asaas em `platform_billing`, cobrando somente assinaturas GiroMesa, Dose Club e combo.
- [ ] Homologar Asaas em sandbox: cliente, assinatura, checkout, webhook assinado,
  idempotência, outbox, reconciliação, trial, inadimplência, cancelamento e entitlements.
- [ ] No DoseClub, converter `priceCents` para decimal antes de enviar `value`; testar
  explicitamente R$ 99,00 e R$ 299,00 e impedir ativação ao apenas criar a assinatura.
- [ ] Implementar `POST /v1/webhooks/asaas/platform` com autenticação, persistência
  anterior ao processamento, idempotência, fila, reconciliação e ativação somente após
  evento financeiro confirmado.
- [x] Impedir criação de pagamento operacional por Asaas e manter webhook SaaS separado de comandas.
- [ ] Criar ledger neutro para dinheiro, Pix externo, crédito, débito, voucher, cortesia e outros.
- [ ] Registrar referência/NSU, operador, filial, auditoria, pagamento parcial, misto, estorno e divergência.
- [x] Criar e persistir intenção de compra Dose Club.
- [ ] Completar a máquina de estados da intenção individual/combo; liberar saldo e
  entitlement somente após confirmação autorizada, idempotente e reconciliada.
- [ ] Manter arquitetura para conectores bancários opcionais por filial, sem exigir conta Asaas.
- [x] Manter GiroMesa, Dose Club e combo como produtos independentes, com acesso por
  entitlement e interfaces independentes.
- [ ] Homologar contrato Dose Club 2026-07-30 com IDs reais de teste, filial/produto,
  consumo individual, combos, estoque compartilhado em ml, concorrência, timeout,
  retry, 409, estorno, webhook e `integration.shared_inventory`.
- [ ] Publicar migrations, catálogo central e handoff federado já implementados; testar
  tenant/funcionário pré-provisionado, token de uso único e indisponibilidade de um produto.

### TEF e conciliação de adquirentes

**Autoridade GiroMesa:** `apps/api/src/modules/payments/`, `apps/api/src/modules/pos/`,
`packages/domain/src/`, `packages/db/src/schema.ts` e `apps/web/src/app/app/cash/`.

- [ ] Criar contrato mínimo `PaymentConnector` somente após escolher adquirente/provider,
  sistema operacional, PIN pad e processo de homologação do parceiro.
- [ ] Preservar o fluxo atual de terminal externo: método, valor, bandeira, NSU/código de
  autorização, operador, filial, divergência, estorno e conciliação manual auditada.
- [ ] Implementar timeout, consulta, cancelamento e repetição idempotente sem armazenar
  ou registrar PAN completo, CVV ou PIN.
- [ ] Ativar TEF por filial/provider somente após ensaio no hardware; até lá, esconder a
  ação e usar maquininha externa.
- [ ] Documentar escopo PCI DSS aplicável com o fornecedor e o estabelecimento.

### WhatsApp não oficial

- [ ] Manter laboratório Web/QR em processo separado, sessão criptografada por
  tenant/filial, outbox, QR de pareamento, revogação e sem acesso aos bancos dos produtos.
- [x] Exibir claramente “integração não oficial da Meta” na documentação e na interface.
- [ ] Implementar status, reconexão, revogação, cooldown, rate limit, opt-out e fila.
- [ ] Cobrir reserva, fila, pedido, delivery, pré-conta e comprovante sem bloquear o núcleo.
- [x] Proibir sucesso falso no transporte desabilitado; marketing em massa, opt-out, retry e entrega incerta ainda dependem do conector QR e sua fila/outbox homologados.
- [ ] No piloto, usar `WHATSAPP_TRANSPORT=disabled` e CTA manual `wa.me`; automação Web/QR
  não é gate e só pode ser ativada após decisão jurídica documentada e aceite explícito do risco.
- [ ] Nenhuma confirmação de pedido, pagamento, reserva, consumo ou segurança depende de
  WhatsApp; e-mail, interface e procedimento humano são contingências obrigatórias.

### Hardware, fiscal e infraestrutura

- [ ] Homologar impressoras físicas 58/80, rede/USB, conector e reimpressão.
- [ ] Homologar Focus NFe por filial em ambiente de homologação e depois produção, com
  CNPJ/IE, credenciamento SEFAZ, certificado A1, CSC quando exigido, token externo,
  NCM, CFOP, CST/CSOSN, IBS/CBS e regras aprovadas pelo contador.
- [ ] Corrigir cancelamento Focus para respeitar o ambiente configurado; nunca cair
  silenciosamente de produção para homologação.
- [ ] Cobrir emissão, consulta, rejeição, cancelamento, contingência, retransmissão,
  guarda do XML, DANFE/NFC-e, reconciliação e alerta antes de `fiscal.enabled=true`.
- [ ] Homologar iFood somente após app, CNPJ, loja de teste e credenciais aprovadas;
  persistir evento antes do ACK, deduplicar, processar pedidos/cancelamentos/pagamentos,
  atualizar status, imprimir e conciliar.
- [ ] Enquanto iFood estiver desativado, usar o Gestor de Pedidos e lançamento manual
  com origem externa, chave de correlação e proteção contra duplicidade.
- [ ] Configurar Cloudflare, HTTPS, observabilidade, backup externo e restauração comprovada.
- [ ] Exigir sandbox, segredo externo, healthcheck, idempotência, reconciliação, alertas,
  teste de indisponibilidade e desligamento por filial para cada integração.

### Backoffice, observabilidade e suporte

**GiroMesa:** `apps/web/src/app/platform/`, `apps/api/src/modules/platform/`,
`apps/web/src/app/status/`, `apps/api/src/modules/integrations/outbox.*`.

**DoseClub:** `apps/web/app/backoffice/`, `apps/api/src/backoffice/`,
`apps/api/src/operations/` e `apps/worker/src/`.

- [ ] Habilitar backoffice somente para usuários internos nomeados, MFA obrigatório,
  sessão curta, recuperação testada, menor privilégio e auditoria do próprio acesso.
- [ ] Mostrar por tenant/filial: release, migrations, web/API/worker, filas, outbox,
  dead-letter, e-mail, integrações, backup, última reconciliação e incidentes.
- [ ] Não implementar impersonação silenciosa; suporte começa read-only e qualquer ação
  excepcional exige motivo, elevação temporária e auditoria visível.
- [ ] Criar monitor e página de status fora da VPS, sem expor memória, topologia, nomes
  de dados, versões internas ou segredos.
- [ ] Definir alertas: SEV-1 para perda/vazamento/cobrança/acesso cruzado; SEV-2 para
  PDV, caixa, KDS ou consumo indisponível; SEV-3 para função com contingência.
- [ ] Definir canal único de suporte, escala do turno piloto, dono do incidente,
  checkpoints e procedimento de rollback.

### Gate

- [ ] Nenhuma integração externa é considerada pronta sem cenário real de homologação
  e rollback/desligamento por filial.
- [ ] A UI operacional não exibe conector desativado como opção funcional; o
  administrador vê estado, dependência, contingência e responsável pela ativação.

### Matriz de ativação do piloto

| Recurso | Estado inicial | Ativação | Contingência |
|---|---|---|---|
| Resend | condicionado | convite e reset entregues, bounce observado | SMTP ou provisionamento assistido |
| Google OAuth | condicionado | callback HTTPS, vínculo, MFA e logout reais | e-mail e senha |
| Asaas SaaS | desligado | valor correto, webhook e reconciliação | ativação manual do parceiro |
| Estoque GiroMesa–DoseClub | desligado | homologação conjunta e entitlement | produtos independentes |
| Focus NFC-e | desligado | contador, SEFAZ, certificado e emissão real | emissor fiscal atual + comprovante não fiscal |
| TEF | desligado | provider e hardware homologados | terminal externo + NSU manual |
| iFood | desligado | homologação oficial aprovada | Gestor iFood + lançamento manual |
| WhatsApp Web/QR | laboratório desligado | decisão jurídica e risco aceito | `wa.me`, telefone e e-mail |
| Impressão térmica | por dispositivo | teste 58/80, falha e reimpressão | PDF/visualização e procedimento manual |
| Pagamento online QR | desligado | conector opcional futuro homologado | caixa/terminal externo |

## Fase 16 — aceite integral técnico, visual, operacional e jurídico

### Suítes obrigatórias

- [ ] Lint, typecheck, unitários, integração PostgreSQL, migrations em banco vazio, build.
- [ ] E2E autenticado por proprietário, gerente, caixa, recepção, garçom, cozinha,
  bar, estoque, financeiro e cliente QR.
- [ ] Isolamento multitenant, concorrência, idempotência e perda/reconexão de rede.
- [ ] Realtime/polling fallback e impressão simulada/hardware aplicável.
- [ ] Regressão visual, acessibilidade, teclado, touch e bump bar.
- [ ] QR público: token, rotação, personalização, timeline, chamados, comanda e ausência de PII.
- [ ] Pagamentos: Asaas rejeitado no fluxo operacional; cobrança SaaS não altera comanda.
- [ ] Dose Club: compra individual, combo, confirmação, concorrência, retry, estorno e isolamento.
- [ ] `git diff --check`, segurança, secrets scan e migrações.
- [ ] Testar rotas públicas legais, versão/hash de aceite, cookies, age gate, contato e
  ausência de claims/preços inconsistentes.
- [ ] Testar senha de provisionamento, convite, reset, MFA, sessões, rate limit, IDOR,
  CSRF, XSS, SSRF, HMAC/replay, QR rotacionado e webhook duplicado.
- [ ] Testar health público sanitizado e acesso negado a métricas, alertas, backup e
  backoffice sem permissão/MFA.
- [ ] Testar carga piloto sem meta inventada: erro abaixo de 1%, nenhuma duplicação,
  nenhum saldo negativo ou acesso cruzado e p95 das rotas comuns abaixo de 500 ms.
- [ ] Medir a jornada do garçom em celular físico: selecionar mesa, adicionar item comum,
  enviar, repetir item, abrir comanda, solicitar pré-conta e registrar pagamento parcial.
- [ ] Medir rotas e cliques sem publicar ganho não comprovado: item comum em até três ações
  após a mesa, ação primária visível sem scroll e feedback local em até 200 ms.
- [ ] Homologar KDS por toque e teclado/bump bar, incluindo estação errada, atraso, recall,
  expedição, impressora de contingência e reconexão.
- [ ] Verificar todas as rotas e CTAs públicos sem autenticação, menu móvel equivalente,
  plano/produto/origem preservados, preço canônico e ausência de claims não comprovados.

### Comandos mínimos reproduzíveis

GiroMesa:

```powershell
rtk pnpm lint
rtk proxy pnpm typecheck
rtk pnpm test
rtk pnpm test:integration
rtk pnpm db:check-safety
rtk pnpm security:preflight
rtk pnpm build
rtk pnpm test:e2e
rtk pnpm test:visual-audit
rtk git diff --check
```

DoseClub:

```powershell
rtk pnpm db:validate
rtk pnpm lint
rtk proxy pnpm typecheck
rtk pnpm test
rtk pnpm build
rtk pnpm e2e
rtk pnpm test:ops
rtk pnpm pilot:check:staging
rtk git diff --check
```

Os comandos de integração usam banco descartável ou staging. Nenhuma migration de
produção, rotação de segredo, deploy ou restore ocorre sem autorização específica.

### Jornada crítica

- [ ] Abrir turno e caixa.
- [ ] Acomodar reserva ou fila.
- [ ] Abrir mesa e lançar por garçom.
- [ ] Enviar itens a múltiplas estações.
- [ ] Concluir KDS por item e expedição.
- [ ] Adicionar consumo no PDV.
- [ ] Cancelar com aprovação e compensação.
- [ ] Dividir e pagar com múltiplos métodos.
- [ ] Entregar dinheiro do garçom.
- [ ] Fechar conta, limpar e liberar mesa.
- [ ] Imprimir comprovante.
- [ ] Fechar caixa e turno.
- [ ] Conferir dashboard e relatórios.
- [ ] Repetir jornada por QR público.
- [ ] Simular indisponibilidade das integrações.
- [ ] Repetir a jornada com Google/Resend indisponíveis e login tradicional ativo.
- [ ] Validar comprovante não fiscal e registro manual de NSU no terminal externo.
- [ ] Executar DoseClub standalone e integrado: individual, combo, consumo, 409, retry,
  dead-letter, estorno único e reconciliação em mililitros.

### Gate

- [ ] Nenhuma falha bloqueante, ação decorativa, credencial exposta, divergência
  financeira ou acesso cruzado entre tenants.
- [ ] Advogado e contador registram aprovação ou exceção explícita; Codex não marca
  jurídico/fiscal como aprovado por conta própria.
- [ ] Hardware, rede e contingências são aceitos no estabelecimento piloto, não apenas
  em navegador ou mock local.

## Fase 17 — handoff, backup, piloto e corte único

### Entrega

- [ ] URL de homologação e resultado do smoke test.
- [ ] Um login/senha de teste por perfil, entregue fora do Git.
- [ ] Matriz curta de permissões e cenários sugeridos.
- [ ] Lista de integrações, estados e aviso explícito do WhatsApp não oficial.
- [ ] Resultado dos testes, riscos, itens opcionais desativados e plano de suporte.
- [ ] Selecionar estabelecimento piloto e configurar filial, catálogo, mesas, QR, KDS e impressão.
- [ ] Executar turno real assistido antes da autorização de produção.
- [ ] Criar seed/roteiro específico do parceiro, sem credencial previsível ou dado demo,
  com proprietário, gerente, caixa, garçom, cozinha/bar e estoque.
- [ ] Treinar abertura/fechamento de turno, caixa, contingência, reimpressão, QR, KDS,
  estorno DoseClub e canal de suporte.
- [ ] Entregar matriz simples de permissões, quick start e procedimentos de queda de
  internet, impressora, integração e energia.

### Corte e rollback

- [ ] Criar backup verificável e validar restauração.
- [ ] Alcançar RPO máximo de uma hora e RTO máximo de quatro horas; preferir WAL/PITR,
  backup completo diário e cópia criptografada fora da VPS.
- [ ] Manter no mínimo sete backups diários, quatro semanais e seis mensais, com alerta,
  checksum e restore periódico em ambiente isolado.
- [ ] Incluir PostgreSQL, uploads, configurações, materiais QR e documentação de segredos;
  segredos são protegidos e restaurados separadamente.
- [ ] Registrar versões de app, migrations, imagens e configuração.
- [ ] Remover frontend operacional antigo e flags de compatibilidade aceitas.
- [ ] Publicar uma única versão somente após autorização explícita.
- [ ] Executar migrations, smoke, jornadas críticas e monitoramento.
- [ ] Manter rollback conjunto de aplicação, schema e configuração.
- [ ] Registrar compensações de mensagens/webhooks; elas não são “desprocessadas”.
- [ ] Revogar sessões WhatsApp e segredos independentemente quando necessário.

### Go/no-go do piloto

O piloto é **GO** somente quando todos os itens abaixo estiverem marcados:

- [ ] Documentos legais públicos, identidade empresarial, contrato piloto e DPA possuem
  revisão humana registrada.
- [ ] Backup externo e restore em ambiente isolado possuem evidência.
- [ ] Isolamento multitenant, integridade financeira, saldo e idempotência passaram.
- [ ] Não existe senha previsível, segredo exposto ou monitoramento interno público.
- [ ] PDV, caixa, KDS, QR, impressão crítica e consumo DoseClub possuem contingência.
- [ ] Toda integração ativa possui homologação, flag de desligamento e reconciliação.
- [ ] Suporte, responsável operacional e rollback estarão disponíveis durante o turno.

### Calendário crítico até quinta-feira

#### 03/08 — congelamento e P0

- [ ] Consolidar F13/F14 em SHAs revisados e abrir branch/release de hardening.
- [ ] Corrigir segurança P0, claims, preços, plano selecionado, e-mail e health público.
- [ ] Receber dados empresariais e textos revisados por advogado/contador.

#### 04/08 — integrações viáveis e infraestrutura

- [ ] Publicar páginas legais e aceite versionado.
- [ ] Homologar Resend e Google OAuth nos domínios reais.
- [ ] Corrigir Asaas SaaS, mas manter desligado até webhook/reconciliação passarem.
- [ ] Configurar monitor externo, backup, restore, tenant e dados do parceiro.

#### 05/08 — F16 e ensaio físico

- [ ] Rodar todas as suítes, segurança, migrations, E2E, visual e carga piloto.
- [ ] Ensaiar impressora, KDS, celulares/tablets, rede, QR impresso, caixa e DoseClub.
- [ ] Corrigir somente P0/P1; não abrir novo redesign nem feature sem relação com o piloto.

#### 06/08 — go/no-go e piloto assistido

- [ ] Fazer backup pré-turno, registrar release/digest e revisar flags.
- [ ] Executar jornada completa acompanhada, com war room, checkpoints e log de eventos.
- [ ] Reverter imediatamente em caso de corrupção, acesso cruzado ou divergência financeira.

## APIs, dados e tipos novos

### Experiência pública

- [x] Criar `GuestExperienceConfig` versionado por filial; temas e módulos controlados continuam em expansão.
- [x] Manter `QrBranchSettings` para segurança/capacidades e referenciar configuração visual versionada.
- [x] Expor APIs administrativas para editar, publicar, consultar histórico, pré-visualizar, agendar e reverter experiências.
- [x] Expor API pública consolidada de experiência, timeline e status de chamados.
- [x] Usar SSE pelo token público seguro, com polling como fallback.
- [ ] Validar upload, tamanho, formato e contraste; bloquear código, CSS e scripts personalizados.

### Jurídico e comunicação

- [ ] Criar `LegalDocumentVersion` e `LegalAcceptance` append-only no GiroMesa,
  equivalentes ao histórico já existente no DoseClub, sem guardar conteúdo livre do cliente.
- [ ] Criar eventos de entrega Resend para mensagem, provider id, estado, tentativa,
  timestamp e erro sanitizado; bounce/complaint alimenta supressão, não reenvio infinito.
- [ ] Manter versão e hash dos documentos em código/configuração revisada; publicação
  jurídica é separada de alteração arbitrária pelo tenant.

### Cobrança e pagamentos

- [ ] Separar `PlatformBilling` de `RestaurantPayments` em módulos, permissões e webhooks.
- [x] Criar tipos e persistência de métodos externos, referências e `PurchaseIntent`.
- [ ] Garantir idempotência, auditoria, tenant, filial, operador e concorrência em confirmações/estornos.
- [ ] Preservar registros operacionais Asaas existentes como legado, sem permitir novos registros.

### Dose Club

- [x] Preservar contrato 2026-07-30, HMAC, outbox, retry e idempotência.
- [x] Resolver tenant por vínculo seguro do cliente de integração; nenhum banco será compartilhado diretamente.
- [x] Manter entitlements independentes de nomes fixos de plano.

## Definição final de pronto

O plano só está concluído quando o usuário aprovar visualmente todos os perfis,
os gates técnicos estiverem registrados, as integrações requeridas estiverem
homologadas, os bancos estiverem povoados e as credenciais de teste forem
entregues. Isso não autoriza automaticamente produção: o corte exige autorização
explícita, backup verificável e rollback preparado.

## Referências oficiais usadas na revisão de produção

- [LGPD — Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
- [ANPD — comunicação de incidentes](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca)
- [ANPD — transferência internacional](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024)
- [ANPD — guia de cookies](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf)
- [Código de Defesa do Consumidor](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm)
- [Marco Civil da Internet](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm)
- [Lei nº 13.106/2015 — bebida alcoólica e menores](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13106.htm)
- [Lei Brasileira de Inclusão](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Resend — domains](https://resend.com/docs/dashboard/domains/introduction)
- [Google OAuth — políticas](https://developers.google.com/identity/protocols/oauth2/policies)
- [Asaas — criar assinatura](https://docs.asaas.com/reference/create-new-subscription)
- [Focus NFe — ambientes](https://doc.focusnfe.com.br/reference/ambiente)
- [PCI DSS](https://www.pcisecuritystandards.org/standards/pci-dss/)
- [iFood — homologação Order API](https://developer.ifood.com.br/pt-BR/docs/guides/modules/order/homologation/)
- [iFood — polling de eventos](https://developer.ifood.com.br/pt-BR/docs/guides/modules/events/polling-overview)
- [WhatsApp Business — termos](https://www.whatsapp.com/legal/business-terms)

## Fora de escopo ou condicionado

- Offline completo, app nativo e editor visual livre permanecem fora deste ciclo.
- TEF entra como arquitetura neutra e registro por terminal externo; automação fica
  condicionada à escolha e homologação de adquirente, provider, sistema e hardware.
- Fiscal Focus NFe e iFood entram no plano, mas não podem ser ativados sem credenciais,
  homologação oficial, contador e ambiente aplicável.
- WhatsApp Web/QR não oficial pode continuar em laboratório isolado, mas não integra o
  piloto como automação de produção; a contingência é contato manual e a API oficial Meta
  permanece fora enquanto essa decisão comercial for mantida.
- Pagamento online por QR permanece desativado até conector opcional homologado; Asaas fica restrito a assinaturas SaaS.
- Integração Dose Club preserva produtos e APIs separados; estoque compartilhado só
  é ativado por entitlement e contrato homologado.
