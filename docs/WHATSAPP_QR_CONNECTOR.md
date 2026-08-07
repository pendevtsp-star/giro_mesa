# Conector WhatsApp por QR (não oficial)

O conector é um processo separado do API/worker. Ele usa pareamento por QR via
Baileys e não é uma integração oficial da Meta. Não há garantia de continuidade,
entrega ou disponibilidade; o estabelecimento deve usar um número dedicado e
aceitar esse risco antes da homologação.

## Fluxo local

1. O proprietário abre `/app/settings/whatsapp` e gera uma chave para a filial.
2. Copia a chave uma única vez para o ambiente do conector.
3. Inicia o conector com `GIROMESA_API_URL`, `GIROMESA_CONNECTOR_KEY` e
   `WHATSAPP_SESSION_DIR`.
4. Lê o QR exibido no terminal; o status e o QR vigente aparecem na tela do
   GiroMesa por heartbeat autenticado.
5. O conector expõe somente `127.0.0.1:3338/messages` e `/healthz`. O endpoint
   de mensagens exige a mesma chave da filial e um `x-idempotency-key`; nesta
   primeira versão, aceita apenas texto e limita envios a 60 por minuto.

Exemplo:

```powershell
$env:GIROMESA_API_URL = "http://localhost:3333"
$env:GIROMESA_CONNECTOR_KEY = "chave-gerada-no-giro-mesa"
$env:WHATSAPP_SESSION_DIR = ".data/whatsapp/f1"
pnpm --filter @giromesa/whatsapp-connector start
```

## Limites deliberados

- `WHATSAPP_TRANSPORT=disabled` continua sendo o padrão e deve permanecer assim
  até o teste de pareamento, mensagem controlada, reconexão e revogação.
- O QR não é Meta Cloud API, não usa webhook oficial e não deve ser apresentado
  comercialmente como integração oficial.
- Sessão é local ao processo; backup, permissões do diretório e rotação de chave
  são responsabilidade do operador durante a homologação.
- Templates, mídia, campanhas e envio automático em massa permanecem bloqueados.
- O conector não deve registrar conteúdo de mensagens nem a chave em logs.

O caminho para produção exige um número dedicado, teste de indisponibilidade,
rate limit, fila idempotente, retenção segura da sessão e aceite jurídico antes
de trocar o transporte na VPS.
