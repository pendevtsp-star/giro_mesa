# Gate de release do piloto GiroMesa

Este arquivo registra somente nomes de configuração e critérios de ativação. Valores
reais pertencem ao ambiente protegido da VPS ou aos secrets do GitHub e nunca ao Git.

## Estado seguro antes das homologações externas

- `WHATSAPP_TRANSPORT=disabled`
- `IFOOD_WEBHOOK_MODE=disabled`
- fiscal e TEF desativados por filial
- pagamento online por QR desativado
- Asaas restrito à cobrança da plataforma, sem criar pagamentos de comandas
- login por e-mail e senha permanece disponível quando Google OAuth estiver indisponível

O transporte `qr_unofficial` permanece deliberadamente indisponível. Ele não representa uma
conexão oficial da Meta e só poderá ser ativado depois de decisão jurídica, processo isolado,
sessão criptografada por filial, revogação, opt-in, opt-out e homologação com número real.

## Credenciais que bloqueiam a próxima etapa

### Resend

- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `RESEND_API_URL`
- `RESEND_API_KEY`
- segredo de assinatura do webhook Resend, quando o endpoint for ativado

### Google OAuth

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`

### Cobrança SaaS Asaas

- `ASAAS_ENV`
- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_SECRET`

### Integrações condicionadas

- Focus NFe: `FOCUS_NFE_TOKEN` e parâmetros fiscais aprovados pelo contador
- iFood: merchant, client credentials e segredo de webhook homologados
- GiroMesa–DoseClub: segredos de federação e integração distintos por ambiente

## Proteção do deploy

O environment GitHub `production` deve exigir aprovação manual. Configure o secret
`VPS_SSH_KNOWN_HOSTS` com a chave pública SSH previamente conferida da VPS. O workflow
falha se o host não estiver pinado; não existe fallback `accept-new`.

O fingerprint conferido foi cadastrado no secret do repositório em 05/08/2026. A aprovação
manual do environment continua sendo uma decisão operacional do proprietário da conta GitHub.

## Evidência local de 05/08/2026

- carga contínua de 90 minutos: 345.043 requisições, zero falhas, p95 de 71 ms e p99 de 138 ms;
- 12 operadores, 120 mesas e 600 consumidores SSE simultâneos;
- failover entre duas instâncias da API sem perda de disponibilidade;
- verificação posterior sem duplicidade, saldo inválido, conflito de idempotência ou acesso cruzado;
- migrations vazia e upgrade até `0043`, build, lint, tipos, testes, cobertura e gates de segurança aprovados;
- E2E administrativo: 8/8 aprovado, incluindo falha fechada do detalhe de tenant;
- matriz visual pública aprovada em 16 perfis e rotas autenticadas aprovadas em celular
  claro/escuro, incluindo contraste, overflow, alvos de toque e foco do diálogo global;
- WhatsApp e demais providers sem credenciais continuam desligados, sem simulação de sucesso.

Essas evidências não substituem PITR/restore externo, hardware real, Focus NFe, adquirentes,
iFood, WhatsApp, aprovação jurídica/contábil ou turno assistido no estabelecimento.

## Evidência mínima para ativar um conector

1. Credencial válida no ambiente protegido.
2. Sandbox ou tenant de homologação isolado.
3. Webhook autenticado, persistido antes do processamento e idempotente.
4. Cenário de indisponibilidade, retry, reconciliação e revogação.
5. Flag de desligamento por filial e contingência documentada.
6. Resultado anexado à release sem incluir segredo ou dado pessoal.

Até esses seis itens passarem, a interface deve mostrar o conector como não configurado
ou em homologação, e os perfis operacionais não recebem uma ação funcional.
