# Continuidade BYOD

## Modos disponíveis

O GiroMesa inicia cada filial no modo **Cloud**: navegador, API, banco e integrações
operam na nuvem. Não há instalação obrigatória no estabelecimento.

O modo **Continuidade BYOD** é opcional. O estabelecimento fornece e mantém uma máquina
compatível; o GiroMesa instala e vincula um Hub exclusivamente à filial. Nesta etapa não
existe appliance, comodato ou aluguel de hardware do GiroMesa.

## Limites importantes

O Hub nunca substitui a nuvem como autoridade de pedido, pagamento, estoque, fiscal ou
autorização. Se ele aceitar uma operação durante uma interrupção, a interface deve dizer
"registrado localmente, aguardando sincronização". Somente o recibo do servidor marca a
operação como confirmada.

O conector existente em `apps/local-connector` atende atualmente à impressão local. Ele
não deve ser anunciado como Hub operacional até o contrato de envelopes, autenticação por
filial, fila durável e reconciliação forem conectados às mutações de pedido. Isso evita
uma promessa falsa de operação offline.

## Requisitos da máquina do estabelecimento

- Equipamento dedicado ou gerenciado pela casa, com energia estável/UPS quando possível.
- Sistema suportado, Node.js LTS e armazenamento local criptografado para a fila.
- Acesso de saída HTTPS à API GiroMesa; nenhuma porta de entrada pública é necessária.
- Credencial de dispositivo exclusiva, revogável e limitada à filial.
- Conta operacional sem privilégios administrativos para executar o serviço.

## Instalação assistida futura

1. O proprietário solicita o modo Continuidade no painel; a plataforma valida a filial.
2. Um administrador gera uma credencial de Hub exibida uma única vez e registra a máquina.
3. O instalador verifica relógio, disco, HTTPS, armazenamento criptografado e impressoras.
4. O serviço inicia com fila local vazia e envia heartbeat sem nome de cliente, pedido ou
   segredo em logs.
5. A casa executa uma simulação de queda de link e reconciliação antes de confiar no modo.

## Gate antes de ativar

O modo só será disponibilizado após o mesmo envelope idempotente ser usado pelo navegador,
Hub e API; reenvio com a mesma chave; recibo técnico do servidor; auditoria; reconciliação
após reinício; e isolamento entre filiais. Até esse gate, a contingência é cloud com links
redundantes e procedimento manual de operação.
