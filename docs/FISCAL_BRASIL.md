# Fiscal Brasil

## Posicao

Nao criar emissor fiscal proprio no MVP. Usar `FiscalProvider` para integrar provedor especializado.

Decisao atual: **Focus NFe sera o primeiro provider fiscal real do GiroMesa**. `mock` continua sendo o provider padrao para desenvolvimento local e testes sem credenciais.

Nuvem Fiscal fica como provider legado/fallback tecnico no codigo, mas nao e mais a escolha primaria do projeto apos aviso de desativacao visto no painel do fornecedor.

O GiroMesa deve controlar o ciclo operacional fiscal, mas a autorizacao real da SEFAZ/Prefeitura fica fora do produto no MVP. O sistema cria pendencias fiscais, audita emissao/cancelamento, guarda metadados do documento e delega a transmissao para um provider.

## Documentos

- NFC-e para consumidor final quando aplicavel.
- NF-e quando necessario.
- NFS-e para assinatura SaaS da plataforma, se aplicavel.
- SAT/CFe/MFE conforme UF.

## Implementado no MVP tecnico

- Tabela `fiscal_settings` por tenant/filial com provider, ambiente, modelo padrao, serie, numeracao, regime e referencias seguras para certificado/CSC.
- Campos fiscais basicos em produtos: NCM, CFOP, CEST, origem, CST/CSOSN e aliquotas.
- Tabela `fiscal_documents` vinculada a pedido, filial, provider, modelo, ambiente, serie/numero, chave de acesso, XML/DANFE e status.
- Modulo API `/api/v1/fiscal/*` com permissao backend `fiscal:read` e `fiscal:manage`.
- Emissao mock: fechamento de pedido pago cria documento fiscal pendente; worker autoriza documento mock em homologacao.
- Cancelamento operacional de documento autorizado, com auditoria append-only.
- Painel fiscal no app para listar documentos, emitir documento do pedido atual e cancelar documento autorizado.

## Fluxo atual

1. Pedido e pagamento sao fechados no PDV.
2. Backend cria ou reutiliza um `fiscal_document` por pedido/modelo para evitar duplicidade.
3. Documento entra como `pending`.
4. Worker fiscal processa documentos pendentes.
5. Provider configurado processa o documento. Em desenvolvimento, `mock` marca como `authorized` com chave/XML/DANFE simulados. Em homologacao/producao, `focus_nfe` envia NFC-e para a Focus NFe.
6. Falhas fiscais ficam como pendencia operacional; pagamento e fechamento do pedido nao sao revertidos automaticamente.

## Estados

- `not_required`
- `pending`
- `authorized`
- `rejected`
- `canceled`
- `contingency`
- `error`

Transicoes fiscais devem passar pela state machine do dominio. Updates livres de status nao sao permitidos em codigo de negocio.

## Regras

- Certificado A1, CSC/token e credenciais nunca entram no repositorio.
- Separar homologacao e producao.
- Controle rigoroso de emissao, cancelamento e inutilizacao.
- Falha fiscal apos pagamento gera pendencia operacional, nao apaga pagamento.
- Regras fiscais devem ser validadas por contador/consultor fiscal.

## Provider real atual: Focus NFe

O adapter `focus_nfe` usa HTTP Basic Auth conforme documentacao oficial da Focus NFe. O token e enviado como usuario e a senha fica vazia, equivalente ao header:

```text
Authorization: Basic base64("TOKEN:")
```

A Focus NFe separa ambientes por URL:

- homologacao: `https://homologacao.focusnfe.com.br`
- producao: `https://api.focusnfe.com.br`

As rotas usam `/v2`. A emissao NFC-e e feita em:

```text
POST /v2/nfce?ref=<referencia-unica>&completa=1
```

A referencia `ref` deve ser unica por token e preferencialmente alfanumerica. No GiroMesa, o worker usa o `fiscal_document.id` sanitizado como referencia externa.

Segundo a documentacao oficial, a NFC-e da Focus NFe e sincrona: o retorno ja indica autorizacao ou rejeicao no mesmo request.

Variaveis esperadas:

- `FISCAL_PROVIDER=focus_nfe`
- `FOCUS_NFE_TOKEN`
- `FOCUS_NFE_HOMOLOGATION_URL`
- `FOCUS_NFE_PRODUCTION_URL`

O payload NFC-e e montado a partir de pedido, itens, pagamentos e `fiscal_settings`. A configuracao por tenant/filial pode complementar campos especificos do provider em `fiscal_settings.config.focusNfePayload`.

O adapter deve evoluir para cobrir:

- emissao NFC-e em homologacao e producao;
- consulta de status;
- cancelamento;
- inutilizacao de numeracao, quando aplicavel;
- download/armazenamento de XML e DANFE;
- webhook ou polling com idempotencia;
- mapeamento de erros fiscais para pendencias operacionais.

Estado atual do GiroMesa:

- Emissao NFC-e Focus NFe: preparada no worker, sem credenciais hardcoded.
- Payload NFC-e Focus NFe: mapeado no backend com produtos, pagamentos, serie, numero e dados fiscais basicos.
- Cancelamento real Focus NFe: bloqueado como `focus_nfe_cancel_not_implemented` ate validacao do endpoint em homologacao.
- Nuvem Fiscal: mantida como codigo legado/fallback, nao recomendada para nova configuracao.

Antes de producao, validar com contador/consultor fiscal:

- regime tributario;
- serie e numeracao;
- CFOP/NCM/CST/CSOSN/CEST;
- CSC/token NFC-e quando aplicavel;
- contingencia;
- regras por UF;
- cancelamento e inutilizacao.

## Referencias oficiais

- Introducao Focus NFe: https://doc.focusnfe.com.br/reference/introducao
- Autenticacao Focus NFe: https://doc.focusnfe.com.br/reference/autenticacao
- Ambientes Focus NFe: https://doc.focusnfe.com.br/reference/ambiente
- Emitir NFC-e Focus NFe: https://doc.focusnfe.com.br/reference/emitir_nfce
- Referencia `ref` Focus NFe: https://doc.focusnfe.com.br/reference/referencia
- Campos de item Focus NFe: https://campos.focusnfe.com.br/nfe/ItemNotaFiscalXML.html

## Reforma Tributaria

Manter campos fiscais versionados e provider substituivel para adaptar NF-e/NFC-e/NFS-e a IBS/CBS e mudancas regulatórias.
