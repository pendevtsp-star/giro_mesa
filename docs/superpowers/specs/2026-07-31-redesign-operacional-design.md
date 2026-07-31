# GiroMesa — redesign operacional e preparação para produção

**Status:** aprovado para planejamento em 31/07/2026
**Escopo:** frontend operacional, fluxos internos, dados de homologação e integrações anteriores à produção
**Estratégia de entrega:** desenvolvimento por fases internas e um único corte funcional

## 1. Contexto

O GiroMesa possui uma base funcional relevante no backend, mas PDV, salão,
garçom, KDS, impressão, dashboard e turnos ainda não formam uma operação única e
confiável. Há ações sem efeito, estados técnicos expostos, fluxos duplicados e
recursos existentes no backend que não são conduzidos pela interface.

Como ainda não existem clientes reais nem operação produtiva, o frontend
operacional será substituído de uma vez após a homologação integral. Não haverá
convivência permanente entre telas antigas e novas.

## 2. Objetivos

- Fazer do PDV o centro das vendas de estabelecimentos de alto giro.
- Compartilhar a mesma comanda entre salão, PDV, garçom e QR.
- Manter produção, pagamentos, estoque, caixa e auditoria como fontes únicas no
  backend.
- Criar superfícies especializadas por perfil sem duplicar regras de negócio.
- Operar com mouse, teclado, touch, teclado numérico, bump bar e impressoras
  térmicas.
- Preservar a identidade navy, amarelo e azul, com maior hierarquia e densidade
  operacional.
- Entregar um banco de homologação pequeno, coerente e recriável.
- Homologar integrações externas antes da publicação produtiva.

## 3. Fora do escopo

- Aplicativo móvel nativo.
- Operação completamente offline.
- Editor visual livre para dashboards ou materiais QR.
- Automação de marketing em massa pelo WhatsApp.
- Integrações proprietárias de bump bar antes de comprovar que o modo teclado
  USB é insuficiente.
- Uso da API oficial Meta WhatsApp Business nesta versão.

## 4. Decisões estruturais

### 4.1 Dois shells

O shell administrativo mantém navegação lateral para dashboard, relatórios,
catálogo, estoque, equipe, configurações, QR e integrações.

O shell operacional usa toda a tela e atende `/app/pos`, `/app/salon`,
`/app/waiter` e `/app/kds`. Ele possui barra superior compacta com unidade,
turno, operador, caixa, tema e conectividade.

### 4.2 Núcleo operacional único

```text
Salão ───────┐
PDV ─────────┼── Comanda central ── Produção ── KDS/impressoras
Garçom ──────┤          │
QR ──────────┘          ├── Pagamentos e caixa
                        ├── Estoque
                        └── Auditoria
```

O frontend nunca presume sucesso. Estados de pedido, pagamento, fechamento,
produção e mesa são confirmados pelo backend.

### 4.3 Um único corte

A implementação será dividida internamente para permitir validação, mas as
novas superfícies entrarão juntas. Não haverá flags permanentes, duas UIs em
produção ou fallback para a interface antiga após o aceite final.

## 5. PDV

### 5.1 Entrada

Ao abrir o PDV sem `tableId`, o operador escolhe explicitamente entre mesa e
balcão. O último modo pode ser destacado como atalho, mas nunca selecionado
silenciosamente. Ao vir do salão, a comanda ativa da mesa é recuperada.

### 5.2 Composição

- Cabeçalho com atendimento, pessoas, responsável, tempo, turno e status
  traduzido.
- Busca com foco rápido, categorias, favoritos e produtos mais vendidos.
- Grade com disponibilidade, quantidade, modificadores e observações.
- Comanda com itens agrupados por envio, responsável, horário, destino e estado.
- Separação visual entre itens em rascunho e itens já enviados.
- Atalhos de teclado no desktop e controles touch no tablet.

### 5.3 Produção

O comando será “Enviar para produção”. O backend resolve as rotas por produto,
categoria, estação e configuração da filial. A interface mostra a prévia dos
destinos, como Cozinha, Bar e Copa, sem exigir seleção manual por item.

Novos itens formam um novo lote e não reenviam itens anteriores.

### 5.4 Pagamentos

O drawer de recebimento suporta:

- pagamento total ou parcial;
- divisão por valor, pessoa ou item;
- múltiplos métodos na mesma conta;
- dinheiro com valor recebido e troco;
- Pix manual, crédito, débito, voucher e métodos configuráveis;
- histórico de parcelas e saldo restante;
- confirmação separada de dinheiro recebido por garçom.

O fechamento somente ocorre com saldo zero, conciliação válida e ausência de
pendências bloqueantes. A operação é transacional, idempotente e auditada.

### 5.5 Comprovantes

Documentos operacionais passam pela fila de impressão. Há formatos 58 mm e
80 mm, prévia, retry, contingência e reimpressão auditada. A4 fica reservado a
documentos administrativos.

## 6. Salão, reservas e fila

### 6.1 Modos distintos

No modo Operação, mesas não se movem e um clique abre o drawer rápido. No modo
Editar mapa, o usuário cria, move, redimensiona, une, separa, desfaz e salva uma
nova versão.

### 6.2 Mapa

- Tela cheia, pan, zoom, gesto de pinça e ajuste ao conteúdo.
- Formas circular, quadrada e retangular.
- Código, capacidade, estado, responsável, duração, reserva e chamados.
- Aproximação entre mesas sugere união e exige confirmação.
- Separação remove o grupo e reposiciona as mesas visivelmente.
- Setores, ocupação, bloqueio e histórico.
- Controle otimista de versão para evitar sobrescrita concorrente.

### 6.3 Drawer da mesa

O drawer permite abrir ou retomar atendimento, adicionar item, enviar para
produção, ver comanda, transferir, unir, separar, trocar responsável, gerar
pré-conta, receber e fechar. Apenas “Abrir PDV completo” muda de página.

### 6.4 Reservas

Uma reserva pode apontar para uma ou mais mesas e possui cliente, contato,
horário, duração, pessoas, setor, tolerância e observações. Estados: pendente,
confirmada, chegada, acomodada, concluída, não compareceu e cancelada.

O sistema sugere mesas por capacidade, setor, conflitos, necessidade de união e
previsão de liberação.

### 6.5 Fila

A fila exibe posição, pessoas, tempo aguardado, previsão, preferência, mesas
compatíveis e último contato. Estados: aguardando, notificado, chegada,
acomodado, desistiu e cancelado.

### 6.6 Limpeza

Após o fechamento, a mesa entra em “A limpar”. Cada filial escolhe liberação
manual ou automática.

## 7. Garçom

O garçom recebe uma interface móvel centrada em mesas atribuídas, chamados,
pedidos prontos, contas solicitadas e pendências.

Fluxo principal:

1. selecionar mesa e recuperar a comanda ativa;
2. adicionar produtos, modificadores e observações;
3. revisar somente os itens novos;
4. enviar para produção;
5. acompanhar e entregar itens;
6. emitir pré-conta;
7. registrar pagamento quando autorizado;
8. encerrar ou solicitar encerramento conforme permissão.

O recebimento pelo garçom é configurável por filial e perfil. Dinheiro permanece
`pending_cash_handover` até conferência física pelo caixa. Não há sucesso falso
offline; rascunhos aguardam confirmação do servidor com a mesma chave de
idempotência.

## 8. KDS e expedição

### 8.1 Estações

O administrador configura estações, categorias, produtos, SLA, KDS, impressora,
som, horário e contingência. Cada estação recebe apenas os itens que lhe cabem.

### 8.2 Tickets

Tickets mostram mesa ou canal, pedido, origem, tempo, itens, modificadores,
observações, prioridade, alterações e cancelamentos. Estados: novo, aceito, em
preparo, pronto, entregue e cancelado.

Itens podem ser concluídos individualmente. O ticket da estação fica pronto
quando todos os seus itens terminam. A expedição consolida o andamento de todas
as estações.

### 8.3 Métodos de entrada

- touch;
- mouse e teclado;
- teclado numérico;
- bump bar como teclado USB configurável;
- somente impressora;
- impressora com expedição;
- modo híbrido.

Impressora sem terminal não produz estado “pronto” automaticamente. Outro
dispositivo precisa confirmar o andamento.

## 9. Dashboard, horário e turno

### 9.1 Proprietário

Visão estratégica com receita líquida, comparação, ticket médio, margem, caixa,
divergências, vendas por hora, pagamentos, giro, CMV, cancelamentos e estoque.

### 9.2 Gerente

Visão do turno com ocupação, pedidos, reservas, fila, atrasos, chamados,
pagamentos pendentes, dinheiro com garçons, dispositivos e aprovações.

Usuários com ambas as permissões alternam entre as duas visões. Caixa, recepção,
garçom e produção recebem páginas iniciais específicas.

O banner permanente de operação conectada é removido. Conectividade ganha
destaque apenas quando degradada.

### 9.3 Horários e turnos

Horário planejado por filial suporta múltiplos intervalos, operação após
meia-noite, feriados e exceções. Turno real é separado da agenda e do caixa.

Abertura verifica responsável, caixas, fundo, estações, impressoras, setores,
equipe e pendências. Fechamento verifica comandas, pagamentos, dinheiro com
garçons, caixas, produção, divergências e aprovações.

## 10. Tema e identidade

- Navy como superfície principal.
- Amarelo para ação primária e atenção.
- Azul para seleção e informação.
- Cores de estado restritas e acessíveis.
- Logo consistente.
- Nenhum emoji; somente ícones da biblioteca adotada.
- Preferência Claro, Escuro ou Automático por usuário/dispositivo.
- Padrão configurável por filial e tema próprio por estação KDS.

## 11. Perfis, PIN e MFA

Perfis base: proprietário, administrador, gerente, caixa, recepção, garçom,
cozinha, bar, estoque e financeiro. As permissões são capacidades backend e
podem variar por filial, setor, estação e caixa.

Terminais compartilhados usam contas individuais e PIN pessoal. Não há contas
genéricas nem PIN de cargo. Aprovações registram solicitante e aprovador.

MFA é opcional por padrão. Cada usuário pode ativá-lo e o proprietário pode
definir política apenas para perfis sensíveis, sem imposição global do produto.

## 12. Dados e contratos

Antes de criar migrations, a implementação deve comprovar o que já existe.
Lacunas esperadas:

- associação N:N entre reserva e mesas;
- horários e exceções por filial;
- política de limpeza;
- registro de dispositivo e PIN individual;
- preferência de tema e entrada do KDS;
- consulta inequívoca da comanda ativa;
- prévia de roteamento de produção;
- sessão operacional agregada;
- eventos versionados em tempo real.

Operações financeiras e de fechamento usam transação, idempotência, controle de
concorrência, isolamento por tenant e auditoria append-only.

## 13. Banco de homologação

Os bancos local e de homologação podem ser recriados. O seed final será pequeno,
determinístico e idempotente, com um tenant, uma filial, setores, 12 a 16 mesas,
25 a 35 produtos, modificadores, estoque, clientes fictícios, reservas, fila,
chamados, comandas, pagamentos, tickets KDS, impressoras mock e turnos.

Serão entregues credenciais individuais para proprietário, administrador,
gerente, caixa, recepção, garçom, cozinha, bar, estoque e financeiro. Senhas não
serão commitadas; o seed recebe a senha de teste por variável segura e o handoff
ocorre ao final da homologação.

## 14. Integrações anteriores à produção

### 14.1 E-mail e Google OAuth

Recuperação, convites e alertas usam provider transacional real. Google OAuth
usa fluxo web, HTTPS, `state`, callback validado, vínculo seguro e revogação.

Referência: <https://developers.google.com/identity/protocols/oauth2/web-server>

### 14.2 Asaas

Asaas atende assinatura do SaaS, não o caixa do restaurante nesta etapa. O fluxo
inclui cliente, assinatura, cobrança, webhook, entitlements, trial,
inadimplência, upgrade, downgrade e combo com Dose Club.

Referências:

- <https://docs.asaas.com/docs/authentication>
- <https://docs.asaas.com/reference/criar-nova-assinatura>
- <https://docs.asaas.com/reference/criar-novo-webhook>

### 14.3 Dose Club

Os produtos permanecem independentes. A homologação cobre tenant, filial,
mapeamento, estoque em mililitros, combos, retry, estorno, concorrência,
webhooks e `integration.shared_inventory`.

### 14.4 WhatsApp Web por QR

A integração é opcional por filial e isolada por outbox/worker. Não usa Meta
Cloud API. Um candidato é o Baileys, sujeito a homologação e pinagem de versão.

A documentação e a interface devem exibir:

> Integração não oficial baseada no WhatsApp Web. Não utiliza nem representa a
> API oficial Meta WhatsApp Business. Mudanças no WhatsApp podem exigir
> reconexão ou interromper o serviço, e o uso inadequado pode restringir a conta.

Não há marketing em massa. Usos iniciais: reserva, fila, pedido, delivery,
pré-conta, comprovante e notificações solicitadas. São obrigatórios consentimento,
opt-out, rate limit, sessão criptografada, idempotência e revogação.

Referência: <https://github.com/WhiskeySockets/Baileys>

### 14.5 Demais integrações

- conector físico de impressão;
- fiscal em homologação e contingência;
- iFood quando contratado;
- Cloudflare, observabilidade, backup externo e restauração.

Integrações opcionais nunca bloqueiam PDV, salão, pagamentos ou produção.

## 15. Requisitos não funcionais

- Disponibilidade alvo interna: 99,5%.
- P95 de leitura até 500 ms, mutação até 1 s e propagação de evento até 2 s no
  ambiente de referência.
- Até 250 operadores e 250 sessões QR simultâneas no alvo inicial.
- Viewports de aceite: 1440×900, 1024×768, 768×1024 e 390×844, além de KDS em
  1920×1080.
- Contraste AA, teclado, foco, labels, touch e alternativa textual para gráficos.
- RPO de 15 minutos e RTO de 2 horas após a preparação produtiva.
- Nenhum dado demo ou fallback silencioso em tenant real.

## 16. Critério final de produção

Produção só pode ocorrer após operação interna, seed, perfis, integrações,
hardware aplicável, E2E, QA visual, isolamento multitenant, backup/restauração e
rollback serem aprovados. O corte substitui integralmente o frontend operacional
antigo.

## 17. Decision Log

| ID | Decisão |
|---|---|
| D01 | Dois shells: administrativo e operacional em tela cheia |
| D02 | Reestruturação ampla do frontend com núcleo backend único |
| D03 | Um único corte funcional antes da produção |
| D04 | PDV exige escolha explícita Mesa ou Balcão |
| D05 | Produção resolve destinos automaticamente |
| D06 | Pagamento suporta parcial, divisão e múltiplos métodos |
| D07 | Mesa fechada entra em “A limpar”, configurável por filial |
| D08 | Reserva pode ocupar uma ou mais mesas |
| D09 | Recebimento pelo garçom é configurável; dinheiro exige conferência |
| D10 | KDS conclui itens individualmente e consolida o ticket |
| D11 | Bump bar usa inicialmente o padrão de teclado USB |
| D12 | Dashboards separados para proprietário e gerente |
| D13 | Contas individuais e PIN pessoal em terminais compartilhados |
| D14 | MFA opcional por padrão |
| D15 | Bancos local e homologação podem ser recriados |
| D16 | Um login individual por perfil será entregue ao final |
| D17 | WhatsApp é não oficial, via QR, opcional e não bloqueia o núcleo |
