# ADR-0005 - Fiscal Provider

## Decisao

Criar `FiscalProvider` e integrar provedor fiscal externo em vez de emitir documentos fiscais diretamente no MVP.

## Motivo

Fiscal brasileiro muda por UF, regime, documento, contingencia e reforma tributaria.

## Consequencias

O produto fica dependente de homologacao de provedor, mas reduz risco tecnico e juridico.
