# Acessos de QA e Demo

Use estes acessos para validar a demo pública e os fluxos internos do GiroMesa. O ambiente
demonstrativo deve parecer intencional: quando a pessoa não estiver autenticada, a aplicação mostra
uma prévia guiada; quando entrar com uma conta abaixo, as ações passam a usar sessão, permissões e
dados reais do backend.

## Ambiente do Estabelecimento

Todas as contas abaixo usam o valor de `SEED_TEST_PASSWORD` (injetado no ambiente,
nunca versionado):

- `admin@bar-aurora-demo.local`
  - Perfil: proprietário
- `gerente@bar-aurora-demo.local`
  - Perfil: gerente
- `caixa@bar-aurora-demo.local`
  - Perfil: caixa
- `garcom@bar-aurora-demo.local`
  - Perfil: garçom
- `cozinha@bar-aurora-demo.local`
  - Perfil: cozinha
- `bar@bar-aurora-demo.local`
  - Perfil: bar
- `financeiro@bar-aurora-demo.local`
  - Perfil: financeiro

## Backoffice SaaS

- `owner@giromesa.local` (senha em `SEED_PLATFORM_PASSWORD`)
  - Perfil: dono da plataforma

## Uso recomendado no QA

- Use o proprietário para revisar fluxo completo e configurações.
- Use gerente, caixa e garçom para validar permissões e operação.
- Use cozinha e bar para verificar telas de KDS e impressão.
- Use financeiro para revisar relatórios, caixa e fiscal sem poderes de administração total.

## Validação manual Fase 3

1. Logar como `admin@bar-aurora-demo.local`.
2. Abrir `/app/onboarding`.
3. Iniciar e concluir etapas permitidas.
4. Recalcular readiness e conferir bloqueios.
5. Voltar para `/app` e conferir o painel de prontidão operacional.
6. Abrir `/app/cash`.
7. Abrir turno.
8. Abrir caixa.
9. Registrar suprimento com motivo.
10. Registrar sangria com motivo.
11. Conferir resumo, movimentos e diferença prevista.
12. Fechar caixa.
13. Fechar turno.
14. Abrir auditoria e procurar `onboarding.*`, `shift.*`, `cash_session.*` e `cash_movement.created`.
15. Rodar testes de permissão/cross-tenant em ambiente com banco disponível.

## Reset da demo

```bash
export SEED_TEST_PASSWORD='<senha-com-12-ou-mais-caracteres>'
export SEED_PLATFORM_PASSWORD='<outra-senha-com-12-ou-mais-caracteres>'
pnpm demo:reset
```

No PowerShell, use `$env:SEED_TEST_PASSWORD` e `$env:SEED_PLATFORM_PASSWORD`. Nunca
grave os valores reais em documentação, código ou logs.

O reset aplica migrations e recompõe o tenant `bar-aurora-demo`. Ele deve ser idempotente e não
deve apagar dados reais fora desse tenant.

## Diferença entre ambientes

- Dev local: exige as variáveis de seed e pode usar providers mock.
- Demo pública: usa login, sessão, permissões e backend reais com dados do Bar Aurora.
- Produção real: exige secrets fortes, URLs válidas, webhooks assinados e revisão humana de
  pagamentos, fiscal e LGPD.

## Critérios de UX da demo pública

- `/login` não deve mencionar API local nem erro de desenvolvimento.
- `/app` sem sessão deve apresentar uma prévia guiada com chamada clara para entrar na demo.
- Falhas temporárias devem usar linguagem profissional: tente novamente em instantes, sem expor
  detalhes internos.
- Landing e cardápio QR devem manter a identidade visual GiroMesa e textos em português do Brasil.
