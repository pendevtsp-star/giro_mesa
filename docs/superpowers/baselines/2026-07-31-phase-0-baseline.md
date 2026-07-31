# GiroMesa — baseline da Fase 0

Data: 2026-07-31
Branch: `main`
HEAD inicial: `c4f59305a3cc2cba37480cb0a96376ba1238dbda`
Remoto: `https://github.com/pendevtsp-star/giro_mesa.git`

## 1. Ambiente reproduzido

- Node.js `24.18.0`.
- pnpm `11.7.0`.
- Docker `29.6.1`.
- Monorepo Turborepo com oito pacotes: API, web, worker, conector local, config,
  banco, domínio e UI.
- Comandos oficiais: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm test:integration`, `pnpm test:e2e`, `pnpm build`,
  `pnpm db:check-safety`.
- E2E usa exclusivamente o banco `giromesa_e2e`, API `3334` e web `3106`.

## 2. Resultado dos gates iniciais

| Gate | Resultado | Evidência |
| --- | --- | --- |
| Typecheck sem cache | aprovado | 8/8 pacotes |
| Unitários sem cache | aprovado | 189 testes; 30 DB-gated ignorados no comando unitário |
| Integração PostgreSQL | aprovado | 6 arquivos; migrations em banco vazio |
| Migration safety | aprovado | `Migration safety gate passed` |
| Build sem cache | aprovado | 8/8 pacotes; Next gerou 39 rotas |
| E2E isolado | aprovado | 67 testes em 12 arquivos |
| Auditoria visual | aprovado | 136 screenshots; desktop, tablet e mobile |
| Lint Biome local | bloqueado pelo SO | Windows App Control bloqueou `biome.exe`; nenhum diagnóstico de código foi produzido |

O lint precisa ser confirmado no runner Linux do GitHub Actions. O bloqueio local é
ambiental: `Uma política de Controle de Aplicativo bloqueou este arquivo`.

Screenshots locais estão em `test-results/visual-audit` e permanecem ignorados pelo
Git. Contagem: 35 desktop, 35 mobile, 33 tablet horizontal e 33 tablet vertical.

## 3. Inventário

### 3.1 Rotas web

Públicas e autenticação:

- `/`, `/login`, `/teste-gratis`, `/invite/[token]`, `/reset/[token]`;
- `/m/[tenantSlug]`, `/q/[tableCode]`, `/manual`, `/suporte`, `/status`, `/offline`.

Operação e gestão:

- `/app`, `/app/pos`, `/app/salon`, `/app/waiter`, `/app/kds`;
- `/app/cash`, `/app/customers`, `/app/catalog`, `/app/catalog/advanced`;
- `/app/inventory`, `/app/inventory/purchases`, `/app/inventory/suppliers`;
- `/app/delivery`, `/app/reports`, `/app/qr`, `/app/printing`, `/app/fiscal`;
- `/app/team`, `/app/security`, `/app/audit`, `/app/outbox`, `/app/billing`;
- `/app/onboarding`, `/app/settings/branding`, `/app/settings/operation`;
- `/app/integrations/dose-club`.

Plataforma:

- `/platform`, `/platform/support`, `/platform/[tenantId]`.

### 3.2 API e banco

- 23 controllers e 219 combinações de método/rota.
- 55 tabelas de negócio e infraestrutura.
- 19 migrations, `0000` a `0018`.
- 26 folhas CSS especializadas; todas estão carregadas ou referenciadas.
- 178 botões e 136 links no código React ativo.

Grupos de tabelas:

- identidade: `tenants`, `branches`, `users`, `roles`, `user_roles`, sessões,
  OAuth, MFA, convites e reset;
- comercial: planos, assinaturas, clientes, categorias, produtos e modificadores;
- operação: plantas, mesas, pedidos, itens, comandas, pagamentos, políticas,
  aprovações, reservas, fila, eventos de mesa e chamados;
- caixa e produção: turnos, sessões, movimentos, estações e tickets KDS;
- estoque: insumos, fornecedores, locais, fichas técnicas e movimentos;
- saídas: impressoras, rotas, jobs, delivery e fiscal;
- integrações: contas, webhooks, outbox, idempotência pública e auditoria.

### 3.3 Eventos versionados atuais

- `product.updated`;
- `stock.updated`;
- `order.closed`;
- `payment.confirmed`;
- `customer.updated`;
- `club.sale.registered`;
- `club.stock_movement.created`;
- snapshots SSE `pos.changed` e realtime operacional.

## 4. Matriz de rota, perfil, permissão e contrato

Permissões abaixo são as exigidas pela navegação atual. Backend continua sendo
a autoridade; esconder item na UI não concede acesso.

| Superfície | Perfis atuais | Permissão de entrada | Contratos principais | Classificação |
| --- | --- | --- | --- | --- |
| Dashboard | todos autenticados | sessão | resumo PDV, turno, caixa, KDS, estoque, onboarding | frontend |
| PDV | proprietário, gerente, caixa, garçom | `pos:operate` | mesas, pedidos, itens, clientes, pagamentos, fechamento, impressão | frontend + contrato |
| Salão | proprietário, gerente, caixa, garçom | `pos:operate` | mesas, floor plan, reservas, fila, união, chamados | frontend + dado |
| Garçom | proprietário, gerente, caixa, garçom | `pos:operate` | mesas, catálogo, pedido, item, pagamento | frontend |
| KDS | proprietário, gerente, cozinha, bar | `kds:operate` | estações, tickets, SSE | frontend + contrato |
| Clientes | operação | `pos:operate` | CRUD e histórico | funcional |
| Estoque | proprietário, gerente | `inventory:manage` | resumo, alertas, itens, ajustes, receitas, compras | funcional incompleto |
| Caixa | proprietário, gerente, caixa, financeiro | `cash:manage` | turno, caixa, suprimento, sangria, fechamento, handover | funcional |
| Relatórios | proprietário, gerente, caixa, financeiro | `reports:read` | financeiro, produtos, períodos, caixa | frontend |
| Delivery | proprietário | `delivery:manage` | pedido, status e cancelamento | funcional incompleto |
| Catálogo | proprietário, gerente | `catalog:manage` | categorias, produtos, modificadores, ficha técnica | funcional incompleto |
| QR | proprietário | `tenant:manage` | configuração, mesas, rotação, material | funcional |
| Impressão | proprietário, gerente | `hardware:manage` ou `printing:manage` | dispositivos, rotas, jobs, conector | funcional incompleto |
| Onboarding | proprietário | `tenant:manage` | etapas e readiness | funcional, link demo fixo |
| Equipe/segurança | proprietário | `tenant:manage` | cargos, convites, MFA, OAuth, senha | funcional incompleto |
| Fiscal | proprietário, gerente | `fiscal:manage` | configuração, emissão, retry, cancelamento | provider pendente |
| Dose Club | proprietário | `tenant:manage` | configuração, catálogo, estoque, consumo, estorno | homologar externamente |
| Plataforma | operador SaaS | `platform:manage` | tenants, suporte, billing, backup | fallback demo presente |

### 4.1 Perfis atuais

| Perfil | Capacidades atuais |
| --- | --- |
| `owner` | todas as permissões do tenant |
| `manager` | operação, catálogo, KDS, caixa, estoque, relatórios, hardware e aprovações |
| `cashier` | PDV, revisão QR, pagamentos, fechamento, caixa, fiscal leitura, impressão e relatórios |
| `waiter` | PDV, revisão QR e envio para produção |
| `kitchen` | KDS e impressão |
| `bar` | KDS e impressão |
| `finance` | caixa, fiscal leitura e relatórios |

Lacunas de perfil confirmadas: administrador separado, recepção e estoque. Hoje
essas responsabilidades dependem de proprietário/gerente ou cargo customizado.

## 5. Matriz de ação e estado

| Ação | Estado anterior | Estado posterior/efeito | Permissão | Auditoria/outbox | Lacuna |
| --- | --- | --- | --- | --- | --- |
| Abrir comanda | inexistente | `opened` | `pos:operate` | pedido criado | PDV escolhe primeira mesa implicitamente |
| Adicionar item | pedido aberto | item `pending`, total/version atualizados | `pos:operate` | pedido atualizado | PDV e garçom duplicam estado local |
| Enviar produção | `opened` + itens `pending` | pedido `sent_to_kitchen`, itens `sent`, tickets | `pos:kds_send` | KDS/impressão | sem prévia de roteamento; rótulo fixo cozinha |
| Produzir | ticket/item enviado | `preparing` e `ready` | `kds:operate` | transição KDS | payload e layout pobres; sem expedição |
| Registrar pagamento | saldo aberto | `partially_paid` ou `paid` | `pos:payment_manage` | `payment.confirmed` | UI PDV não expõe split/múltiplos métodos |
| Entregar dinheiro | `pending` | `received` | `cash:manage` | `cash_handover.received` | garçom não mostra fluxo completo |
| Fechar conta | `paid`, sem `closed_at` | `closed_at` preenchido; mesa `free` | `pos:close_order` | `order.closed` + estoque + fiscal | falta estado `cleaning`; fechamento libera mesa direto |
| Desconto | pedido aberto | aplicado ou aprovação pendente | `pos:operate` | pedido/aprovação | controles não expostos no PDV atual |
| Cancelar após cozinha | item enviado | aprovação; cancela só após PIN | `pos:operate`/`approvals:manage` | append-only + evento | falta jornada visual unificada |
| Salvar mapa | revisão N | revisão N+1 | `pos:operate` | floor plan | conflito existe; UX precisa separar editar/operar |
| Unir mesas | mesas separadas | grupo persistido | `pos:operate` | evento de mesa | sem sugestão por proximidade |
| Separar mesas | grupo | grupo removido | `pos:operate` | evento de mesa | layout não é redistribuído/recarregado de forma confiável |
| Criar reserva | inexistente | `booked` | `pos:operate` | `floor.reservation_created` | apenas uma mesa por reserva |
| Atualizar reserva | `booked` | `arrived`, `no_show` ou `canceled` | `pos:operate` | `floor.reservation_updated` | UI não oferece todos os estados |
| Acomodar reserva | `arrived` | `seated`, mesa ocupada, pedido aberto | `pos:operate` | transação/auditoria | seleção de mesa desconectada do card |
| Fila | `waiting` | `notified`, `seated`, `left` ou `canceled` | `pos:operate` | `floor.waitlist_updated` | UI filtra apenas aguardando |
| Gerar/rotacionar QR | ativo | versão nova, anterior inválida | `tenant:manage` | auditoria | funcional; formatos ainda usam popup do navegador |
| Imprimir operacional | job inexistente/falho | `pending`/`printing`/`printed` | `print:operate` | job idempotente | PDV ainda usa popup A4 em vez da fila térmica |

## 6. Fallbacks, ações decorativas e duplicidade

### Bloqueantes

1. `request-context.ts` ainda possui tenant/usuário demo como fallback fora do
   fluxo autenticado; deve permanecer estritamente limitado a teste/demo.
2. Garçom inicia com mesas e produtos demo e pode voltar a `status="demo"`.
3. Relatórios substituem erro por resumo financeiro demo.
4. Menu/QR público usam objetos Bar Aurora em falha de rede.
5. Plataforma possui tenant e suporte demo mutáveis localmente.
6. PDV seleciona internamente primeira mesa quando `tableId` não foi informado.
7. Salão trata `send-kitchen` e `preview-bill` apenas com mensagem; não chama API.
8. Comprovante PDV usa `window.open`/impressão de navegador, ignorando fila 58/80.

### Importantes

1. Link do cardápio no shell e link QR do onboarding apontam para Bar Aurora/M03.
2. PDV, garçom e QR mantêm clientes de pedido diferentes.
3. Estado `paid` acumula pagamento e fechamento; `closed_at` é o diferenciador.
4. Mesa não possui estado `cleaning`/`A limpar`.
5. Reserva relaciona uma mesa, não N:N.
6. KDS não expõe fluxo por item/expedição suficiente para operação real.
7. Tema sem seletor rápido persistido por operador/dispositivo.
8. Horário comercial da filial não possui modelo semanal + exceções.

### Confirmado como correto

- Nenhuma folha CSS especializada está órfã.
- Busca por emojis proibidos no código web ativo não encontrou ocorrências.
- Rotas canônicas `/app/pos`, `/app/salon`, `/app/waiter` e `/app/kds` existem.
- Pagamento e fechamento possuem idempotência/concorrência no backend.
- Tenant é aplicado nas consultas e integrações sensíveis inspecionadas.

## 7. Produção e impressão atuais

Produção:

- estações e tickets KDS existem;
- envio cria tickets e pode acionar impressão;
- SSE e polling fallback existem;
- falta prévia de roteamento e consolidação de expedição.

Impressão:

- dispositivos `network`, `usb`, `os` e `mock`;
- papéis 58/80, rotas por função/estação/categoria;
- jobs, retry, reprint, heartbeat e conector local existem;
- PDV e alguns documentos ainda contornam essa base usando browser print.

## 8. Dose Club e migrations

- Contrato GiroMesa–Dose Club confirmado em `2026-07-30`.
- Autenticação de entrada usa exclusivamente `x-giromesa-integration-key`.
- Estoque físico pertence ao GiroMesa; ofertas, combos, memberships e saldo comercial
  pertencem ao Dose Club.
- Compra não baixa estoque; consumo/estorno usam `doseMl` e idempotência.
- Sete eventos de outbox estão definidos.
- Migrations `0000–0018` aplicam em banco vazio.
- Lacunas da Fase 1: reserva N:N, horários/exceções, limpeza, dispositivo/PIN,
  preferências, comanda ativa inequívoca e prévia de roteamento.

## 9. Gate e ordem da Fase 1

Baseline reproduzível. Lacunas classificadas como frontend, contrato, dado,
permissão ou infraestrutura. Fase 1 deve começar por:

1. consulta única de comanda ativa e sessão operacional;
2. reserva N:N, estado `cleaning` e horário da filial;
3. dispositivo/PIN pessoal e preferências;
4. prévia de roteamento e eventos versionados;
5. atomicidade/constraints das novas transições;
6. testes PostgreSQL, isolamento, concorrência e idempotência.

Nenhuma mudança funcional, migration, banco permanente, segredo ou integração
externa foi feita nesta fase.
