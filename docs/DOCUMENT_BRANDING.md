# Padronizacao visual de documentos

## Objetivo

Todo artefato emitido pelo GiroMesa deve parecer parte do mesmo produto e, quando fizer sentido, refletir tambem a identidade do estabelecimento contratante.

Isso vale para:

- emails transacionais;
- relatorios impressos ou exportados para PDF;
- comprovantes;
- pre-conta e fechamento;
- comunicacoes operacionais futuras.

## Fonte de verdade

A base visual compartilhada fica em `packages/domain/src/document-branding.ts`.

Ela centraliza:

- nome exibido do tenant;
- logo do tenant;
- cor de destaque por preset;
- avatar fallback por inicial;
- shell visual de email;
- shell visual de documento imprimivel.

## Regras

- Nunca emitir HTML solto sem o shell padronizado.
- O tenant pode assinar o documento com sua propria marca, mas o documento continua pertencendo ao ecossistema GiroMesa.
- A identidade visual deve funcionar com ou sem logo enviada.
- PDFs e impressos devem incluir cabecalho, identificacao do documento, metadata, bloco executivo e rodape.
- Emails precisam manter CTA claro, contraste alto e rodape institucional.
- CSV continua estrutural para importacao/analise; quando houver versao executiva do mesmo conteudo, oferecer PDF/impressao padronizada em paralelo.

## Cobertura atual

- Convites e reset/autenticacao usam email padronizado.
- Convite inicial do tenant no backoffice usa email padronizado.
- Fechamento gerencial por caixa usa documento imprimivel padronizado.
- Pre-conta executiva, resumo executivo de caixa e comprovante operacional usam documento imprimivel padronizado.
- Pre-conta fisica, resumo fisico de caixa e comprovante fisico seguem o mesmo cabecalho/rodape documental no renderer de impressao.
- Backoffice SaaS consegue disparar emails padronizados para trial acabando, inadimplencia e follow-up.
- Fila de suporte exporta CSV e PDF executivo com identidade do GiroMesa Platform.
- QR da mesa agora consegue abrir um resumo visual padronizado da comanda antes do envio ou da solicitacao de pre-conta.
- Painel operacional gera anexo fiscal auxiliar padronizado para conferencia interna.
- Backoffice principal e detalhe do tenant agora exportam PDF executivo com a mesma linguagem visual.

## Proximas aplicacoes recomendadas

- cupons operacionais adicionais por rota;
- anexos fiscais oficiais quando houver provider homologado;
- exportacoes executivas adicionais por modulo;
- notificacoes email de suporte, trial e inadimplencia com variacoes por plano/SLA.
