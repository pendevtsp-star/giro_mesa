# Piloto externo guiado por perfil

Este roteiro valida o GiroMesa como uma operação completa, sem conceder a um perfil atalhos ou
ações que ele não pode executar. Os acessos estão centralizados em `docs/QA_TEST_ACCESS.md`.

## Preparação

1. Confirmar que API e Web respondem nos endereços do ambiente de teste.
2. Usar exclusivamente o tenant demonstrativo preparado para o piloto.
3. Abrir uma janela anônima para cada perfil e registrar evidência de falha.
4. Não alterar cargos ou permissões durante a rodada.

## Proprietário

- Entrar e confirmar o perfil “Dono ou administrador”.
- Abrir visão do turno, QR personalizado e equipe.
- Conferir se os atalhos levam a módulos reais, sem tela vazia ou erro no console.
- Gerar uma prévia de material QR sem rotacionar o código durante o piloto.

## Gerente

- Entrar e confirmar o perfil “Gerente”.
- Abrir salão, relatórios e políticas de aprovação.
- Confirmar que equipe, segurança e billing não aparecem.
- Validar uma solicitação de aprovação existente sem criar dados artificiais.

## Caixa

- Entrar e confirmar o perfil “Caixa”.
- Abrir turno e caixa, conferir resumo e relatórios.
- Confirmar que catálogo, KDS, equipe e personalização não aparecem.
- Não fechar o caixa compartilhado sem combinar com os demais participantes.

## Garçom

- Entrar e confirmar o perfil “Garçom”.
- Selecionar uma mesa no modo garçom e revisar a comanda.
- Abrir o salão e conferir o estado das mesas.
- Confirmar que caixa, catálogo e KDS não aparecem.
- Abrir diretamente `/app/cash` e conferir o estado legível de permissão negada.

## Cozinha

- Entrar e confirmar o perfil “Cozinha ou bar”.
- Abrir o KDS, revisar estação, filtros e fila.
- Confirmar que o botão “Abrir PDV” e os módulos administrativos não aparecem.
- Abrir diretamente `/app/pos` e conferir o estado legível de permissão negada.

## Cliente QR

- Abrir `/q/M03` sem autenticação.
- Consultar o cardápio, abrir o resumo da mesa e chamar o garçom.
- Confirmar a mensagem de solicitação registrada.
- Não enviar pedidos repetidos durante a mesma rodada.

## Registro do resultado

Para cada perfil, registrar:

- resultado: aprovado, falhou ou bloqueado;
- rota e ação exatas;
- viewport e navegador;
- screenshot;
- resposta HTTP relevante;
- impacto operacional;
- sugestão de correção.

Uma rodada é aprovada quando todos os perfis concluem seu fluxo, acessos indevidos são bloqueados
antes de carregar o módulo e não há respostas 5xx, overflow horizontal ou erro de execução no
navegador.
