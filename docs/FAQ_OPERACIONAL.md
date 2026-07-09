# FAQ Operacional GiroMesa

## 1. Posso fechar a conta antes de receber?

Nao. O fluxo correto e:

1. lancar itens;
2. receber total ou parcial;
3. quitar o saldo restante;
4. fechar a conta;
5. depois encerrar o caixa no fechamento do turno.

## 2. Pagamento parcial e pagamento misto sao suportados?

Sim. O pedido pode receber mais de um pagamento confirmado, inclusive com metodos diferentes, ate quitar o total.

## 3. Se a fiscal falhar, o pedido volta a ficar aberto?

Nao. A falha fiscal vira pendencia administrativa. Pedido e pagamento nao devem ser perdidos por isso.

## 4. O que impede fechamento incorreto de caixa?

- status de sessao;
- conferencia de valor esperado x contado;
- bloqueio quando ainda existem pedidos operacionais em aberto;
- auditoria e outbox para rastreabilidade.

## 5. Como tratar diferenca no caixa?

- encerrar o caixa com o valor contado real;
- registrar a divergencia;
- revisar pagamentos, pre-contas, estornos e ajustes do turno;
- formalizar tratativa antes do proximo fechamento.

## 6. O que fazer se a cozinha nao recebeu o pedido?

- revisar envio para KDS;
- revisar rota/impressora ativa;
- revisar fila de jobs;
- revisar historico do pedido e eventuais cancelamentos.

## 7. O que fazer se o cliente diz que pagou e o sistema nao mostra?

- revisar pagamentos da conta;
- conferir se a tentativa foi confirmada ou ficou incompleta;
- revisar auditoria `payment.confirmed`;
- conferir se o operador lançou no pedido certo.

## 8. O Dose Club compartilha banco com o GiroMesa?

Nao. A arquitetura prevista e integracao por API/webhook, sem acoplamento direto de banco.

## 9. O que e obrigatorio antes de go-live?

- usuarios individuais;
- MFA no administrador;
- impressora principal validada;
- fechamento de conta validado;
- fechamento de caixa validado;
- fiscal revisado quando aplicavel.

## 10. O que mais vale revisar antes de vender?

- integracoes reais com banco funcionando;
- testes de integracao nas areas sensiveis;
- E2E principal;
- scan de seguranca;
- checklist operacional de implantacao.
