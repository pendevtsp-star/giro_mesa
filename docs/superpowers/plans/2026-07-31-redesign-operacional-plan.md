# GiroMesa — plano de implementação do redesign operacional

**Especificação:** `docs/superpowers/specs/2026-07-31-redesign-operacional-design.md`
**Modelo de entrega:** fases internas, uma única substituição funcional
**Estado inicial:** não implementar integrações produtivas nem publicar antes de todos os gates

## Regras de execução

1. Preservar as URLs públicas e operacionais existentes.
2. Reutilizar contratos e componentes comprovadamente funcionais antes de criar
   novas estruturas.
3. Não manter UI legada, flag de fallback ou regra duplicada após o aceite.
4. Nenhuma ação visual pode ser decorativa.
5. Backend é autoridade de tenant, permissão, estado, valores e transições.
6. Toda operação financeira ou destrutiva exige idempotência, concorrência e
   auditoria proporcionais ao risco.
7. Nenhum segredo ou senha de homologação entra no repositório.
8. Integrações opcionais não podem interromper o núcleo operacional.
9. Não fazer commit, push ou deploy sem autorização posterior e diff revisado.

## Fase 0 — baseline e matriz de cobertura

**Estado:** concluída em 2026-07-31.
**Evidência:** `docs/superpowers/baselines/2026-07-31-phase-0-baseline.md`.

### Trabalho

- Registrar branch, HEAD, worktree e comandos oficiais do monorepo.
- Inventariar rotas, perfis, permissões, APIs, migrations, tabelas, eventos,
  componentes, CSS e dependências.
- Mapear cada botão para endpoint, transição e permissão.
- Identificar ações decorativas, fallbacks demo e estados locais duplicados.
- Capturar screenshots das rotas atuais nos viewports de aceite.
- Registrar baseline de lint, typecheck, unitários, integração, E2E e build.
- Confirmar o contrato atual GiroMesa–Dose Club e migrations pendentes.

### Artefatos

- Matriz rota × perfil × permissão × endpoint.
- Matriz ação × estado anterior × estado posterior × auditoria.
- Inventário de impressão e produção.
- Lista final de migrations realmente necessárias.

### Gate

- Baseline reproduzível e todas as lacunas classificadas como frontend,
  contrato, dado, permissão ou infraestrutura.

## Fase 1 — domínio, dados e contratos

### Trabalho

- Confirmar e reutilizar pedidos, pagamentos, split, descontos, cancelamentos,
  aprovações, floor plan, reservas, fila, KDS, impressão, caixa e turno.
- Criar somente as lacunas confirmadas:
  - reserva N:N mesas;
  - horário semanal e exceções da filial;
  - política e transição “A limpar”;
  - dispositivo operacional e PIN pessoal;
  - preferências de tema e entrada KDS;
  - consulta de comanda ativa por mesa/balcão;
  - sessão operacional agregada;
  - prévia de roteamento da produção;
  - eventos versionados.
- Garantir escopo de tenant dentro das transações.
- Tornar fechamento de conta, acomodação, união/separação, confirmação de
  dinheiro e fechamento de turno atômicos.
- Adicionar constraints, versões e chaves de idempotência.
- Atualizar contratos compartilhados e documentação OpenAPI.

### Testes

- Unitários de máquina de estado e dinheiro.
- Integração PostgreSQL para transações e constraints.
- Isolamento multitenant.
- Concorrência em fechamento, pagamento, reserva e mapa.
- Repetição idempotente.

### Gate

- Migrations aplicam em banco vazio e banco de baseline; rollback documentado;
  contratos cobertos e nenhuma busca de negócio apenas por `id`.

## Fase 2 — fundação visual e shells

### Trabalho

- Consolidar tokens semânticos claro/escuro.
- Consolidar tipografia, espaçamento, foco, ícones e estados.
- Criar shell operacional em tela cheia sem alterar URLs.
- Manter shell administrativo para gestão.
- Criar cabeçalho operacional, indicador degradado e seletor de tema.
- Criar componentes compartilhados: drawer, diálogo, select, campo monetário,
  status, empty/error/loading, confirmação e PIN.
- Remover emojis do código ativo.
- Padronizar logo e branding.

### Testes

- Story/harness dos componentes essenciais.
- Contraste AA e teclado.
- Screenshots nos quatro viewports e KDS 1920×1080.
- Tema claro, escuro e automático sem flash de cor.

### Gate

- Shells navegáveis, sem overflow, sem emoji e sem regressão de identidade.

## Fase 3 — sessão operacional compartilhada e PDV

### Trabalho

- Criar cliente único da sessão operacional e invalidar cache por eventos.
- Implementar escolha Mesa/Balcão e recuperação da comanda ativa.
- Implementar busca, categorias, favoritos, grade, modificadores e observações.
- Separar rascunhos de lotes enviados.
- Implementar prévia e envio automático para produção.
- Traduzir estados por um mapa central.
- Implementar drawer de pagamento total/parcial, split e múltiplos métodos.
- Implementar dinheiro e troco, referências de Pix/cartão e histórico.
- Implementar desconto, cancelamento e aprovação por PIN.
- Implementar fechamento com pendências explícitas.
- Conectar pré-conta e comprovante à fila térmica.
- Garantir atalhos de teclado e layout touch.

### Testes

- Mesa e balcão.
- Retomada da mesma comanda por dois dispositivos.
- Modificadores, observações e múltiplos lotes.
- Rotas de Cozinha, Bar e Copa.
- Parcial, split por valor/pessoa/item e pagamento misto.
- Desconto e cancelamento com e sem aprovação.
- Concorrência, duplicação e fechamento.
- Recibo 58/80 mock.

### Gate

- Fluxo abrir → lançar → produzir → receber → fechar funciona sem ação
  decorativa e com a mesma comanda em todas as leituras.

## Fase 4 — salão, reservas e fila

### Trabalho

- Separar modos Operação e Editar mapa.
- Corrigir pan, zoom, fit-to-content, touch e persistência.
- Implementar formas, setores e indicadores compactos.
- Detectar proximidade e sugerir união com prévia.
- Reposicionar após separação e resolver distribuição de comanda.
- Implementar drawer rápido sem navegação nas ações cotidianas.
- Integrar reservas N:N, chegada, acomodação, cancelamento e no-show.
- Integrar fila com notificação, chegada, previsão, acomodação e desistência.
- Atualizar mapa simultaneamente por eventos.
- Implementar estado “A limpar” e liberação.
- Adicionar conflito otimista e aviso de dados atualizados por outro operador.

### Testes

- Mouse, touch, teclado, pan, zoom e persistência.
- União por aproximação e separação real.
- Reserva de uma e várias mesas.
- Fila completa e conflito de acomodação.
- Drawer rápido para pedido, produção, pré-conta, pagamento e fechamento.
- Limpeza manual e automática.

### Gate

- Nenhuma ação frequente sai do mapa; posições persistem; reserva e fila abrem
  atendimento real sem dupla ocupação.

## Fase 5 — garçom, perfis, PIN e dispositivos

### Trabalho

- Substituir o stepper por central móvel de mesas, chamados, prontos e pendências.
- Reutilizar sessão, catálogo, comanda, produção e pagamento do PDV.
- Implementar consumo contínuo e entrega de itens.
- Implementar pré-conta e transferência.
- Implementar recebimento configurável.
- Manter dinheiro como `pending_cash_handover` até confirmação do caixa.
- Remover dados demo e emojis.
- Implementar registro de dispositivo, troca de operador e PIN pessoal.
- Implementar bloqueio, tentativas, revogação e auditoria.
- Manter MFA opcional e configurar exigência somente por política do tenant.
- Revisar redirecionamento inicial por perfil.

### Testes

- E2E proprietário, gerente, caixa, recepção, garçom, cozinha, bar, estoque e
  financeiro.
- Permissões positivas e negativas no backend.
- Troca rápida de operador.
- PIN inválido, bloqueio, revogação e aprovação.
- Dinheiro entregue, divergente e confirmado.
- Celular 390×844 e tablet 768×1024.

### Gate

- Cada perfil entra na superfície correta e nenhuma permissão depende apenas da
  visibilidade do botão.

## Fase 6 — KDS, expedição e impressão

### Trabalho

- Criar layout por colunas/grade, vazio coerente e tela cheia.
- Renderizar itens, modificadores, observações, tempo, prioridade e alterações.
- Implementar estados por item e consolidação do ticket.
- Criar expedição multiestação.
- Integrar som, permissão, volume e alertas acessíveis.
- Implementar entrada touch, mouse, teclado, teclado numérico e bump bar.
- Criar mapeamento administrativo de teclas.
- Conectar rotas KDS/impressora e contingência.
- Conectar fila, retry, reimpressão e falhas.
- Propagar cancelamento aprovado para KDS, impressão e estoque.

### Testes

- SSE, reconexão, deduplicação e polling fallback.
- Item pronto individualmente e ticket consolidado.
- Teclado completo e bump bar simulado por eventos de tecla.
- Som permitido e bloqueado.
- Impressora mock 58/80, retry e contingência.
- KDS indisponível sem bloquear pedido.

### Gate

- Pedido aparece sem refresh, pode ser operado sem touch e falha de impressão é
  visível e recuperável.

## Fase 7 — dashboard, horário, turno e tema

### Trabalho

- Criar dashboard estratégico do proprietário.
- Criar dashboard operacional do gerente.
- Criar páginas iniciais específicas para caixa e recepção.
- Direcionar garçom e produção às superfícies operacionais.
- Remover banner permanente de conectividade e cards sem ação.
- Implementar gráficos sóbrios e alternativa tabular.
- Implementar horário semanal, intervalos, madrugada e exceções.
- Implementar checklist de abertura e fechamento.
- Integrar caixa, dinheiro pendente, produção e aprovações ao turno.
- Implementar tema por usuário/dispositivo e padrão da filial.

### Testes

- Indicadores conferidos contra pedidos, caixa e estoque.
- Período vazio, pouco dado e erro real.
- Virada de madrugada, feriado e abertura excepcional.
- Fechamento bloqueado e fechamento excepcional auditado.
- Claro, escuro e automático.

### Gate

- Proprietário identifica saúde do negócio; gerente identifica prioridades do
  turno; totais reconciliam com a fonte de verdade.

## Fase 8 — limpeza e seed de homologação

### Trabalho

- Remover componentes, CSS, links e fallbacks antigos.
- Verificar que nenhuma ação de UI retorna `undefined` ou apenas muda mensagem.
- Recriar bancos local e homologação com backup prévio aplicável.
- Criar seed determinístico com tenant e filial de homologação.
- Criar dados coerentes de catálogo, estoque, clientes, mesas, reservas, fila,
  pedidos, pagamentos, KDS, impressão e turnos.
- Criar uma conta individual por perfil.
- Receber senha por `SEED_TEST_PASSWORD` ou mecanismo equivalente seguro.
- Criar comando documentado de reset e reseed.

### Testes

- Seed duas vezes sem duplicar.
- Login de todos os perfis.
- Dados visíveis e permissões coerentes.
- Nenhum dado pessoal real.
- Nenhuma credencial no Git.

### Gate

- Um único cenário limpo e reproduzível; credenciais prontas para handoff visual.

## Fase 9 — integrações externas

Executar somente após todos os gates internos.

### 9.1 E-mail

- Provider, domínio, templates, fila, retry e rastreio.
- Recuperação, convite, confirmação e alerta.
- Teste de bounce, indisponibilidade e duplicação.

### 9.2 Google OAuth

- Client web, origens e callback HTTPS.
- `state`, vínculo, conta existente, revogação e erro.
- Confirmar encaminhamento público `/api/v1` sem duplicação de `/api`.

### 9.3 Asaas

- Sandbox, cliente, assinatura, cobrança e `externalReference`.
- Webhook com `authToken`, idempotência, outbox e reconciliação.
- Trial, inadimplência, tolerância, cancelamento, upgrade e downgrade.
- Entitlements GiroMesa, Dose Club e combo.
- Produção somente após cenário completo no sandbox e credencial produtiva fora
  do repositório.

### 9.4 Dose Club

- Homologar contrato 2026-07-30 com IDs reais de teste.
- Mapear produtos e filial.
- Testar consumo, combo, concorrência, timeout, retry, 409 e estorno.
- Validar webhooks e `integration.shared_inventory`.

### 9.5 WhatsApp Web não oficial

- Criar adapter/worker isolado e outbox.
- Homologar candidato Baileys com versão pinada.
- Gerar QR e armazenar sessão criptografada por tenant/filial.
- Implementar status, reconexão, revogação, cooldown, rate limit e opt-out.
- Implementar reserva, fila, pedido, delivery, pré-conta e comprovante.
- Exibir aviso não oficial na interface e documentação.
- Proibir marketing em massa e sucesso falso.
- Testar entrega incerta sem retry cego.
- A desconexão nunca bloqueia o núcleo.

### 9.6 Hardware, fiscal, delivery e infraestrutura

- Homologar impressoras físicas 58/80, rede e USB.
- Homologar fiscal com contador, certificado e contingência quando contratado.
- Homologar iFood quando contratado.
- Configurar Cloudflare, HTTPS, observabilidade, backup externo e restauração.

### Gate

- Cada integração possui sandbox, segredo externo, health, idempotência,
  reconciliação, alertas, indisponibilidade testada e desligamento por filial.

## Fase 10 — aceite integral

### Suítes obrigatórias

- lint;
- typecheck;
- unitários;
- integração PostgreSQL;
- migrations em banco vazio;
- build;
- E2E autenticado por perfil;
- isolamento multitenant;
- concorrência e idempotência;
- realtime e polling fallback;
- impressão simulada e hardware aplicável;
- regressão visual;
- acessibilidade;
- `git diff --check`.

### Jornadas E2E

1. abrir turno e caixa;
2. acomodar reserva ou fila;
3. abrir mesa e lançar por garçom;
4. enviar itens a múltiplas estações;
5. concluir KDS por item e expedição;
6. adicionar novo consumo no PDV;
7. cancelar com aprovação e compensação;
8. dividir e pagar com múltiplos métodos;
9. entregar dinheiro do garçom;
10. fechar conta, limpar e liberar mesa;
11. imprimir comprovante;
12. fechar caixa e turno;
13. validar dashboard e relatórios;
14. repetir a jornada por QR público;
15. testar integrações e suas indisponibilidades.

### QA visual

- 1440×900;
- 1024×768;
- 768×1024;
- 390×844;
- KDS 1920×1080;
- claro e escuro;
- mouse, teclado, touch e bump bar.

### Gate

- Nenhuma falha bloqueante, nenhuma ação decorativa, nenhuma credencial exposta,
  nenhuma divergência financeira e nenhum acesso cruzado entre tenants.

## Fase 11 — handoff e corte único

### Entrega ao usuário

- URL de homologação.
- Um login e senha por perfil.
- Matriz curta de permissões.
- Cenários de teste sugeridos.
- Lista de integrações e estados.
- Aviso explícito do WhatsApp não oficial.
- Resultado de testes, riscos e itens opcionais desativados.

### Corte

- Criar backup e validar restauração.
- Registrar versões de app, migrations, imagens e configuração.
- Remover frontend operacional antigo.
- Publicar uma única versão após autorização explícita.
- Executar migrations, smoke, jornadas críticas e monitoramento.
- Manter rollback conjunto de aplicação e banco.

## Rollback

- Antes de qualquer reset ou migration, gerar backup verificável.
- Migrations destrutivas exigem restauração, não falsa migration reversa.
- O rollback do corte retorna aplicação, schema e configuração à mesma versão.
- Mensagens e webhooks processados não são “desprocessados”; compensações são
  registradas explicitamente.
- Sessões WhatsApp e segredos podem ser revogados independentemente.

## Definição de pronto

O plano está concluído somente quando o usuário aprovar visualmente todos os
perfis, os gates técnicos estiverem registrados, as integrações requeridas
estiverem homologadas, os bancos estiverem povoados e as credenciais de teste
forem entregues. Isso não autoriza automaticamente commit, push ou produção.
