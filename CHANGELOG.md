# Changelog

Todas as mudanças relevantes do GiroMesa serão documentadas neste arquivo.

## [Não publicado]

### Alterado

- Unificada a direção visual navy/amarelo da área Platform e das superfícies administrativas e operacionais legadas.
- Corrigidos contraste, hierarquia e responsividade de salão, caixa, delivery, equipe, onboarding, auditoria, relatórios, billing, branding, manual, status e cadastro de teste.
- Ajustados controles do mapa de mesas e identificação visual de grupos para permanecerem legíveis no tema escuro.
- Substituído o atalho de suporte por uma central interna, aprimorada a recuperação de senha e transformado o indicador de sessão em um estado não clicável.
- Eliminada a transição laranja/amarelo e padronizado o uso da marca oficial nas superfícies sem logo do estabelecimento.
- Substituído o símbolo raster com bordas brancas por uma versão SVG vetorial, nítida em qualquer resolução e integrada aos fundos navy.
- Simplificados clique e arraste do salão, corrigido o contraste das ações e alinhadas automaticamente as mesas após uma junção.
- Impedido o clique nos filtros do cardápio durante a troca dos dados iniciais pelos dados reais, preservando a categoria selecionada.
- Corrigida a tradução do período de teste e restaurada a hierarquia visual de KPIs, produtos mais vendidos e alertas no dashboard.
- Refeito o seed local com um único tenant visual, oito mesas organizadas, uma reserva, uma fila e um pedido em preparo.
- Removidos fallbacks de fixtures do dashboard para que pedidos, mesas e KDS reflitam somente o backend.
- Corrigida a identificação da mesa no KDS e ocultado o ranking de produtos enquanto não houver vendas concluídas.
- Tornado o reset demo completo e idempotente, incluindo QR, solicitações públicas e idempotência.
- Mantidas as chamadas do navegador na mesma origem para preservar cookies, CSRF e o proxy interno da API.
- Tornado o salvamento do mapa compatível com planos legados, sem criar um segundo mapa para a mesma filial.
- Corrigido o contraste dos indicadores comerciais reutilizados dentro do shell escuro da Platform.
- Alinhada a navegação à matriz real de permissões: garçom não recebe KDS ou catálogo, caixa usa a permissão de caixa e cozinha não recebe PDV.
- Adicionado bloqueio visual de rotas autenticadas antes da montagem do módulo, evitando telas cruas e chamadas indevidas ao backend.
- Tornados dashboard, prioridades, prontidão e atalhos sensíveis ao perfil, sem KPIs ou ações inacessíveis.
- Tornado o registro do service worker tolerante a bloqueios do navegador, preservando o funcionamento online.
- Reorganizados os formulários de reserva, fila e criação de mesa para evitar campos comprimidos e botões sobrepostos em desktop e mobile.

### Testes

- Isolado o E2E em banco, portas e diretório de build próprios, impedindo que a suíte altere o banco visual ou a sessão local em uso.
- Adicionada auditoria visual opcional de rotas autenticadas, públicas e Platform em quatro viewports, com captura de screenshots, contraste, overflow, erros de navegador e respostas 5xx.
- Adicionado fluxo E2E de arraste por Pointer Events, salvamento, recarga e restauração do mapa de mesas.
- Atualizado o E2E do mapa para respeitar a versão exigida pelo controle de concorrência otimista.
- Adicionadas regressões para suporte, recuperação de senha, indicador de sessão e abertura de ações da mesa sem deslocamento.
- Adicionado piloto automatizado e roteiro manual por proprietário, gerente, caixa, garçom, cozinha e cliente QR.
