# WhatsApp e pareamento por QR

O GiroMesa não usa a integração oficial Meta como requisito do produto. O
transporte padrão é `WHATSAPP_TRANSPORT=disabled`: nenhuma mensagem é marcada
como enviada enquanto um conector real não estiver instalado.

`qr_unofficial` reserva o modo de pareamento por QR para o conector não oficial
que será homologado separadamente. Ele também permanece desativado até que o
conector exista; a interface não simula sucesso de entrega. A documentação e a
interface devem informar explicitamente que esse canal não é Meta oficial.

`meta_legacy` continua disponível apenas para migração/homologação controlada.

## Usos

- Confirmacao de pedido.
- Pedido em preparo, saiu para entrega e entregue.
- Link de pagamento.
- Cupom e aniversario com opt-in.
- Pesquisa de satisfacao.

## MVP

O núcleo mantém apenas a estrutura de templates. O transporte real por QR depende
de um conector separado, pareamento, sessão protegida e homologação por filial;
até lá o envio fica desabilitado, sem provider mock apresentado como entrega.

## Regras

- Respeitar opt-in/opt-out.
- Usar templates aprovados para mensagens iniciadas pela empresa.
- Registrar historico de envio.
- Nao logar tokens nem conteudo sensivel.
- Feature flag por tenant.

## Referencia

- https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform
