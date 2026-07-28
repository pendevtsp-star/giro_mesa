# GiroMesa: estabilizacao mestra e conclusao operacional

## Baseline preservado

- Worktree canonico: `C:\Users\maxue\projetos_programação\giro_mesa`.
- Branch: `main`, um commit a frente de `origin/main`.
- Inicio desta implementacao: 74 entradas modificadas e 100 nao rastreadas.
- Nenhuma alteracao anterior deve ser descartada, restaurada ou publicada por implicacao.
- Implementacao ocorre por tranches com gates independentes; integracoes externas so recebem
  aceite real depois de credenciais, sandbox e homologacao.

## Entendimento fechado

- Dois shells: administrativo e operacional.
- Um unico nucleo de pedido, pagamento, producao, estoque e auditoria.
- Dados demo somente quando `tenant.isDemo` for verdadeiro.
- QR permanente, assinado, revogavel, configuravel por filial e dependente de atendimento ativo
  para pedido, comanda e pre-conta.
- Modelos controlados para material QR; sem editor visual livre.
- Integracoes externas ficam depois da operacao interna.

## Tranches e gates

1. Correcao: transacoes reais, concorrencia, idempotencia, permissoes, demo explicito e migrations
   forward-only.
2. Fundacao visual: tokens, CSS em camadas, shells, rotas canonicas e estados compartilhados.
3. Operacao interna: salao, PDV/garcom, aprovacao, caixa, KDS e impressao por fila.
4. QR: token, politicas, gestao, material, comanda publica e chamados.
5. Gestao: catalogo, estoque, relatorios, delivery, equipe, onboarding e telas especializadas.
6. Integracoes: SMTP/OAuth, Asaas, hardware, fiscal, WhatsApp, iFood e infraestrutura externa.

Nenhuma rota nova entra na navegacao antes de fluxo feliz, erro, permissao e recuperacao passarem.

## Contratos nao funcionais

- Disponibilidade inicial: 99,5% mensal.
- RPO: 15 minutos. RTO: 2 horas.
- Carga de referencia: 250 operadores e 250 sessoes QR simultaneas.
- P95: leitura ate 500 ms, mutacao ate 1 s, evento ate tela ate 2 s; erro abaixo de 1%.
- SSE: evento monotonicamente identificavel, `Last-Event-ID`, replay de 10 minutos ou 1.000
  eventos, heartbeat em ate 20 segundos e polling deduplicado a cada 15 segundos.
- QR: payload ate 64 KB, 40 linhas, quantidade ate 99, observacao ate 500 caracteres,
  idempotencia duravel por 24 horas e rate limit distribuido.
- HMAC QR usa segredo de no minimo 32 bytes fora do repositorio.
- Acoes criticas preservam dados, informam se foram registradas e nunca exibem sucesso falso.

## Decision Log

| Decisao | Alternativas | Objecao | Resolucao |
| --- | --- | --- | --- |
| Fundacao seguida de fluxos verticais | Tela por tela; backend primeiro | Escopo integral grande | Entrega em tranches com gate por jornada |
| Dois shells | Shell unico; operacao isolada | Inconsistencia de navegacao | Contexto de filial/mesa persiste entre shells |
| Nucleo operacional unico | Balcao e salao separados | Regras duplicadas | State machines e APIs backend compartilhadas |
| QR permanente e revogavel | Codigo simples; QR por turno | Foto/reuso fora da casa | HMAC, versao, mesa ativa, rate limit e rotacao |
| Politica QR por filial | Tudo ativo; por mesa | Configuracao excessiva | Defaults seguros e uma politica por filial |
| Modelos QR controlados | Editor livre; modelo unico | Legibilidade e suporte | Formatos validados e personalizacao limitada |
| Demo explicito | Fallback global; remover demo | Dados falsos mascaram erro | `tenants.is_demo=false` por padrao |
| Integracoes por ultimo | Asaas ou fiscal antes | Dependencias externas | Codigo pode ficar pronto; aceite exige homologacao |
| Correcao antes da UI | UI imediatamente | Atomicidade e permissao quebradas | Tranche zero obrigatoria |
| Disponibilidade 99,5% | 99,9% | VPS unica nao sustenta 99,9% | Evolucao depende de redundancia e medicao |

## Revisao estruturada

- Skeptic: `REVISE`; objeções incorporadas.
- Constraint Guardian: `REVISE`; bloqueadores P0 e metas incorporados.
- User Advocate: `REVISE`; gates por papel e recuperacao incorporados.
- Integrator/Arbiter: `APPROVED`; nenhuma objecao rejeitada.
