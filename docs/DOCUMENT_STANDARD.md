# Padrão de documentos GiroMesa

Todo documento emitido pelo GiroMesa deve usar `renderBrandedPrintDocument` do pacote de domínio quando houver geração HTML/PDF para impressão.

O documento deve conter, quando aplicável:

- identidade visual do estabelecimento, incluindo nome e logo;
- tipo do documento, título, período e metadados operacionais;
- valores formatados em BRL e textos em português do Brasil;
- rodapé que identifique o GiroMesa e esclareça quando o conteúdo não substitui documento fiscal ou contábil oficial.

CSV deve priorizar dados estruturados, cabeçalhos em português e codificação UTF-8. E-mails transacionais devem usar o provedor de e-mail com branding do tenant, nunca HTML ad hoc dentro de controllers.
