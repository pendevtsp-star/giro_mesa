# Resposta a incidentes e contingência

## Classificação

| Severidade | Acione quando | Primeiro procedimento |
| --- | --- | --- |
| SEV-1 | perda/vazamento de dados, acesso entre tenants, cobrança indevida ou fraude | interromper o fluxo afetado, preservar auditoria e acionar o dono do incidente |
| SEV-2 | PDV, caixa, KDS, QR, estoque ou integração crítica indisponível sem operação segura | ativar contingência manual, registrar impacto por filial e atualizar o responsável do turno |
| SEV-3 | função degradada com alternativa manual segura | registrar ticket, orientar a alternativa e acompanhar até a correção |

| Severidade | ACK | Escalonamento | Checkpoint |
| --- | --- | --- | --- |
| SEV-1 | 5 min | responsável por incidentes + segurança + direção imediatamente | a cada 15 min |
| SEV-2 | 15 min | on-call técnico e responsável do turno | a cada 30 min |
| SEV-3 | 4 h úteis | owner do módulo | diário |

Owner operacional: pessoa nominada na escala do piloto. Canal primário: canal único de suporte definido no cadastro da plataforma. Se owner/canal não estiverem preenchidos, o piloto não está apto a operar.

## Regras para todos os níveis

1. Não apagar logs, eventos de webhook, outbox ou evidências. Não incluir segredo, token, e-mail completo, PAN, CVV ou PIN no ticket.
2. Registrar hora, filial, operador, correlação e a decisão tomada na auditoria/ticket.
3. Não executar restore, migration, deploy ou alteração de credencial durante o incidente sem a autorização própria.
4. Encerrar somente com responsável, impacto, contingência usada e próximo checkpoint registrados.

## Checklist executável

1. **Declarar:** abrir o ticket com `INC-AAAA-MM-DD-NNN`, SEV, início, tenant, filial, correlação e owner. O alerta deve ser enviado pelo monitor externo; na ausência dele, telefonar para a escala e registrar a chamada.
2. **Conter:** desligar somente o conector/filial afetado; bloquear mutação insegura; preservar leitura e operação manual segura.
3. **Diagnosticar:** capturar health sanitizado, release, fila/outbox e último evento relacionado. Nunca copiar payload sensível.
4. **Recuperar:** executar a menor ação reversível prevista no runbook do módulo; confirmar duas vezes em ambiente isolado antes de restore.
5. **Validar:** repetir a jornada afetada, confirmar tenant/filial, valores, auditoria e ausência de duplicata.
6. **Encerrar:** registrar causa, período, impacto, ações, evidência de recuperação, pendências e horário do próximo post-mortem.

Template: `ID | SEV | início | owner | tenant/filial | correlação | impacto | contenção | próximo checkpoint | estado`.

## Origem externa e iFood não homologado

O webhook iFood permanece desativado fora da homologação explícita. Receba o pedido no Gestor de Pedidos, confirme itens/valor/pagamento com o canal de origem e crie o delivery manual com `channel=ifood` e `externalCorrelationKey` igual ao identificador do Gestor. A API exige a chave e retorna a entrega existente em repetição, protegendo contra duplicidade por tenant/canal. Não alegar sincronização, pagamento confirmado ou impressão automática.

## E-mail/Resend

Sem contrato de assinatura homologado, o endpoint público Resend não é ativado. Para bounce ou complaint informado pelo provider, suspenda novos envios ao destinatário pelo procedimento operacional e preserve o evento/correlação. Retentativas automáticas só cobrem erro transitório (rede, 429 ou 5xx); erro permanente fica falho e visível, sem derrubar sessões operacionais.

## Suporte GiroMesa

O suporte começa em somente leitura. Elevação exige motivo, expiração de no máximo oito horas e gera auditoria visível. Esta elevação não cria impersonação nem substitui uma autorização operacional específica.
