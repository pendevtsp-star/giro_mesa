# Auditoria visual — Fase 10 Enterprise Premium

Data: 2026-08-03

Escopo: GiroMesa e Dose Club, incluindo rotas administrativas, operacionais,
públicas, comerciais, temas, componentes compartilhados, responsividade e
acessibilidade essencial. A auditoria preservou as marcas e os ativos oficiais
dos dois produtos.

## Matriz verificada

- GiroMesa: 29 rotas autenticadas, 8 públicas e 2 de plataforma.
- Viewports: 1440×900, 1024×768, 768×1024 e 390×844.
- Dose Club: landing, login, portal do cliente, onboarding e fluxos operacionais
  autenticados em desktop e celular.
- Temas: claro, escuro e automático, mantendo navy, amarelo e a identidade
  visual existente.
- Critérios automatizados no GiroMesa: erro de navegador, resposta 5xx,
  redirecionamento indevido, overflow horizontal e contraste WCAG AA.
- Critérios manuais: hierarquia, densidade, leitura da primeira dobra,
  consistência de estados, marca, foco, teclado, alvos touch e redução de movimento.

## Achados e correções

### Alta prioridade

1. A navegação móvel do GiroMesa ocupava a primeira dobra e afastava o operador
   da ação principal. O menu agora nasce recolhido, tem controle rotulado,
   `aria-expanded` e mantém o contexto do estabelecimento visível.
2. Confirmações do Dose Club não tinham semântica de diálogo, captura de foco,
   Escape ou restauração do foco anterior. O componente compartilhado agora
   cobre o ciclo acessível completo e impede fechamento acidental durante carga.
3. Drawers de configurações e reposição repetiam estrutura e comportamento.
   Ambos foram conectados ao drawer compartilhado, com a marca Dose Club,
   teclado, backdrop, foco e largura responsiva consistentes.
4. Tokens de painel usados pelo Dose Club não estavam definidos em todos os
   temas e textos secundários tinham contraste insuficiente. Os aliases e cores
   semânticas foram corrigidos nos temas claro e escuro.

### Média prioridade

1. O dashboard do GiroMesa repetia atalhos já disponíveis na navegação e
   apresentava blocos em sequência excessivamente longa. Os atalhos duplicados
   foram removidos e pendências, prontidão, indicadores e alertas passaram a
   usar agrupamentos responsivos de duas colunas.
2. A preferência de exibir ou ocultar cartões-resumo era decorativa. O dashboard
   agora respeita a configuração persistida.
3. Gradientes tipográficos, faixas laterais decorativas e transições de largura
   foram removidos dos pontos auditados para reduzir ruído e custo de pintura.
4. Toasts, ações de quantidade e botões de fechamento do Dose Club receberam
   nomes acessíveis, regiões de anúncio, foco visível e alvos touch adequados.
5. Campos de configurações foram associados aos respectivos rótulos e receberam
   atributos de preenchimento compatíveis com gerenciadores de senha.

## Identidade preservada

- GiroMesa continua usando o símbolo oficial `giromesa-symbol.svg` e o nome da marca.
- Dose Club continua usando `doseclub-logo.png` em navegação e superfícies modais.
- A tipografia já consolidada do Dose Club foi mantida por decisão de identidade,
  apesar do alerta genérico do detector sobre famílias populares. Uma troca de
  família alteraria a marca e não é necessária para corrigir usabilidade.

## Evidências técnicas

- Impeccable pós-correção: nenhum anti-pattern estrutural no frontend GiroMesa;
  no Dose Club restaram somente alertas de famílias tipográficas deliberadamente
  preservadas.
- GiroMesa: lint, typecheck, testes, build e 21 cenários da matriz visual aprovados.
- Dose Club: lint, typecheck, testes e build aprovados; 15 cenários E2E aprovados.
  Um cenário ficou flaky na primeira passagem paralela e foi reaprovado isoladamente,
  com um worker e sem retry.
- A primeira execução Dose Club apontou páginas do produto Orien porque a porta
  padrão 3000 já estava ocupada e o Playwright reutilizou aquele servidor. A
  validação válida foi repetida em portas isoladas 3110/3111, com PostgreSQL e
  Redis explícitos.
- `git diff --check` integra o gate final de publicação.

## Limites do aceite

- O gate desta fase cobre software, navegador e responsividade. Teste físico em
  tablets específicos, telas KDS, leitores e impressoras continua no aceite de
  hardware da fase final.
- A homologação de integrações externas e credenciais produtivas permanece nas
  fases correspondentes; não é requisito para encerrar a fundação visual.

## Resultado

A Fase 10 atende ao gate de experiência visual coerente, acessível e sem
regressão funcional nos viewports definidos. O frontend fica apto ao QA de
homologação, preservando a identidade dos dois produtos e sem introduzir uma
segunda linguagem visual.
