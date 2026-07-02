# Fiscal Brasil

## Posicao

Nao criar emissor fiscal proprio no MVP. Usar `FiscalProvider` para integrar provedor especializado, como Nuvem Fiscal, Focus NFe, PlugNotas/TecnoSpeed ou WebmaniaBR.

## Documentos

- NFC-e para consumidor final quando aplicavel.
- NF-e quando necessario.
- NFS-e para assinatura SaaS da plataforma, se aplicavel.
- SAT/CFe/MFE conforme UF.

## Regras

- Certificado A1, CSC/token e credenciais nunca entram no repositorio.
- Separar homologacao e producao.
- Controle rigoroso de emissao, cancelamento e inutilizacao.
- Falha fiscal apos pagamento gera pendencia operacional, nao apaga pagamento.
- Regras fiscais devem ser validadas por contador/consultor fiscal.

## Reforma Tributaria

Manter campos fiscais versionados e provider substituivel para adaptar NF-e/NFC-e/NFS-e a IBS/CBS e mudancas regulatórias.
