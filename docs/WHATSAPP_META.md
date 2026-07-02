# WhatsApp Meta

## Usos

- Confirmacao de pedido.
- Pedido em preparo, saiu para entrega e entregue.
- Link de pagamento.
- Cupom e aniversario com opt-in.
- Pesquisa de satisfacao.

## MVP

Provider mock e estrutura de templates. Envio real depende de WABA, phone number id, token, templates aprovados e webhooks configurados.

## Regras

- Respeitar opt-in/opt-out.
- Usar templates aprovados para mensagens iniciadas pela empresa.
- Registrar historico de envio.
- Nao logar tokens nem conteudo sensivel.
- Feature flag por tenant.

## Referencia

- https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform
