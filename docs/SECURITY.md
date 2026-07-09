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

## Gate minimo pre-release

- MFA ativo para plataforma, dono e financeiro.
- Troca de senha inicial concluida para acessos administrativos.
- Auditoria validada para login, MFA, convite, reset, pagamento, cancelamento e permissao.
- Webhooks com segredo, assinatura e idempotencia revisados.
- Logs sem segredos ou dados sensiveis desnecessarios.
- Testes de auth/autorizacao e multi-tenant passando.
## Google Sign-In

- Fluxo recomendado: Authorization Code Flow no backend.
- O callback deve trocar o `code` no servidor; nunca expor `client_secret` no frontend.
- O estado (`state`) deve ser assinado e expirado para reduzir CSRF.
- O `id_token` deve ser validado localmente por JWKS e claims (`iss`, `aud`, `exp`) antes de confiar no login.
- No MVP atual, o Google Sign-In vincula usuarios existentes por e-mail verificado e grava vinculo explicito em `oauth_accounts`.
- Contas com MFA ativo passam por etapa dedicada de step-up apos o retorno do Google, antes de criar sessao.
- Desvinculo do Google nao deve remover o ultimo metodo de acesso do usuario sem senha local configurada.
