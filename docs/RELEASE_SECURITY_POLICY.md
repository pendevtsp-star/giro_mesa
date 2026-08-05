# Política local de release e segurança

## Findings HIGH e CRITICAL

Findings `HIGH` e `CRITICAL` bloqueiam por padrão. O gate `pnpm security:high` valida o
audit do lockfile e só aceita exceções exatas registradas em
`security/high-exceptions.json`, com identificador, responsável, justificativa e data
futura de expiração. O gate `pnpm security:trivy-exceptions` aplica a mesma política ao
registro `security/trivy-exceptions.json` e gera `.trivyignore.generated`; o arquivo não
pode ser editado manualmente. Identificadores com curingas, exceções duplicadas,
incompletas ou vencidas bloqueiam o release.

Os scans Trivy de filesystem e configuração usam `severity: HIGH,CRITICAL`,
`exit-code: 1` e `ignore-unfixed: false`. Portanto, todo finding não coberto por uma
exceção exata, vigente, justificada e com owner falha o job. O workflow de produção
repete os gates de segurança e cobertura no próprio job `validate`; `publish-images`
depende desse job e `deploy` depende de `publish-images`. Isso vincula validação,
publicação e deploy ao mesmo SHA, inclusive em execução manual, sem caminho de bypass.
A publicação e as regras externas de branch protection continuam exigindo autorização
separada.

## CSP

A aplicação Web mantém `Content-Security-Policy` bloqueante em todas as respostas.
`CSP_REPORT_ONLY=true` adiciona, sem substituir a proteção, um header
`Content-Security-Policy-Report-Only` com `report-uri /api/csp-report`. O coletor local
registra somente a diretiva e as origens envolvidas, sem caminho, query string ou corpo
potencialmente sensível.

## Baseline mínimo de cobertura

Os pisos abaixo foram medidos no snapshot local de 2026-08-04. Eles não representam a
meta final do produto: são o ponto regressável inicial e só podem subir. O gate falha se
um domínio desaparecer do relatório ou ficar abaixo do seu piso.

| Domínio | Linhas mínimas |
| --- | ---: |
| Auth | 15% |
| Tenant | 14% |
| RBAC | 24% |
| Pedido | 22% |
| Pagamento | 42% |
| Caixa | 6% |
| QR | 11% |
| Estoque | 12% |
| Webhooks | 24% |
| Billing/plataforma | 15% |

O relatório agregado deve existir em `coverage/coverage-summary.json`; gere-o com a
suíte de cobertura e `node scripts/aggregate-coverage.mjs`, depois execute
`pnpm coverage:baseline`.

## Checklist local obrigatório

1. `pnpm test`, `pnpm typecheck` e `pnpm lint`.
2. `pnpm security:preflight` e `pnpm security:cases`.
3. `pnpm security:high`, `pnpm security:trivy-exceptions` e
   `pnpm security:workflow`.
4. `node scripts/secrets-scan-paths.mjs`.
5. `pnpm test:coverage` e `pnpm coverage:baseline` após agregar a cobertura.
6. Trivy filesystem e configuração com `HIGH,CRITICAL`, saída bloqueante e o arquivo de
   exceções gerado pelo gate.
7. `git diff --check` e revisão explícita dos arquivos fora do escopo.

O scanner de segredos cobre arquivos rastreados, arquivos não rastreados que não estejam
ignorados e histórico Git. Por usar a visão `--exclude-standard` do Git, arquivos ignorados
por `.gitignore`, `.git/info/exclude` ou regras globais ficam fora da varredura: eles devem
ser revisados separadamente antes do release. Portanto, um resultado verde não prova que
todo arquivo presente no disco foi inspecionado. A saída contém somente caminho e classe
do achado. A allowlist é exata, justificada e expirável; valores de segredo nunca devem ser
copiados para logs ou relatórios.
