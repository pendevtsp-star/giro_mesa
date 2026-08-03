# GiroMesa — plano único de estabilização, redesign e conclusão

**Data de consolidação:** 2026-08-01  
**Substitui:** `2026-07-31-redesign-operacional-plan.md` e `2026-07-28-estabilizacao-mestra-plan.md`  
**Documento de referência visual/técnica:** `docs/superpowers/specs/2026-07-31-redesign-operacional-design.md`

Este é o único plano válido para a implementação do GiroMesa. O plano de
31/07 foi usado como base quando havia duplicidade; itens exclusivos do plano
de 28/07 foram incorporados nas fases correspondentes. Os dois documentos
anteriores devem permanecer excluídos para evitar execução paralela.

## Regras de execução

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
10. O WhatsApp, quando implementado, será via QR Code e conexão não oficial; isso
    deve ficar explícito na interface e na documentação.
11. Fases entram por flags quando necessário, mas a aplicação final será uma única
    substituição funcional, sem UI legada ou fallback antigo após o aceite.

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
- [ ] Fase 10 — fundação Enterprise Premium.
- [ ] Fase 11 — arquitetura de informação e gestão multiunidade.
- [ ] Fase 12 — operação real e experiência do consumidor.
- [ ] Fase 13 — personalização, QR premium e aquisição orgânica.
- [ ] Fase 14 — ecossistema GiroMesa e DoseClub.
- [ ] Fase 15 — integrações externas.
- [ ] Fase 16 — aceite integral técnico, visual e operacional.
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
  claro e do menu móvel. Auditoria autenticada permanece dependente de credenciais
  de teste fora do repositório.
- Fase 11: shell administrativo reorganizado por fluxo (Operação, Gestão,
  Configuração, Crescimento e Ecossistema), mantendo rotas e permissões; Clientes e
  Delivery agora ficam no grupo de crescimento. O gate visual e a validação de
  próxima ação por perfil continuam pendentes.
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
- Fase 14: pacote DoseClub de acesso comercial independente publicado em `e954582`; o
  onboarding registra DoseClub ou combo, o handoff para GiroMesa permanece separado e
  sem SSO falso. Migration, CI, testes, E2E e segurança passaram em `30785791198`.
- Fase 15: pagamentos operacionais não usam mais Asaas; métodos externos são registrados
  como manuais, boleto é rejeitado e webhook Asaas operacional é ignorado. Homologação SaaS
  externa permanece pendente.
- Fase 16: typecheck, lint, testes unitários, build e security preflight locais passaram;
  E2E autenticado, integração PostgreSQL e QA visual completa continuam pendentes.
- O checklist continua aberto até os testes, QA e evidências de cada gate serem
  concluídos e revisados.

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

Registro desta execução (2026-08-02): GiroMesa recebeu configuração versionada da experiência pública QR por filial (`guest_experience_configs`), rascunho/publicação sem troca do token, mensagens/título configuráveis e assinatura discreta de marca. O shell recebeu busca global, troca explícita de filial e densidade compacta/confortável. Dose Club recebeu fronteira de pagamento operacional manual, entitlements independentes, catálogo de produtos incluídos nos planos e landing/subdomínio separado. Gates de QA visual, credenciais externas e hardware permanecem abertos.

Progresso desta execução: a landing passou a usar a marca real, ganhou tema claro
inspirado no DoseClub e entrada discreta do ecossistema; o shell mostra a filial
resolvida pelo contexto autenticado; a experiência QR respeita tema, instrução e
logo configurados e acompanha a comanda real com recebido, restante e timeline.
O limite operacional de pagamentos foi separado do Asaas: novos pagamentos e
estornos usam métodos externos/manuais idempotentes, enquanto webhooks Asaas
operacionais são ignorados com auditoria. A homologação externa, a auditoria
visual completa e os gates de multiunidade continuam pendentes.
Estornos manuais agora aceitam chave idempotente e repetição devolve o mesmo
registro, sem duplicar movimento financeiro.

### Trabalho

- [ ] Auditar visualmente rotas administrativas, operacionais, públicas e comerciais.
- [ ] Consolidar tipografia, espaçamento, densidade, elevação, estados e componentes.
- [ ] Refinar temas claro, escuro e automático mantendo navy, amarelo e identidade existente.
- [x] Criar densidades confortável e compacta para gestão e operação.
- [ ] Padronizar páginas, drawers, modais, filtros, formulários, tabelas e feedback.
- [ ] Remover ações decorativas, excesso de informação e textos técnicos desnecessários.
- [x] Aplicar a mesma qualidade às landings GiroMesa e DoseClub.

### Gate

- [ ] Experiência visual coerente, acessível e sem regressão funcional em desktop, tablet e celular.

## Fase 11 — arquitetura de informação e gestão multiunidade

### Trabalho

- [x] Reorganizar navegação por operação, gestão, crescimento, configurações e ecossistema.
- [x] Criar busca global e acesso rápido às ações frequentes.
- [x] Tornar troca de filial explícita e preservar contexto em todas as rotas.
- [ ] Criar dashboard executivo com vendas, caixa, margem, ocupação, produção, estoque e alertas.
- [x] Criar dashboards distintos para proprietário, gerente, caixa, recepção, estoque e produção.
- [x] Permitir comparação entre filiais sem misturar permissões ou dados.
- [x] Criar central de pendências com prioridade, responsável, prazo e ação direta.

### Gate

- [ ] Cada perfil identifica a próxima ação sem interpretar indicadores desconectados.

## Fase 12 — operação real e experiência do consumidor

### Trabalho

- [ ] Refinar PDV para reduzir cliques, melhorar atalhos e operar em alto giro.
- [ ] Revisar jornadas de salão, reservas, fila, garçom, KDS, caixa e fechamento.
- [ ] Garantir continuidade da mesma comanda entre dispositivos e perfis autorizados.
- [x] Expandir QR para pedido contínuo, repetição, acompanhamento, comanda e atendimento.
- [x] Criar linha do tempo: recebido, em revisão, enviado, preparando, pronto, entregue ou cancelado.
- [ ] Permitir identificação temporária opcional por apelido ou assento, sem biometria.
- [x] Preparar seleção de itens, divisão igual, por pessoa ou por valor.
- [x] Manter recebimento assistido enquanto não existir conector bancário opcional homologado.
- [x] Permitir chamada de garçom por motivos configuráveis, com reconhecimento e resolução.
- [x] Permitir pré-conta mesmo com carrinho local vazio, usando a comanda real.

### Gate

- [ ] Jornadas completas funcionam sem telas mortas, ambiguidades financeiras ou refresh manual.

## Fase 13 — personalização, QR premium e aquisição orgânica

### Trabalho

- [x] Criar `GuestExperienceConfig` versionado por tenant, com sobrescrita por filial.
- [x] Oferecer modelos controlados: Gastronomia, Bar Noturno, Café e DoseClub.
- [ ] Personalizar logo, capa, paleta validada, fonte curada, textos, idiomas e destaques.
- [ ] Personalizar categorias, recomendações, campanhas, informações da casa e motivos de atendimento.
- [x] Criar rascunho, prévia, publicação, agendamento e rollback.
- [x] Atualizar experiência pública sem exigir reimpressão do QR.
- [x] Preservar quiet zone, contraste, legibilidade e rotação segura do token.
- [x] Disponibilizar placas, adesivos e A4 com personalização controlada.
- [x] Exibir discretamente “Tecnologia GiroMesa”.
- [x] Exibir “DoseClub, por GiroMesa” quando recurso estiver habilitado.
- [x] Adicionar “Conheça a tecnologia deste atendimento” sem competir com pedido ou pagamento.
- [ ] Registrar somente origem comercial agregada, sem mesa, pedido ou dado pessoal.

### Gate

- [ ] Estabelecimento obtém identidade própria sem white-label total, código livre ou risco à leitura do QR.

## Fase 14 — ecossistema GiroMesa e DoseClub

### Trabalho

- [x] Criar landing em `doseclube.giromesa.com.br` com apresentação, contratação e acesso.
- [x] Manter GiroMesa, DoseClub e combo como produtos comerciais independentes.
- [ ] Centralizar catálogo comercial, assinaturas e entitlements no GiroMesa.
- [ ] Federar identidade por `accounts.giromesa.com.br`.
- [x] Manter códigos, bancos, deploys e operação dos produtos separados.
- [ ] Implementar SSO e handoff contextual sem compartilhar sessão de banco.
- [x] Homologar estoque compartilhado em mililitros por contrato, outbox e idempotência.
- [x] Cobrir consumo individual, combos, produtos elegíveis, estorno e reprocessamento.
- [x] Exibir consumo DoseClub na comanda GiroMesa como linha informativa sem cobrança duplicada.
- [x] Permitir aquisição somente de GiroMesa, somente de DoseClub ou do combo.
- [ ] Manter carteiras de fidelidade separadas, com campanhas comerciais cruzadas opcionais.

### Gate

- [ ] Indisponibilidade de um produto não corrompe nem bloqueia operação independente do outro.

## Fase 15 — integrações externas

Executar somente depois de todos os gates internos.

### E-mail e autenticação

- [ ] Homologar Resend para convites, recuperação, confirmação e alertas, mantendo SMTP como alternativa,
  bounce e rastreio.
- [ ] Homologar Google OAuth com origens, callback HTTPS, `state`, vínculo, revogação
  e encaminhamento público `/api/v1` sem duplicação `/api`.

### Cobrança SaaS, pagamentos operacionais e Dose Club

- [ ] Isolar Asaas em `platform_billing`, cobrando somente assinaturas GiroMesa, Dose Club e combo.
- [ ] Homologar Asaas em sandbox: cliente, assinatura, checkout, webhook assinado,
  idempotência, outbox, reconciliação, trial, inadimplência, cancelamento e entitlements.
- [ ] Impedir criação de pagamento operacional por Asaas e manter webhook SaaS separado de comandas.
- [ ] Criar ledger neutro para dinheiro, Pix externo, crédito, débito, voucher, cortesia e outros.
- [ ] Registrar referência/NSU, operador, filial, auditoria, pagamento parcial, misto, estorno e divergência.
- [ ] Criar intenção de compra Dose Club; liberar saldo somente após confirmação autorizada.
- [ ] Manter arquitetura para conectores bancários opcionais por filial, sem exigir conta Asaas.
- [ ] Manter GiroMesa, Dose Club e combo como produtos independentes, com acesso por
  entitlement e interfaces independentes.
- [ ] Homologar contrato Dose Club 2026-07-30 com IDs reais de teste, filial/produto,
  consumo individual, combos, estoque compartilhado em ml, concorrência, timeout,
  retry, 409, estorno, webhook e `integration.shared_inventory`.

### WhatsApp não oficial

- [ ] Implementar adapter/worker isolado, outbox, QR de pareamento e sessão criptografada
  por tenant/filial.
- [x] Exibir claramente “integração não oficial da Meta” na documentação e na interface.
- [ ] Implementar status, reconexão, revogação, cooldown, rate limit, opt-out e fila.
- [ ] Cobrir reserva, fila, pedido, delivery, pré-conta e comprovante sem bloquear o núcleo.
- [ ] Proibir marketing em massa, sucesso falso e retry cego quando a entrega for incerta.

### Hardware, fiscal e infraestrutura

- [ ] Homologar impressoras físicas 58/80, rede/USB, conector e reimpressão.
- [ ] Homologar Focus NFe quando contratado, com contador, certificado, contingência e cancelamento.
- [ ] Homologar iFood quando contratado, incluindo pedidos, KDS, impressão e conciliação.
- [ ] Configurar Cloudflare, HTTPS, observabilidade, backup externo e restauração comprovada.
- [ ] Exigir sandbox, segredo externo, healthcheck, idempotência, reconciliação, alertas,
  teste de indisponibilidade e desligamento por filial para cada integração.

### Gate

- [ ] Nenhuma integração externa é considerada pronta sem cenário real de homologação
  e rollback/desligamento por filial.

## Fase 16 — aceite integral

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

### Gate

- [ ] Nenhuma falha bloqueante, ação decorativa, credencial exposta, divergência
  financeira ou acesso cruzado entre tenants.

## Fase 17 — handoff, backup, piloto e corte único

### Entrega

- [ ] URL de homologação e resultado do smoke test.
- [ ] Um login/senha de teste por perfil, entregue fora do Git.
- [ ] Matriz curta de permissões e cenários sugeridos.
- [ ] Lista de integrações, estados e aviso explícito do WhatsApp não oficial.
- [ ] Resultado dos testes, riscos, itens opcionais desativados e plano de suporte.
- [ ] Selecionar estabelecimento piloto e configurar filial, catálogo, mesas, QR, KDS e impressão.
- [ ] Executar turno real assistido antes da autorização de produção.

### Corte e rollback

- [ ] Criar backup verificável e validar restauração.
- [ ] Registrar versões de app, migrations, imagens e configuração.
- [ ] Remover frontend operacional antigo e flags de compatibilidade aceitas.
- [ ] Publicar uma única versão somente após autorização explícita.
- [ ] Executar migrations, smoke, jornadas críticas e monitoramento.
- [ ] Manter rollback conjunto de aplicação, schema e configuração.
- [ ] Registrar compensações de mensagens/webhooks; elas não são “desprocessadas”.
- [ ] Revogar sessões WhatsApp e segredos independentemente quando necessário.

## APIs, dados e tipos novos

### Experiência pública

- [x] Criar `GuestExperienceConfig` versionado por filial; temas e módulos controlados continuam em expansão.
- [x] Manter `QrBranchSettings` para segurança/capacidades e referenciar configuração visual versionada.
- [x] Expor APIs administrativas para editar, publicar, consultar histórico, pré-visualizar, agendar e reverter experiências.
- [x] Expor API pública consolidada de experiência, timeline e status de chamados.
- [x] Usar SSE pelo token público seguro, com polling como fallback.
- [ ] Validar upload, tamanho, formato e contraste; bloquear código, CSS e scripts personalizados.

### Cobrança e pagamentos

- [ ] Separar `PlatformBilling` de `RestaurantPayments` em módulos, permissões e webhooks.
- [x] Criar tipos e persistência de métodos externos, referências e `PurchaseIntent`.
- [ ] Garantir idempotência, auditoria, tenant, filial, operador e concorrência em confirmações/estornos.
- [ ] Preservar registros operacionais Asaas existentes como legado, sem permitir novos registros.

### Dose Club

- [x] Preservar contrato 2026-07-30, HMAC, outbox, retry e idempotência.
- [ ] Resolver tenant por vínculo seguro do cliente de integração; nenhum banco será compartilhado diretamente.
- [x] Manter entitlements independentes de nomes fixos de plano.

## Definição final de pronto

O plano só está concluído quando o usuário aprovar visualmente todos os perfis,
os gates técnicos estiverem registrados, as integrações requeridas estiverem
homologadas, os bancos estiverem povoados e as credenciais de teste forem
entregues. Isso não autoriza automaticamente produção: o corte exige autorização
explícita, backup verificável e rollback preparado.

## Fora de escopo ou condicionado

- Offline completo, app nativo, TEF e editor visual livre permanecem fora deste ciclo.
- Fiscal sem homologação, iFood e WhatsApp oficial ficam condicionados à contratação
  e às credenciais/ambientes fornecidos.
- Pagamento online por QR permanece desativado até conector opcional homologado; Asaas fica restrito a assinaturas SaaS.
- Integração Dose Club preserva produtos e APIs separados; estoque compartilhado só
  é ativado por entitlement e contrato homologado.
