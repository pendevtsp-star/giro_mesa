# Seguranca

## Autenticacao

- Senhas com Argon2id e pepper externo.
- Cookies `HttpOnly`, `Secure`, `SameSite`.
- MFA para plataforma, donos, financeiro e administradores.
- Reset e convite com token unico, hash em banco e expiracao.
- Rate limit e bloqueio temporario.

## Autorizacao

- RBAC no backend.
- ABAC para filial, caixa, desconto, cancelamento, fiscal e impersonation.
- Menor privilegio por perfil.

## Aplicacao

- Validacao por schema.
- CORS restrito.
- CSRF se cookies forem usados.
- Headers de seguranca e CSP.
- Logs sanitizados.
- Upload com limite, tipo MIME e storage isolado.

## Integracoes

- Webhooks com validacao de origem/assinatura quando o provedor permitir.
- Idempotencia por evento externo.
- Sandbox antes de producao.
- Segredos fora do repositorio.

## Revisao

Rodar Codex Security antes de PR/release e antes de habilitar fluxos reais de pagamento, fiscal, WhatsApp e iFood.
