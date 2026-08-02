# E-mail

## MVP

E-mail transacional para convite, reset de senha, verificacao de e-mail, alertas de assinatura e notificacoes operacionais.

## Provider

O provider primario é a API HTTP da Resend. O contrato `EmailProvider` permanece para permitir uma alternativa SMTP sem acoplar os fluxos de convite e recuperação ao fornecedor.

Consulte `docs/RESEND_PROVISIONING.md` para domínio, SPF/DKIM, chave, provisionamento na VPS e aceite.

## Regras

- Templates versionados.
- Links com token unico e expiracao.
- Logs sem token em claro.
- Separar e-mail transacional de marketing.
- Respeitar opt-out quando for comunicacao promocional.
