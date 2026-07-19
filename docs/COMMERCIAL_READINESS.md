# Prontidão comercial do GiroMesa

## O que já pode ser demonstrado

- Teste grátis de 7 dias sem cartão, com criação de tenant, filial inicial, owner, assinatura trial e auditoria.
- Gate comercial no app quando a assinatura exigir ativação, preservando acesso à central de assinatura.
- Central de assinatura com seleção de plano, dados financeiros, método preferido e solicitação de ativação auditável no backend.
- PDV para mesa, comanda e balcão, com envio ao KDS e pagamentos manuais.
- Cardápio QR, impressão por rota, estoque básico, caixa e relatórios executivos exportáveis.
- Equipe com cargos, permissões, convites, MFA e trilha de auditoria.
- Backoffice SaaS para tenants, trial, suporte, planos, convites seguros e checkout estrutural.
- Landing comercial, demo guiada, manual e checklist de implantação em `/app/onboarding`.

## Roteiro de demonstração

1. Entre com um usuário de demonstração e abra o painel.
2. Mostre a implantação guiada, depois o modo Garçom e o fluxo de mesa/pedido.
3. Envie o pedido ao KDS, registre pagamento e abra os relatórios do turno.
4. Mostre equipe, MFA, auditoria e personalização de marca.
5. Para SaaS, entre em `/platform` e percorra trial, suporte e resumo comercial.

## Roteiro de teste real com cliente piloto

1. Criar o trial em `/teste-gratis` sem cartão.
2. Abrir `/app/onboarding` e configurar identidade, salão, equipe e impressão.
3. Abrir `/app/salon`, clicar em uma mesa real e confirmar que o PDV abre na mesa escolhida.
4. Buscar/vincular cliente no PDV, lançar item com observação/preferência e enviar ao KDS.
5. Registrar pagamento parcial ou total, emitir comprovante e fechar a conta.
6. Conferir `/app/reports`, exportar CSV/PDF e validar caixa com o gerente.
7. Em `/app/billing`, solicitar ativação do plano escolhido e confirmar que a ação aparece na auditoria.
8. No backoffice `/platform`, acompanhar dias de trial, suporte, status comercial e ativação.

## Limites a declarar com transparência

- Integração fiscal real, SMTP, Google Sign-In, domínio/HTTPS definitivo e cobranças reais ainda dependem de credenciais e homologação externa.
- TEF, emissão fiscal em produção, iFood, WhatsApp, offline completo e pagamentos online não devem ser prometidos como recursos ativos antes de homologação.
- Checkout Asaas hospedado deve substituir o retorno comercial manual quando as credenciais reais estiverem ativas.

## Antes de vender para operação real

- Rodar um turno assistido com a equipe do cliente.
- Validar impressoras, rede local, rotas de impressão e fechamento de caixa.
- Configurar domínio, HTTPS, SMTP transacional, backups e monitoração externa.
- Validar fiscal com contador e provedor homologado.
