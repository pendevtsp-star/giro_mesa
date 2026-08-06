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
  version: "draft-2026-08-06",
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
      heading: "Identificação da fornecedora",
      paragraphs: [
        "Razão social: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX. CNPJ: XX.XXX.XXX/XXXX-XX. Endereço: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX, Maceió/AL. E-mail jurídico: XXXXXXXXXXXXXXXXXXXXXXXXX. Encarregado de dados: XXXXXXXXXXXXXXXXXXXXXXXXX.",
        "Esses campos são intencionalmente visíveis como marcadores no piloto e devem ser substituídos e revisados antes de qualquer oferta comercial.",
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
      heading: "Pedidos, pagamentos e integrações",
      paragraphs: [
        "O GiroMesa registra pedidos, pagamentos, descontos, cancelamentos, produção, estoque e auditoria conforme as permissões configuradas. O estabelecimento é responsável por conferir valores, autorizações, fechamento de caixa e documentos emitidos.",
        "Integrações como Focus NFe, Resend, Google, iFood, WhatsApp e DoseClub somente operam quando a unidade possui credenciais válidas, consentimentos e políticas próprias. O WhatsApp por QR, quando disponibilizado, é transporte não oficial e pode ser revogado ou ficar indisponível.",
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
      heading: "Uso aceitável e propriedade intelectual",
      paragraphs: [
        "É proibido fraudar pedidos, burlar permissões, compartilhar credenciais, inserir conteúdo ilícito, explorar vulnerabilidades ou usar o serviço para finalidade diferente da operação autorizada. Marcas, software, textos e interfaces permanecem protegidos por seus respectivos titulares.",
      ],
    },
    {
      heading: "Vigência, suporte e responsabilidade",
      paragraphs: [
        "A minuta se aplica somente ao piloto controlado. Regras de preço, suporte, níveis de serviço, suspensão, encerramento, foro e limites de responsabilidade serão definidos no contrato definitivo. Nenhuma tela do sistema substitui orientação contábil, fiscal, trabalhista, sanitária ou jurídica.",
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
  version: "draft-2026-08-06",
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
      heading: "Identificação e contato",
      paragraphs: [
        "Controlador da plataforma: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX. CNPJ: XX.XXX.XXX/XXXX-XX. Endereço: XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX, Maceió/AL. Canal de privacidade: XXXXXXXXXXXXXXXXXXXXXXXXX. Encarregado: XXXXXXXXXXXXXXXXXXXXXXXXX.",
        "Os marcadores devem ser preenchidos e aprovados antes da publicação comercial.",
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
      heading: "Bases legais e dados de terceiros",
      paragraphs: [
        "A base legal de cada finalidade será confirmada com o responsável jurídico do controlador. Em geral, o tratamento pode ser necessário para executar o contrato, cumprir obrigação legal ou regulatória, exercer direitos e proteger a segurança; consentimento será usado quando aplicável e separado.",
        "O estabelecimento deve inserir somente dados necessários de clientes, equipe e fornecedores, manter sua própria transparência e atender solicitações relacionadas aos dados sob sua decisão.",
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
      heading: "Incidentes, cookies e transferências",
      paragraphs: [
        "Incidentes de segurança serão registrados, tratados e comunicados conforme a avaliação de risco e a legislação aplicável. Cookies estritamente necessários sustentam sessão e segurança; qualquer medição ou marketing não essencial dependerá de configuração apropriada.",
        "Hospedagem, e-mail, autenticação, emissão fiscal, cobrança e conectores podem processar dados em outras localidades. A lista de suboperadores, transferências e salvaguardas será publicada antes da produção.",
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
    hash: "41be70b84ebd2e647445bd7e7c158bcb72f0f77231c2ebd8778fbbafdace9acf",
  },
  privacy: {
    ...privacySource,
    hash: "498219ee8d29c5a6d83f34b38b74f5223bdafd4f6dbf55285a52e566d35e6d7a",
  },
} satisfies Record<"terms" | "privacy", PublicLegalDocument>;
