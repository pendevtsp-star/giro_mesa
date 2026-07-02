# E-mail

## MVP

E-mail transacional para convite, reset de senha, verificacao de e-mail, alertas de assinatura e notificacoes operacionais.

## Provider

Comecar com SMTP configuravel. Manter `EmailProvider` para trocar por Resend, SendGrid, SES ou outro provedor.

## Regras

- Templates versionados.
- Links com token unico e expiracao.
- Logs sem token em claro.
- Separar e-mail transacional de marketing.
- Respeitar opt-out quando for comunicacao promocional.
