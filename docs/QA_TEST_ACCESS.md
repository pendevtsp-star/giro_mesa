# Acessos de QA e Demo

Use estes acessos para validar a demo pública e os fluxos internos do GiroMesa. O ambiente
demonstrativo deve parecer intencional: quando a pessoa não estiver autenticada, a aplicação mostra
uma prévia guiada; quando entrar com uma conta abaixo, as ações passam a usar sessão, permissões e
dados reais do backend.

## Ambiente do Estabelecimento

- `admin@bar-aurora-demo.local` / `Demo@12345`
  - Perfil: proprietário
- `gerente@bar-aurora-demo.local` / `Gerente@12345`
  - Perfil: gerente
- `caixa@bar-aurora-demo.local` / `Caixa@12345`
  - Perfil: caixa
- `garcom@bar-aurora-demo.local` / `Garcom@12345`
  - Perfil: garçom
- `cozinha@bar-aurora-demo.local` / `Cozinha@12345`
  - Perfil: cozinha
- `bar@bar-aurora-demo.local` / `BarDemo@12345`
  - Perfil: bar
- `financeiro@bar-aurora-demo.local` / `Financeiro@12345`
  - Perfil: financeiro

## Backoffice SaaS

- `owner@giromesa.local` / `Platform@12345`
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
pnpm demo:reset
```

O reset aplica migrations e recompõe o tenant `bar-aurora-demo`. Ele deve ser idempotente e não
deve apagar dados reais fora desse tenant.

## Diferença entre ambientes

- Dev local: pode usar defaults locais e providers mock.
- Demo pública: usa login, sessão, permissões e backend reais com dados do Bar Aurora.
- Produção real: exige secrets fortes, URLs válidas, webhooks assinados e revisão humana de
  pagamentos, fiscal e LGPD.

## Critérios de UX da demo pública

- `/login` não deve mencionar API local nem erro de desenvolvimento.
- `/app` sem sessão deve apresentar uma prévia guiada com chamada clara para entrar na demo.
- Falhas temporárias devem usar linguagem profissional: tente novamente em instantes, sem expor
  detalhes internos.
- Landing e cardápio QR devem manter a identidade visual GiroMesa e textos em português do Brasil.
