# GiroMesa — plano a fazer

> Visão operacional gerada do plano mestre. Pendências atuais: **168**.
> O plano mestre continua sendo a autoridade; não edite checkboxes somente aqui.

## Fluxo de sincronização

1. Nova feature ou correção entra primeiro no plano mestre como `[ ]`.
2. Execute `pnpm plan:sync` para atualizar esta visão.
3. Depois da validação, marque `[x]` no plano mestre e execute novamente.
4. A tarefa sai daqui e entra no plano executado com a data da sincronização.

## Checklist mestre de conclusão

<!-- task-id:7d884a300c06154b -->
- [ ] Fase 15 — hardening de produção, jurídico e integrações externas.

<!-- task-id:62a3a84b8162c979 -->
- [ ] Fase 16 — aceite integral técnico, visual, operacional e jurídico.

<!-- task-id:552933ff8d5e07ba -->
- [ ] Fase 17 — handoff, backup, piloto e corte único.

## Corte de escopo para o piloto de 06/08/2026 › Estado verificado em 03/08/2026

<!-- task-id:dee8950e235e17a5 -->
- [ ] Consolidar os worktrees atuais de F13/F14 em SHAs reproduzíveis, um por repositório.

## Corte de escopo para o piloto de 06/08/2026 › Bloqueadores P0 ativos

<!-- task-id:30ba23977578af84 -->
- [ ] GiroMesa: publicar documentos legais reais e aceite versionado; templates não contam.

<!-- task-id:f273def1033a8041 -->
- [ ] DoseClub: publicar o catálogo/SSO federado já implementado e homologar o exchange.

<!-- task-id:c3d6d7c26b76b0fa -->
- [ ] Ambos: definir razão social, CNPJ, contatos, suporte, privacidade e responsáveis reais.

<!-- task-id:fe645093d27983af -->
- [ ] Ambos: comprovar backup externo e restauração em ambiente isolado.

## Corte de escopo para o piloto de 06/08/2026 › Achados P1 incorporados

<!-- task-id:d09f75c0afb1625b -->
- [ ] Corrigir status público do GiroMesa e mover monitor/status para domínio externo à VPS.

<!-- task-id:aaaa9655ddad0240 -->
- [ ] Expor backoffice apenas após usuário interno, MFA, recuperação e auditoria reais.

<!-- task-id:55187b0e5638803f -->
- [ ] Proteger ambiente GitHub `production`, pin de host SSH e aprovação manual.

<!-- task-id:4e64d57e920b75de -->
- [ ] Reduzir RPO do DoseClub de 24 horas para no máximo uma hora durante o piloto.

## Fase 10 — fundação Enterprise Premium › Regra global de UX — informação em camadas

<!-- task-id:2176f9da5d3c1910 -->
- [ ] Validar o padrão com usuários de baixa familiaridade tecnológica sem retirar os
  detalhes necessários para administradores e suporte.

## Fase 14 — ecossistema GiroMesa e DoseClub › Evidência da execução local de 03/08/2026

<!-- task-id:97f86676afa37caf -->
- [ ] Receber identidade empresarial, canais oficiais, encarregado LGPD e aprovação humana
  de advogado/contador; as fontes jurídicas atuais continuam explicitamente como minuta.

<!-- task-id:a2b4089a854a1c14 -->
- [ ] Inserir credenciais e homologar Resend, Google OAuth, Asaas SaaS, Focus NFe, iFood,
  estoque compartilhado e qualquer automação WhatsApp que venha a ser autorizada.

<!-- task-id:06034fbbad02db3e -->
- [ ] Executar ensaio físico no parceiro, staging aprovado, backup externo/restore, commit,
  push, deploy e go/no-go; nenhum desses atos foi antecipado por esta execução local.

## Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Hardening do frontend

<!-- task-id:d7d2402e2db06d66 -->
- [ ] Paginar o catálogo quando o volume real justificar e reconciliar alterações de
  outros terminais.

## Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Teste “sexta lotada”

<!-- task-id:0596e454c67f5cea -->
- [ ] Preparar staging equivalente à produção com 120 mesas, até 120 comandas ativas,
  500 produtos, 100 tickets ativos e 12 sessões operacionais independentes.

<!-- task-id:9a38bcd55ddc3b3d -->
- [ ] Repetir a jornada em desktop, tablet e celular de desempenho reduzido, medindo
  requests, long tasks, memória, responsividade e estabilidade do estado.

<!-- task-id:0e19317cb12c243b -->
- [ ] Reexecutar com pedidos/hora, estações e distribuição real de ações coletados no F1.

## Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Gate A1

<!-- task-id:0fa545009f92b1a6 -->
- [ ] Interação percebida em até 200 ms, nenhum congelamento superior a 1 segundo,
  arraste contínuo em tablet e memória estável durante o ensaio.

<!-- task-id:ed2a177ce8549cc2 -->
- [ ] Catálogo completo acessível ao garçom, comanda atualizada sem reload e KDS sem
  acumular tickets entregues na visão ativa.

## Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Baseline confirmado

<!-- task-id:ff321e6d9afb5702 -->
- [ ] Não considerar A2 concluído enquanto backup apenas local ou horário permitir perda
  maior que a meta do piloto.

## Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Recuperação de desastre

<!-- task-id:89d1c93e648eff85 -->
- [ ] Habilitar arquivamento contínuo de WAL/PITR do PostgreSQL para armazenamento externo
  criptografado e separado da VPS, com alerta de atraso superior a 5 minutos.

<!-- task-id:dcbd6885511529f9 -->
- [ ] Executar backup completo diário, retenção definida e cópia externa; backup no mesmo
  disco da aplicação não conta como proteção contra desastre.

<!-- task-id:8267b603b1be590e -->
- [ ] Automatizar verificação de checksum, idade do último WAL/backup e falha de envio,
  sem registrar credenciais ou conteúdo sensível.

<!-- task-id:9acc8c3e5f3db208 -->
- [ ] Executar restore drill mensal em ambiente isolado e registrar ponto restaurado,
  duração, contagens mínimas e lacunas encontradas.

<!-- task-id:c49b6f161e1ae800 -->
- [ ] Documentar runbook de indisponibilidade, perda da VPS, corrupção do banco, promoção
  do ambiente restaurado e reconciliação dos dispositivos após retorno.

## Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Testes e Gate A2

<!-- task-id:cbf65dfb5a1652f7 -->
- [ ] Simular navegador fechado, troca de rede e reinício do dispositivo com operações
  pendentes, preservando fila, ordem e estado visível ao operador.

<!-- task-id:9bcb21322b3b8b63 -->
- [ ] Simular concorrência entre 12 dispositivos na mesma mesa e em mesas distintas,
  incluindo pagamento, transferência, cancelamento e fechamento simultâneos.

<!-- task-id:146fc779cd792785 -->
- [ ] Restaurar a partir de WAL/PITR externo e comprovar RPO de até 5 minutos, RTO de até
  60 minutos, isolamento multitenant e integridade de pedidos, pagamentos e auditoria.

<!-- task-id:2d7adc1aa84539de -->
- [ ] Gate: zero operação confirmada perdida, duplicada ou fora de ordem; toda operação
  não confirmada permanece recuperável e visível; restore atende RPO/RTO do piloto.

## Adendo de campo — piloto F1 Boteco › A3 — operação em nuvem e continuidade BYOD › Hub BYOD futuro

<!-- task-id:083f6a218ec3eb79 -->
- [ ] Definir protocolo assinado, pareamento, instalador, atualização, observabilidade,
  conflito e revogação antes de implementar o Hub.

<!-- task-id:5d50f1b841a934ea -->
- [ ] Homologar em Windows e Linux fornecidos pelo estabelecimento, sem tornar o Hub
  requisito para operação normal.

## Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Frontend e operação diária

<!-- task-id:46a31f642e55772b -->
- [ ] Ao abrir o turno, oferecer a etapa opcional `Organizar as mesas da equipe`, com
  atribuição por setor, seleção individual, cópia do último turno, mesas para primeira
  assunção e opção de pular.

<!-- task-id:60b38aebd1042984 -->
- [ ] No garçom, priorizar `Minhas mesas`, depois `Livres` e `Outras mesas`, exibindo
  responsável, estado e próxima ação sem poluir os cartões.

<!-- task-id:468fcf0f0ad004f8 -->
- [ ] Ao tocar mesa de colega, explicar quem é o responsável e oferecer `Pedir ajuda` ou
  `Solicitar transferência`; PIN aparece somente quando a exceção exigir decisão.

<!-- task-id:2ed401ff40ceb986 -->
- [ ] No mapa gerencial, mostrar nome curto ou iniciais e oferecer `Ver distribuição da
  equipe`, desligado por padrão; cor nunca será o único indicador.

<!-- task-id:92571922cd61224a -->
- [ ] Se um garçom for desativado durante o turno, destacar suas mesas como `Precisam de
  redistribuição`, sem troca automática silenciosa.

## Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Gate B1

<!-- task-id:0f9893dd9c078fe4 -->
- [ ] Cobrir modos estrito e colaborativo, primeira assunção simultânea, distribuição de
  120 mesas entre 12 garçons, transferência, ajuda e PIN inválido.

<!-- task-id:1e47ee93e5930ef7 -->
- [ ] Cobrir junção/separação, garçom desativado, queda/reconciliação, caixa recebendo sem
  assumir mesa e autoria correta de itens e pagamentos.

<!-- task-id:21c877af4bbd8619 -->
- [ ] Negar acesso cruzado entre tenants e filiais e comprovar que toda exceção gera evento
  e auditoria com usuário, horário e motivo.

<!-- task-id:8f4a225f9bd58fd1 -->
- [ ] Validar celular, tablet, teclado e leitor de tela sem regressão das metas do A1.

<!-- task-id:d496b9b54bfcfac8 -->
- [ ] Gate: uma única responsabilidade ativa por mesa/turno; nenhuma mutação não autorizada;
  histórico e autoria preservados em concorrência, transferência e reconexão.

## Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Segurança, confiabilidade e escala

<!-- task-id:6ef059cfafe95e9f -->
- [ ] Configurar `TRUSTED_PROXY_CIDRS` no ambiente real e validar o endereçamento observado
  através do proxy antes da homologação externa.

## Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Gate B2

<!-- task-id:d189be779d8a4757 -->
- [ ] Cobrir todos os modos e métodos de presença; token válido, inválido, fotografado,
  rotacionado; código incorreto; força bruta; aprovação concorrente e proxy falsificado.

<!-- task-id:173897939723f836 -->
- [ ] Cobrir mesa encerrada, transferida, agrupada e reaberta; comanda compartilhada e
  restrita; revisão, envio direto, álcool e chamados duplicados.

<!-- task-id:c756bc9d5f9304e5 -->
- [ ] Cobrir timeout, queda/reconciliação, sessão revogada, pedido duplicado, ocupação
  posterior e isolamento multitenant/filial.

<!-- task-id:5a3d3d321dddd484 -->
- [ ] Validar celular, conexão lenta, teclado, foco, leitor de tela e conteúdo personalizado
  com presença discreta do GiroMesa.

## Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Segurança, confiabilidade e Gate C1

<!-- task-id:f1b3f9a06fe24828 -->
- [ ] Validar desktop, tablet, celular, teclado, foco e alvos touch.

## Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Segurança, testes e Gate D2

<!-- task-id:f583f359547d831b -->
- [ ] Minimizar dados pessoais, proteger evidências e aplicar retenção/acesso compatíveis
  com a política jurídica e LGPD aprovada.

## Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Onboarding guiado do proprietário e contador

<!-- task-id:2470bc6faf557a73 -->
- [ ] Criar/atualizar a empresa pela API Focus, capturar identificadores e tokens próprios e
  testar a configuração sem exigir acesso do cliente ao painel Focus.

## Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Homologação antes da contratação e ativação de produção

<!-- task-id:db373b5af6f69589 -->
- [ ] Cadastrar o F1 como emitente próprio e usar exclusivamente seu token de homologação;
  o onboarding real do proprietário e contador faz parte do aceite do piloto.

<!-- task-id:8d1c669db2a5a0e6 -->
- [ ] Homologar emissão, consulta, rejeição, cancelamento, contingência, inutilização,
  retransmissão, webhook duplicado, reconciliação, XML e DANFC-e sem validade fiscal.

<!-- task-id:63761f68f2a7c75b -->
- [ ] Contratação Focus, resposta comercial sobre parceria/revenda, contador, habilitação
  SEFAZ, credenciais de produção e aprovação explícita são gates separados para produção.

<!-- task-id:e6b3d243b3be4fc9 -->
- [ ] Gate E1: nenhum documento válido pode ser emitido em homologação; nenhuma filial usa
  segredo de outra; F1 conclui onboarding e emissão experimental ponta a ponta; produção
  permanece impossível até todos os gates externos e operacionais estarem aprovados.

## Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › SmartPOS para cobrança móvel e TEF para caixa fixo

<!-- task-id:d7ca9acca83236f4 -->
- [ ] Integrar TEF/PinPad por meio do mesmo conector local seguro previsto para impressão e
  continuidade operacional, usando conexão de saída e sem abrir porta no roteador da casa.

<!-- task-id:3686711426938127 -->
- [ ] Cada adapter exige parceria, equipamento compatível, sandbox, homologação, tratamento de
  indisponibilidade, cancelamento/estorno, suporte e ativação gradual por filial antes de ser
  anunciado como disponível.

## Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Conciliação financeira e gate do piloto

<!-- task-id:99c08f06ae817f23 -->
- [ ] Levantar adquirentes, bancos, modelos e versões das maquininhas do F1 antes de escolher o
  primeiro adapter SmartPOS. Até essa informação chegar, o piloto permanece compatível pelo
  fluxo universal manual, sem promessa de integração específica.

<!-- task-id:b77824f3696e9424 -->
- [ ] Gate E2: pagamento parcial e combinado não duplica nem perde valor; queda após autorização
  é recuperada por consulta; contingência manual funciona; nenhuma comanda fecha com resultado
  desconhecido; conciliação explica toda diferença; integração física passa em hardware real.

## Fase 15 — hardening de produção, jurídico e integrações externas › 15.0 Congelamento e release reproduzível

<!-- task-id:59f9dadebdf7f092 -->
- [ ] Revisar e consolidar separadamente o diff GiroMesa e o diff DoseClub; nenhuma
  alteração de um produto entra no repositório do outro.

<!-- task-id:250ca1d879ada16d -->
- [ ] Registrar SHA, imagens, lockfile, migrations e configuração não secreta da release.

<!-- task-id:2a9dfb0ec172b417 -->
- [ ] Criar ambiente staging/pilot com aprovação manual; o mesmo digest aprovado é
  promovido sem rebuild para produção.

<!-- task-id:43cbc225db728c63 -->
- [ ] Confirmar o repositório oficial, arquivar a cópia legada `pendevtsp-star/giromesa`,
  remover credencial demo publicada, rotacioná-la onde tenha sido reutilizada e executar
  secrets scan no histórico dos dois produtos.

## Fase 15 — hardening de produção, jurídico e integrações externas › 15.1 Segurança P0 e isolamento

<!-- task-id:85c49743938ad3b2 -->
- [ ] Verificar headers na resposta real de Nginx/Cloudflare antes de alterar Next/API;
  aplicar CSP primeiro em report-only e somente depois bloquear sem quebrar QR, OAuth ou assets.

## Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento

<!-- task-id:3786baa43c74ef96 -->
- [ ] Definir razão social, nome fantasia, CNPJ, endereço, contato de suporte, canal
  LGPD, responsável por incidentes e horário de atendimento reais.

<!-- task-id:93fb3b9f148e26bd -->
- [ ] Publicar Termos de Uso, contrato SaaS B2B, Privacidade, Cookies, Cancelamento,
  DPA, suboperadores, segurança/incidentes, termos do QR e aviso de bebidas alcoólicas.

<!-- task-id:6ac43670bfdba914 -->
- [ ] Submeter redação a advogado e regras fiscais/retentivas a contador; templates
  internos e este checklist não equivalem a aprovação profissional.

## Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento › Landing pages baseadas em evidência

<!-- task-id:3719f897af97c8cb -->
- [ ] Substituir prova social inexistente por evidência verificável do produto: capturas
  reais, tour funcional GiroMesa `mesa → pedido → produção → pagamento → estoque` e tour
  DoseClub `oferta → venda → consumo → saldo → estorno`.

<!-- task-id:1f8df0530793f35b -->
- [ ] Apresentar a empresa como sediada em Maceió, Alagoas; razão social, CNPJ, endereço,
  contatos e horário somente entram na interface após validação documental.

<!-- task-id:95fe3cf1e9be1ca0 -->
- [ ] Fazer “Demonstração” abrir uma demonstração real e “Agendar apresentação” abrir um
  fluxo real de contato/agendamento; nenhum CTA pode terminar silenciosamente no login.

<!-- task-id:ae617415aa6bb9d1 -->
- [ ] Migrar imagens externas frágeis para ativos próprios ou licenciados, com dimensões,
  `alt`, otimização e origem documentadas; capturas do produto têm prioridade sobre
  imagens genéricas.

## Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor

<!-- task-id:3b83b80fcb124aae -->
- [ ] Rodar QA visual em `390×844`, `768×1024`, `1024×768`, `1440×900` e KDS
  `1920×1080`, incluindo vazio, erro, offline, conflito, permissão e integração desligada.

## Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Operação de pico e economia de interação

<!-- task-id:79849b97e8ca7b9a -->
- [ ] Permitir que um item comum, sem modificadores, seja adicionado e enviado em até três
  ações depois da seleção da mesa; modificadores só interrompem o fluxo quando existirem.

## Fase 15 — hardening de produção, jurídico e integrações externas › E-mail e autenticação

<!-- task-id:0b5fecdf83e043b8 -->
- [ ] Homologar Resend para convites, recuperação, confirmação e alertas, mantendo SMTP como alternativa,
  bounce e rastreio.

<!-- task-id:97eedc35399c3fce -->
- [ ] Validar SPF, DKIM e DMARC; tratar webhook Resend assinado e deduplicado para
  delivered, bounced, complained e suppressed, sem revelar existência de conta.

<!-- task-id:aa715dd9b1cec291 -->
- [ ] Exercitar convite, reenvio, reset de uso único, expiração, bounce e indisponibilidade
  em endereços externos reais; falha de e-mail não derruba sessões operacionais existentes.

<!-- task-id:82211b3bc976981b -->
- [ ] Homologar Google OAuth com origens, callback HTTPS, `state`, vínculo, revogação
  e encaminhamento público `/api/v1` sem duplicação `/api`.

<!-- task-id:82fc2f81fa78f7e9 -->
- [ ] Validar nos dois produtos `openid email profile`, login, vínculo, desvínculo,
  MFA opcional e fallback por e-mail/senha; nenhum callback localhost entra em produção.

<!-- task-id:b5fa896a10b58cb9 -->
- [ ] Configurar no console Google homepage, domínio, termos, privacidade e callbacks
  exatos; segredos permanecem somente no ambiente protegido.

## Fase 15 — hardening de produção, jurídico e integrações externas › Cobrança SaaS, pagamentos operacionais e Dose Club

<!-- task-id:6cc1905a4741c63e -->
- [ ] Homologar Asaas em sandbox: cliente, assinatura, checkout, webhook assinado,
  idempotência, outbox, reconciliação, trial, inadimplência, cancelamento e entitlements.

<!-- task-id:9c296e05e9bda46d -->
- [ ] Homologar contrato Dose Club 2026-07-30 com IDs reais de teste, filial/produto,
  consumo individual, combos, estoque compartilhado em ml, concorrência, timeout,
  retry, 409, estorno, webhook e `integration.shared_inventory`.

<!-- task-id:ee0709893289281d -->
- [ ] Publicar migrations, catálogo central e handoff federado já implementados; testar
  tenant/funcionário pré-provisionado, token de uso único e indisponibilidade de um produto.

## Fase 15 — hardening de produção, jurídico e integrações externas › TEF e conciliação de adquirentes

<!-- task-id:6e2445d180309545 -->
- [ ] Criar contrato mínimo `PaymentConnector` somente após escolher adquirente/provider,
  sistema operacional, PIN pad e processo de homologação do parceiro.

<!-- task-id:1939a612d0894ab9 -->
- [ ] Ativar TEF por filial/provider somente após ensaio no hardware; até lá, esconder a
  ação e usar maquininha externa.

<!-- task-id:d6baadea1c51d13b -->
- [ ] Documentar escopo PCI DSS aplicável com o fornecedor e o estabelecimento.

## Fase 15 — hardening de produção, jurídico e integrações externas › WhatsApp não oficial

<!-- task-id:b5cc8055ab3d4d18 -->
- [ ] Manter laboratório Web/QR em processo separado, sessão criptografada por
  tenant/filial, outbox, QR de pareamento, revogação e sem acesso aos bancos dos produtos.

<!-- task-id:de930b4fba644dde -->
- [ ] Implementar status, reconexão, revogação, cooldown, rate limit, opt-out e fila.

<!-- task-id:c966defdb48c7adc -->
- [ ] Cobrir reserva, fila, pedido, delivery, pré-conta e comprovante sem bloquear o núcleo.

## Fase 15 — hardening de produção, jurídico e integrações externas › Hardware, fiscal e infraestrutura

<!-- task-id:c78f2a41acf9785a -->
- [ ] Homologar impressoras físicas 58/80, rede/USB, conector e reimpressão.

<!-- task-id:a427bca64687dc36 -->
- [ ] Homologar Focus NFe por filial em ambiente de homologação e depois produção, com
  CNPJ/IE, credenciamento SEFAZ, certificado A1, CSC quando exigido, token externo,
  NCM, CFOP, CST/CSOSN, IBS/CBS e regras aprovadas pelo contador.

<!-- task-id:5ee5222658c4339c -->
- [ ] Cobrir emissão, consulta, rejeição, cancelamento, contingência, retransmissão,
  guarda do XML, DANFE/NFC-e, reconciliação e alerta antes de `fiscal.enabled=true`.

<!-- task-id:6bd1495a42b6f88a -->
- [ ] Homologar iFood somente após app, CNPJ, loja de teste e credenciais aprovadas;
  persistir evento antes do ACK, deduplicar, processar pedidos/cancelamentos/pagamentos,
  atualizar status, imprimir e conciliar.

<!-- task-id:a40a1a42b0892b76 -->
- [ ] Configurar Cloudflare, HTTPS, observabilidade, backup externo e restauração comprovada.

<!-- task-id:fd6e895d2f499d39 -->
- [ ] Exigir sandbox, segredo externo, healthcheck, idempotência, reconciliação, alertas,
  teste de indisponibilidade e desligamento por filial para cada integração.

## Fase 15 — hardening de produção, jurídico e integrações externas › Backoffice, observabilidade e suporte

<!-- task-id:e54c8a748da4f2b4 -->
- [ ] Habilitar backoffice somente para usuários internos nomeados, MFA obrigatório,
  sessão curta, recuperação testada, menor privilégio e auditoria do próprio acesso.

<!-- task-id:b748c764ba0a446e -->
- [ ] Criar monitor e página de status fora da VPS, sem expor memória, topologia, nomes
  de dados, versões internas ou segredos.

<!-- task-id:bfaa52435c83afdd -->
- [ ] Definir canal único de suporte, escala do turno piloto, dono do incidente,
  checkpoints e procedimento de rollback.

## Fase 15 — hardening de produção, jurídico e integrações externas › Gate

<!-- task-id:4fa06538b1fa79ac -->
- [ ] Nenhuma integração externa é considerada pronta sem cenário real de homologação
  e rollback/desligamento por filial.

## Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias

<!-- task-id:8da7654cc488ccc7 -->
- [ ] E2E autenticado por proprietário, gerente, caixa, recepção, garçom, cozinha,
  bar, estoque, financeiro e cliente QR.

<!-- task-id:75b945ae142046b0 -->
- [ ] Regressão visual, acessibilidade, teclado, touch e bump bar.

<!-- task-id:77fab4c5bb235f87 -->
- [ ] Medir a jornada do garçom em celular físico: selecionar mesa, adicionar item comum,
  enviar, repetir item, abrir comanda, solicitar pré-conta e registrar pagamento parcial.

<!-- task-id:dc9a8c0b5a999201 -->
- [ ] Medir rotas e cliques sem publicar ganho não comprovado: item comum em até três ações
  após a mesa, ação primária visível sem scroll e feedback local em até 200 ms.

<!-- task-id:b85472878471e648 -->
- [ ] Homologar KDS por toque e teclado/bump bar, incluindo estação errada, atraso, recall,
  expedição, impressora de contingência e reconexão.

<!-- task-id:006cf543ac244b3d -->
- [ ] Verificar todas as rotas e CTAs públicos sem autenticação, menu móvel equivalente,
  plano/produto/origem preservados, preço canônico e ausência de claims não comprovados.

## Fase 16 — aceite integral técnico, visual, operacional e jurídico › Jornada crítica

<!-- task-id:804d578d8ebc95d9 -->
- [ ] Abrir turno e caixa.

<!-- task-id:630e11d93165695a -->
- [ ] Acomodar reserva ou fila.

<!-- task-id:cb8c5fc010527f17 -->
- [ ] Abrir mesa e lançar por garçom.

<!-- task-id:f1e123d3fbb64469 -->
- [ ] Enviar itens a múltiplas estações.

<!-- task-id:fcf956242f09b1d1 -->
- [ ] Concluir KDS por item e expedição.

<!-- task-id:62647e072ed4d9f2 -->
- [ ] Adicionar consumo no PDV.

<!-- task-id:fd04f5c6a6acedff -->
- [ ] Cancelar com aprovação e compensação.

<!-- task-id:a8fe2b30c78ed5f7 -->
- [ ] Dividir e pagar com múltiplos métodos.

<!-- task-id:65b8aaf5ad2ec66a -->
- [ ] Entregar dinheiro do garçom.

<!-- task-id:0e75c779d595b0d4 -->
- [ ] Fechar conta, limpar e liberar mesa.

<!-- task-id:0f9a2f47051e8744 -->
- [ ] Imprimir comprovante.

<!-- task-id:30bc7072027c8f47 -->
- [ ] Fechar caixa e turno.

<!-- task-id:c62ee4282f06cda7 -->
- [ ] Conferir dashboard e relatórios.

<!-- task-id:7b697b79291b82d4 -->
- [ ] Repetir jornada por QR público.

<!-- task-id:31f72ed069977c79 -->
- [ ] Simular indisponibilidade das integrações.

<!-- task-id:1ffe85ea9f4dcb75 -->
- [ ] Repetir a jornada com Google/Resend indisponíveis e login tradicional ativo.

<!-- task-id:e23c525b3cfc3b09 -->
- [ ] Validar comprovante não fiscal e registro manual de NSU no terminal externo.

<!-- task-id:84f27f56d7155622 -->
- [ ] Executar DoseClub standalone e integrado: individual, combo, consumo, 409, retry,
  dead-letter, estorno único e reconciliação em mililitros.

## Fase 16 — aceite integral técnico, visual, operacional e jurídico › Gate

<!-- task-id:fc7652f55f7c0162 -->
- [ ] Nenhuma falha bloqueante, ação decorativa, credencial exposta, divergência
  financeira ou acesso cruzado entre tenants.

<!-- task-id:7a80c84f68b027e2 -->
- [ ] Advogado e contador registram aprovação ou exceção explícita; Codex não marca
  jurídico/fiscal como aprovado por conta própria.

<!-- task-id:75e60956d5941718 -->
- [ ] Hardware, rede e contingências são aceitos no estabelecimento piloto, não apenas
  em navegador ou mock local.

## Fase 17 — handoff, backup, piloto e corte único › Entrega

<!-- task-id:a5e502fc0424f856 -->
- [ ] URL de homologação e resultado do smoke test.

<!-- task-id:1a8baf0ea3e6eda5 -->
- [ ] Um login/senha de teste por perfil, entregue fora do Git.

<!-- task-id:d5d5b09cd1f962b3 -->
- [ ] Matriz curta de permissões e cenários sugeridos.

<!-- task-id:62f0fa31608555af -->
- [ ] Lista de integrações, estados e aviso explícito do WhatsApp não oficial.

<!-- task-id:d372ed9e4684d692 -->
- [ ] Resultado dos testes, riscos, itens opcionais desativados e plano de suporte.

<!-- task-id:1484817797ebc060 -->
- [ ] Selecionar estabelecimento piloto e configurar filial, catálogo, mesas, QR, KDS e impressão.

<!-- task-id:3af099e5d66564d3 -->
- [ ] Executar turno real assistido antes da autorização de produção.

<!-- task-id:10b582b1587a6bcd -->
- [ ] Criar seed/roteiro específico do parceiro, sem credencial previsível ou dado demo,
  com proprietário, gerente, caixa, garçom, cozinha/bar e estoque.

<!-- task-id:8280dbc4409ccbea -->
- [ ] Treinar abertura/fechamento de turno, caixa, contingência, reimpressão, QR, KDS,
  estorno DoseClub e canal de suporte.

<!-- task-id:2d65b30644353a18 -->
- [ ] Entregar matriz simples de permissões, quick start e procedimentos de queda de
  internet, impressora, integração e energia.

## Fase 17 — handoff, backup, piloto e corte único › Corte e rollback

<!-- task-id:3f9f014bf2b4f14c -->
- [ ] Criar backup verificável e validar restauração.

<!-- task-id:ebe961e0b77a261d -->
- [ ] Alcançar no GiroMesa o RPO máximo de 5 minutos e RTO máximo de 60 minutos definidos
  no Gate A2, com WAL/PITR, backup completo diário e cópia criptografada fora da VPS.

<!-- task-id:0a5e9431110dd814 -->
- [ ] Manter no mínimo sete backups diários, quatro semanais e seis mensais, com alerta,
  checksum e restore periódico em ambiente isolado.

<!-- task-id:b90107d94f82c16e -->
- [ ] Incluir PostgreSQL, uploads, configurações, materiais QR e documentação de segredos;
  segredos são protegidos e restaurados separadamente.

<!-- task-id:06566ae7cd26274a -->
- [ ] Registrar versões de app, migrations, imagens e configuração.

<!-- task-id:7fa80cace925890a -->
- [ ] Remover frontend operacional antigo e flags de compatibilidade aceitas.

<!-- task-id:0526534a9e17e999 -->
- [ ] Publicar uma única versão somente após autorização explícita.

<!-- task-id:38618accface3639 -->
- [ ] Executar migrations, smoke, jornadas críticas e monitoramento.

<!-- task-id:577bcb01a1236ac8 -->
- [ ] Manter rollback conjunto de aplicação, schema e configuração.

<!-- task-id:e8c38b4a34ba0304 -->
- [ ] Registrar compensações de mensagens/webhooks; elas não são “desprocessadas”.

<!-- task-id:ca9f2425f9f5bde9 -->
- [ ] Revogar sessões WhatsApp e segredos independentemente quando necessário.

## Fase 17 — handoff, backup, piloto e corte único › Go/no-go do piloto

<!-- task-id:ca556ace047466db -->
- [ ] Documentos legais públicos, identidade empresarial, contrato piloto e DPA possuem
  revisão humana registrada.

<!-- task-id:c54d173d85d7632b -->
- [ ] Backup externo e restore em ambiente isolado possuem evidência.

<!-- task-id:013c45e85ea36e62 -->
- [ ] Isolamento multitenant, integridade financeira, saldo e idempotência passaram.

<!-- task-id:c0280f9ec00b3e28 -->
- [ ] Não existe senha previsível, segredo exposto ou monitoramento interno público.

<!-- task-id:f09bbe9c7b3b16c8 -->
- [ ] PDV, caixa, KDS, QR, impressão crítica e consumo DoseClub possuem contingência.

<!-- task-id:81c3deae221e2d55 -->
- [ ] Toda integração ativa possui homologação, flag de desligamento e reconciliação.

<!-- task-id:dc7e753061c0e739 -->
- [ ] Suporte, responsável operacional e rollback estarão disponíveis durante o turno.

## Fase 17 — handoff, backup, piloto e corte único › Calendário crítico até quinta-feira › 03/08 — congelamento e P0

<!-- task-id:69673e01404103eb -->
- [ ] Consolidar F13/F14 em SHAs revisados e abrir branch/release de hardening.

<!-- task-id:52a4cc624b915eb4 -->
- [ ] Corrigir segurança P0, claims, preços, plano selecionado, e-mail e health público.

<!-- task-id:96aca072c9849db8 -->
- [ ] Receber dados empresariais e textos revisados por advogado/contador.

## Fase 17 — handoff, backup, piloto e corte único › Calendário crítico até quinta-feira › 04/08 — integrações viáveis e infraestrutura

<!-- task-id:bc35e6e11f490753 -->
- [ ] Publicar páginas legais e aceite versionado.

<!-- task-id:07a27b737adb774a -->
- [ ] Homologar Resend e Google OAuth nos domínios reais.

<!-- task-id:42b9fbb87ce11973 -->
- [ ] Corrigir Asaas SaaS, mas manter desligado até webhook/reconciliação passarem.

<!-- task-id:c828e0855dc6ee30 -->
- [ ] Configurar monitor externo, backup, restore, tenant e dados do parceiro.

## Fase 17 — handoff, backup, piloto e corte único › Calendário crítico até quinta-feira › 05/08 — F16 e ensaio físico

<!-- task-id:594b774aece1eb2c -->
- [ ] Rodar todas as suítes, segurança, migrations, E2E, visual e carga piloto.

<!-- task-id:4d40260058caf76c -->
- [ ] Ensaiar impressora, KDS, celulares/tablets, rede, QR impresso, caixa e DoseClub.

<!-- task-id:0d4417e2e9672dd7 -->
- [ ] Corrigir somente P0/P1; não abrir novo redesign nem feature sem relação com o piloto.

## Fase 17 — handoff, backup, piloto e corte único › Calendário crítico até quinta-feira › 06/08 — go/no-go e piloto assistido

<!-- task-id:41179359649197a1 -->
- [ ] Fazer backup pré-turno, registrar release/digest e revisar flags.

<!-- task-id:1dd3bf07a3906a66 -->
- [ ] Executar jornada completa acompanhada, com war room, checkpoints e log de eventos.

<!-- task-id:83f7b7bafa693938 -->
- [ ] Reverter imediatamente em caso de corrupção, acesso cruzado ou divergência financeira.

## APIs, dados e tipos novos › Experiência pública

<!-- task-id:21e899fed33ab6cb -->
- [ ] Validar upload, tamanho, formato e contraste; bloquear código, CSS e scripts personalizados.
