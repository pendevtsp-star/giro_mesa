# Manual do Cliente GiroMesa

> Guia operacional inicial para implantacao, treinamento e go-live. Validacoes juridicas, fiscais, contabeis e financeiras continuam exigindo revisao humana especializada.

## 1. Objetivo do GiroMesa

O GiroMesa e o ambiente operacional do estabelecimento. Ele deve concentrar:

- abertura de mesa, balcao e comanda;
- lancamento de itens;
- envio para KDS e/ou impressao;
- pagamentos e fechamento;
- caixa;
- relatorios;
- estoque basico;
- trilha de auditoria.

Nao trate o sistema como apenas um cardapio digital. O valor dele esta em organizar a operacao inteira com rastreabilidade.

## 2. Primeiro acesso

1. Abra o link enviado pelo responsavel da implantacao.
2. Entre com o e-mail cadastrado e a senha temporaria.
3. Troque a senha no primeiro acesso.
4. Ative MFA para dono, gerente, financeiro e qualquer usuario com poder de ajuste, cancelamento, desconto ou estorno.

## 3. O que configurar antes do primeiro turno

### Estrutura

- filial/unidade;
- mesas e/ou comandas;
- setores de preparo: cozinha, bar, copa;
- impressoras e rotas criticas;
- usuarios e permissoes.

### Cardapio e venda

- categorias;
- produtos;
- precos;
- disponibilidade;
- observacoes operacionais;
- dados fiscais quando aplicavel.

### Controle interno

- estoque dos itens principais;
- ficha tecnica dos produtos mais criticos;
- responsavel pelo fechamento de caixa;
- rotina de suporte interno.

## 4. Perfis recomendados

- `Dono`: visao total, permissoes, auditoria, relatorios e configuracoes sensiveis.
- `Gerente`: opera salao, acompanha gargalos, autoriza excecoes e apoia fechamento.
- `Caixa`: pagamentos, pre-conta, fechamento de conta e conferencia de caixa.
- `Garcom`: abre mesa/comanda, lanca itens e envia para preparo.
- `Cozinha/bar`: opera KDS e andamento de tickets.

Regra pratica: nunca compartilhe usuario entre funcionarios.

## 5. Fluxo operacional minimo

1. Selecionar mesa, balcao ou comanda.
2. Abrir a conta.
3. Lancar os itens.
4. Enviar os itens para preparo.
5. Acompanhar consumo e ajustes autorizados.
6. Registrar pagamento.
7. Fechar a conta.
8. Fechar o caixa ao fim do turno.

## 6. Rotina por perfil

### Dono / administrador

- revisar indicadores do turno;
- conferir acessos e MFA;
- acompanhar pendencias fiscais;
- validar politicas de cancelamento, desconto e estorno.

### Gerente

- monitorar mesas atrasadas;
- redistribuir carga entre salao e preparo;
- revisar estoque critico;
- acompanhar divergencias do fechamento.

### Caixa

- registrar pagamentos corretamente;
- observar mesa pedindo pre-conta;
- fechar conta sem pular validacoes;
- justificar divergencias.

### Garcom

- abrir a conta certa;
- registrar itens sem atraso;
- enviar para KDS/impressao no momento correto;
- manter observacoes operacionais claras.

### Cozinha / bar

- avancar tickets;
- respeitar historico de cancelamento;
- evitar tratamento verbal fora do sistema quando o pedido ja esta em producao.

## 7. Personalizacao do ambiente

Cada cliente pode adaptar o visual do GiroMesa para ficar com a cara do estabelecimento:

- nome exibido;
- logo;
- tema claro, escuro ou automatico;
- cor de destaque pre-definida.

Isso melhora percepcao de produto e ajuda no uso diario, mas nao substitui configuracao operacional correta.

## 8. Impressao

- cadastre impressoras por filial;
- vincule rotas por setor;
- teste producao, caixa e contingencia;
- monitore falhas, ultima conexao e reimpressoes.

Sem impressora principal validada, nao trate o ambiente como pronto para pico de atendimento.

## 9. Fiscal

- o GiroMesa deve operar com provedor fiscal integrado;
- falha fiscal nao apaga pedido nem recebimento;
- pendencia fiscal vira tratativa administrativa;
- configuracao fiscal deve ser revisada com contador.

## 10. Estoque

- venda confirmada pode disparar baixa por ficha tecnica;
- ajuste manual precisa de motivo;
- cancelamento e estorno devem gerar reversao;
- estoque negativo, quando permitido, precisa ficar auditado.

## 11. Cardapio QR

- o cliente acessa por QR da mesa;
- consulta disponibilidade do cardapio;
- solicita apoio ou pre-conta;
- o fluxo pode evoluir para pedido direto do cliente.

## 12. Integracao com Dose Club

- o GiroMesa segue como fonte de verdade de produto, estoque fisico, PDV, caixa e eventos operacionais;
- o Dose Club fica separado, integrado por API e webhook;
- nao compartilhar banco entre os sistemas;
- consumo de dose nao deve virar baixa dupla de estoque.

## 13. Plano de onboarding recomendado

### Dia 1

- configurar filial;
- cadastrar usuarios-chave;
- cadastrar impressoras e rotas;
- subir cardapio base.

### Dia 2

- treinar garcom, caixa e cozinha;
- simular abertura, envio, recebimento e fechamento;
- alinhar permissoes e responsabilidades.

### Dia 3

- rodar turno assistido;
- revisar erros, gargalos e divergencias;
- corrigir impressao, fluxo de caixa e comportamento da equipe.

### Go-live

- liberar operacao completa;
- acompanhar primeiro fechamento;
- deixar suporte responsivo no mesmo dia.

## 14. Criterio minimo para virar operacao principal

O estabelecimento so deve operar integralmente no GiroMesa quando estes pontos estiverem validados:

- abertura de mesa/comanda sem bloqueios;
- envio para KDS e/ou impressao funcionando;
- pagamento manual e fechamento de conta funcionando;
- fechamento de caixa revisado;
- impressora principal funcionando;
- dono/admin com MFA ativo;
- permissoes por usuario revisadas.

## 15. Quando chamar suporte

Ao abrir chamado, informar:

- nome do estabelecimento;
- filial;
- usuario afetado;
- horario aproximado;
- mesa, comanda ou pedido envolvido;
- o que era esperado;
- o que aconteceu de fato;
- print da tela quando possivel.

Sem esse minimo, o tempo de diagnostico sobe e a tratativa fica menos precisa.
