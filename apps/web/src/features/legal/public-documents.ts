export type PublicLegalDocument = {
  documentType: "terms" | "privacy";
  version: string;
  hash: string;
  status: "draft";
  title: string;
  summary: string;
  sections: Array<{
    heading: string;
    paragraphs: string[];
  }>;
};

type LegalDocumentSource = Omit<PublicLegalDocument, "hash">;

const termsSource: LegalDocumentSource = {
  documentType: "terms",
  version: "draft-2026-08-03",
  status: "draft",
  title: "Termos de uso",
  summary: "Minuta das condições de acesso ao GiroMesa para empresas e suas equipes.",
  sections: [
    {
      heading: "Status desta minuta",
      paragraphs: [
        "Este texto organiza as condições operacionais pretendidas para o GiroMesa, mas ainda depende da identificação cadastral da fornecedora e de validação jurídica. Enquanto estiver marcado como minuta, não substitui o contrato comercial assinado com o estabelecimento.",
      ],
    },
    {
      heading: "Escopo do serviço",
      paragraphs: [
        "O GiroMesa fornece recursos de gestão para bares e restaurantes, incluindo atendimento, pedidos, salão, produção, caixa, estoque, relatórios e experiência por QR. As funções liberadas dependem do plano, das permissões do usuário e das integrações configuradas pelo estabelecimento.",
        "O estabelecimento continua responsável por sua operação, preços, cardápio, atendimento, obrigações fiscais, trabalhistas, sanitárias e pelo uso adequado dos dados inseridos no sistema.",
      ],
    },
    {
      heading: "Contas, perfis e segurança",
      paragraphs: [
        "Cada pessoa deve utilizar credenciais próprias e o menor nível de acesso necessário. O estabelecimento administra perfis, permissões, dispositivos e revogações, e deve comunicar imediatamente qualquer suspeita de acesso indevido.",
      ],
    },
    {
      heading: "Operação e disponibilidade",
      paragraphs: [
        "A plataforma registra eventos e aplica controles de idempotência, auditoria e isolamento entre estabelecimentos. Janelas de manutenção, níveis de serviço, suporte, exportação e encerramento contratual serão definidos no contrato comercial definitivo.",
      ],
    },
    {
      heading: "QR e atendimento ao consumidor",
      paragraphs: [
        "O estabelecimento escolhe quais recursos do QR ficam disponíveis e é responsável por conferir pedidos, restrições de idade, disponibilidade e cobrança. O GiroMesa não processa o pagamento do consumo do cliente final por padrão.",
      ],
    },
    {
      heading: "Pontos pendentes de publicação",
      paragraphs: [
        "A versão contratual deverá informar razão social, CNPJ, endereço, canais formais, foro, regras de cobrança, limites de responsabilidade, SLA e data de vigência. Esses dados não serão presumidos nesta minuta.",
      ],
    },
  ],
};

const privacySource: LegalDocumentSource = {
  documentType: "privacy",
  version: "draft-2026-08-03",
  status: "draft",
  title: "Aviso de privacidade",
  summary: "Minuta sobre o tratamento de dados pessoais necessários à operação do GiroMesa.",
  sections: [
    {
      heading: "Status desta minuta",
      paragraphs: [
        "Este aviso descreve o desenho atual de privacidade, mas ainda depende da identificação cadastral da fornecedora, da definição do canal do encarregado e de validação jurídica. Ele não deve ser publicado como aviso definitivo enquanto estiver marcado como minuta.",
      ],
    },
    {
      heading: "Papéis no tratamento",
      paragraphs: [
        "Em regra, o estabelecimento decide como usar os dados de clientes e de sua equipe e atua como controlador. O GiroMesa trata esses dados para prestar o serviço contratado e atua como operador, sem prejuízo das situações em que a legislação atribua responsabilidade própria à plataforma.",
      ],
    },
    {
      heading: "Dados e finalidades",
      paragraphs: [
        "Podem ser tratados dados cadastrais, credenciais protegidas, perfis de acesso, registros de pedidos e pagamentos informados, eventos de auditoria, dados de suporte e informações técnicas de dispositivo e conexão.",
        "Esses dados são usados para autenticar pessoas, executar a operação do estabelecimento, prevenir fraude, prestar suporte, manter segurança, cumprir obrigações legais e melhorar a confiabilidade do produto.",
      ],
    },
    {
      heading: "Compartilhamento e suboperadores",
      paragraphs: [
        "Dados podem ser compartilhados com provedores estritamente necessários para hospedagem, comunicação, observabilidade, cobrança da assinatura e integrações ativadas pelo estabelecimento. A lista pública de suboperadores deverá identificar os provedores efetivamente contratados antes da produção.",
      ],
    },
    {
      heading: "Retenção, segurança e direitos",
      paragraphs: [
        "Os prazos de retenção devem considerar a finalidade, o contrato e as obrigações legais aplicáveis. O produto utiliza controles de acesso, registros de auditoria, segregação por estabelecimento e medidas de proteção compatíveis com o risco.",
        "Titulares poderão solicitar confirmação, acesso, correção e os demais direitos previstos na legislação aplicável. O canal oficial e o fluxo entre o titular, o estabelecimento e a plataforma serão publicados após validação cadastral.",
      ],
    },
    {
      heading: "Pontos pendentes de publicação",
      paragraphs: [
        "A versão definitiva deverá informar identidade e contato da fornecedora, contato do encarregado, bases legais por finalidade, prazos de retenção, transferências internacionais, suboperadores e data de vigência. Esses dados não serão presumidos nesta minuta.",
      ],
    },
  ],
};

export function canonicalLegalDocumentText(document: LegalDocumentSource) {
  return [
    document.documentType,
    document.version,
    document.status,
    document.title,
    document.summary,
    ...document.sections.flatMap((section) => [section.heading, ...section.paragraphs]),
  ].join("\n");
}

export const publicLegalDocuments = {
  terms: {
    ...termsSource,
    hash: "f56b723169070d0a68ff3aad28877350fc2b2f71f074c579a7d00f187886b8ad",
  },
  privacy: {
    ...privacySource,
    hash: "50ba75a087a0ef0c2a010795d4ae55e95ece96c4e135a2d6ca6a6d19af96c0d9",
  },
} satisfies Record<"terms" | "privacy", PublicLegalDocument>;
