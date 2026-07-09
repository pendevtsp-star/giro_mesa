# QA Test Access

## Ambiente do estabelecimento

- `admin@bar-aurora-demo.local` / `Demo@12345`
  - Perfil: proprietario
- `gerente@bar-aurora-demo.local` / `Gerente@12345`
  - Perfil: gerente
- `caixa@bar-aurora-demo.local` / `Caixa@12345`
  - Perfil: caixa
- `garcom@bar-aurora-demo.local` / `Garcom@12345`
  - Perfil: garcom
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

- Use o proprietario para revisar fluxo completo e configuracoes.
- Use gerente, caixa e garcom para validar permissoes e operacao.
- Use cozinha e bar para verificar telas de KDS e impressao.
- Use financeiro para revisar relatorios, caixa e fiscal sem poderes de administracao total.
