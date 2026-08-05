# GiroMesa — plano executado

> Histórico incremental iniciado em 2026-08-04.
> Registra somente tarefas que passaram pelo plano a fazer após este corte.

## 2026-08-04

<!-- completed-task-id:70ce54d282fe1b53 -->
- [x] **Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Escrita durável e reconciliação** — Criar outbox local durável no modo cloud, reaproveitável pelo modo `continuity_byod`, com estados `pending`, `confirmed`, `failed` e `requires_attention`.

<!-- completed-task-id:51ee634a56b36649 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Dados e regras centrais** — Adicionar política de responsabilidade às configurações operacionais da filial.

<!-- completed-task-id:d1c2bfd36b44c059 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Dados e regras centrais** — Criar `table_waiter_assignments` com tenant, filial, turno, mesa, garçom, origem, autor da atribuição, início, encerramento, motivo e versão.

<!-- completed-task-id:925e5274029fac24 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Dados e regras centrais** — Garantir no banco uma única atribuição ativa por mesa e turno, com índices por filial, turno, mesa e garçom.

<!-- completed-task-id:1aa5b2fe28b4bb95 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Dados e regras centrais** — Adicionar `registeredByUserId` aos itens da comanda; manter canal explícito para QR e automações que não possuem um garçom como autor.

<!-- completed-task-id:9a905452362ce29b -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Dados e regras centrais** — Executar reivindicação, transferência, ajuda, evento e auditoria em transações com controle de concorrência e isolamento por tenant/filial.

<!-- completed-task-id:b568a37a9f5be8a1 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Dados e regras centrais** — Reutilizar `approval_requests` e o PIN existente para ajuda e transferência, sem criar um segundo mecanismo de autorização.

<!-- completed-task-id:9606a0eceb67d6b7 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Autoria financeira e histórico** — Preparar a autoria gerada no B1 para os cálculos de fechamento, perdas e partnership definidos posteriormente em D1, D2 e D3.

<!-- completed-task-id:64aba5ef8f92e41a -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Frontend e operação diária** — Oferecer lista e seleção acessível além de arrastar; drag and drop nunca é a única forma de organizar a equipe.

<!-- completed-task-id:11f983816bdb1c08 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Concorrência, conexão e recuperação** — Em disputa simultânea por mesa livre, persistir um único responsável e informar aos demais quem assumiu a mesa.

<!-- completed-task-id:ca551b0f58f893f9 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Concorrência, conexão e recuperação** — Retornar erros operacionais claros, como `Mesa atendida por João`, `Turno não está aberto` e `A responsabilidade mudou enquanto você atendia`.

<!-- completed-task-id:4381b96a70c6dddf -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Concorrência, conexão e recuperação** — Ajuda pontual autoriza exatamente uma ação e é consumida atomicamente; transferência altera o responsável, ajuda não altera.

<!-- completed-task-id:adbb9e74251d1293 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Concorrência, conexão e recuperação** — Encerrar atribuições somente com fechamento válido do turno; comandas e pendências operacionais continuam bloqueando o encerramento.

<!-- completed-task-id:ebcca0b2568b63eb -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Arquitetura de autorização** — Criar `table_service_sessions` com tenant, filial, turno, mesa, comanda, política e capacidades efetivas, versão, estado, ativador, abertura, encerramento e revogação.

<!-- completed-task-id:fced3c3ace4da79d -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Arquitetura de autorização** — Garantir uma única sessão de atendimento ativa por mesa; copiar a configuração para a sessão, mas permitir que desligamento emergencial do QR revogue tudo imediatamente.

<!-- completed-task-id:9c4399bcadcb364c -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Arquitetura de autorização** — Criar `qr_guest_sessions` por dispositivo validado, com sessão da mesa, método, hash do token, estado, validade, último uso, aprovador e revogação, sem fingerprint, geolocalização ou dado pessoal.

<!-- completed-task-id:e1dd39079b49ec67 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Arquitetura de autorização** — Entregar credencial aleatória em cookie `HttpOnly`, `Secure`, restrito e protegido contra CSRF; segredo não fica disponível ao JavaScript nem é armazenado em texto puro.

<!-- completed-task-id:dcd25925838ae75c -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Validação de presença** — Gerar código de seis dígitos com validade curta, hash, limite de tentativas e regeneração sem desconectar dispositivos já validados.

<!-- completed-task-id:04a6934224995d7f -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Validação de presença** — Validar rede por IPs/CIDRs de saída configurados e cabeçalhos inseridos somente por proxies confiáveis; não tentar obter SSID pelo navegador.

<!-- completed-task-id:cf7e69c4231279da -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Validação de presença** — Tratar rede como reforço opcional, mantendo código ou aprovação para filiais com IP variável, múltiplos links ou clientes em rede móvel.

<!-- completed-task-id:bcddc4e0bf184d54 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Comanda, pedidos e solicitações** — Vincular item QR à sessão do atendimento e à sessão pública que o criou, preservando `sourceChannel=qr`, autoria, idempotência e separação de `Seus pedidos`.

<!-- completed-task-id:2cb26d68c3060060 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Frontend** — Iniciar a área QR com `Como os clientes usarão o QR?`, quatro modos, uma frase de impacto e `Entender este modo`; recursos individuais permanecem recolhidos.

<!-- completed-task-id:75ac4a63998538b7 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Frontend** — Resumir presença como estado atual + `Alterar` + `Como funciona`; duração, tentativas e rede autorizada ficam em opções avançadas.

<!-- completed-task-id:f490ad1972022b55 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Frontend** — Abrir cardápio imediatamente; na primeira ação protegida, pedir confirmação por um dos métodos disponíveis sem exigir login, cadastro, app ou localização.

<!-- completed-task-id:c4098a3d5e13be2a -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Frontend** — Mostrar `Mesa confirmada`, estado e expiração em linguagem simples; após encerramento, preservar cardápio e explicar por que ações/comanda não estão mais disponíveis.

<!-- completed-task-id:684ebbb1f54c2152 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Segurança, confiabilidade e escala** — Não confiar livremente em `X-Forwarded-For`; restringir acesso direto à API ou aceitar cabeçalhos somente da cadeia de proxies configurada.

<!-- completed-task-id:5ed3285eb8501814 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Hardening do frontend** — Agrupar o pan do mapa pelo ciclo de pintura do navegador, reduzindo trabalho visual durante o gesto sem alterar a persistência final do layout.

<!-- completed-task-id:0c1f365ce36f599c -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Hardening do frontend** — No garçom, remover o limite silencioso de 24 produtos e manter busca sobre o catálogo completo carregado.

<!-- completed-task-id:1289c7392b38cb46 -->
- [x] **Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Recuperação de desastre** — Preparar scripts e runbooks para arquivamento de WAL, cópia externa, preflight de PITR e instalação do agendamento, sem ativar infraestrutura externa por suposição.

<!-- completed-task-id:ab717b7c874ca26d -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Frontend e operação diária** — Disponibilizar a rota `Equipe > Organização do atendimento` com atribuição acessível por lista e fila de ajuda gerencial protegida por PIN.

<!-- completed-task-id:9a6f008802162d78 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Frontend e operação diária** — Agrupar no garçom as mesas em `Minhas mesas`, `Livres` e `Outras mesas`.

## 2026-08-05

<!-- completed-task-id:4f9daa7367e796de -->
- [x] **Corte de escopo para o piloto de 06/08/2026 › Estado verificado em 03/08/2026** — Validar migrations `0027`, `0028` e a migration federada DoseClub em banco vazio e upgrade.

<!-- completed-task-id:2fef891d9d2ac4d2 -->
- [x] **Corte de escopo para o piloto de 06/08/2026 › Bloqueadores P0 ativos** — DoseClub: corrigir conversão `priceCents` para valor decimal do Asaas e nunca ativar assinatura/entitlement antes de webhook de pagamento confirmado.

<!-- completed-task-id:9beb78cf9a7857bc -->
- [x] **Corte de escopo para o piloto de 06/08/2026 › Bloqueadores P0 ativos** — DoseClub: implementar ingresso autenticado, assinado e idempotente do webhook Asaas ou manter cobrança SaaS integralmente desligada.

<!-- completed-task-id:e1c755e99ebad7ca -->
- [x] **Corte de escopo para o piloto de 06/08/2026 › Bloqueadores P0 ativos** — DoseClub: alinhar catálogo, preços e entitlements entre landing, backend e GiroMesa.

<!-- completed-task-id:742c64d2cabf67b6 -->
- [x] **Corte de escopo para o piloto de 06/08/2026 › Bloqueadores P0 ativos** — DoseClub: corrigir Google OAuth público; sem `client_id` vazio, callback localhost ou resposta Fastify não finalizada.

<!-- completed-task-id:6dd273e3bd3a6077 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.0 Congelamento e release reproduzível** — Validar instalação congelada, migration em banco vazio, upgrade do baseline e compatibilidade expand-migrate-contract antes do primeiro deploy.

<!-- completed-task-id:2636bb0a06ae1031 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.0 Congelamento e release reproduzível** — Tornar audit de dependências e Trivy bloqueantes para `CRITICAL`; `HIGH` exige exceção registrada com owner, justificativa e validade.

<!-- completed-task-id:aaf0f441a57e50db -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.0 Congelamento e release reproduzível** — Definir baseline de cobertura e impedir regressão em auth, tenant, RBAC, pedido, pagamento, caixa, QR, estoque, webhooks, ledger DoseClub e billing.

<!-- completed-task-id:44ba0e9a4564ec7f -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.1 Segurança P0 e isolamento** — Substituir senha previsível de novo tenant por convite de uso único, expiração, hash persistido, rate limit, auditoria e definição de senha pelo próprio usuário.

<!-- completed-task-id:a2354e2e1a6372b1 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.1 Segurança P0 e isolamento** — Manter públicos somente `/health` e `/health/ready` sanitizados; métricas, alertas, memória, topologia, nomes de estoque e dependências exigem autenticação de plataforma ou rede privada.

<!-- completed-task-id:6444742d7bec9c29 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.1 Segurança P0 e isolamento** — Desabilitar restore pelo backoffice até que execute em banco isolado, com backup verificável, dupla confirmação, permissão de plataforma e trilha append-only.

<!-- completed-task-id:f667776788934405 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.1 Segurança P0 e isolamento** — Remover qualquer fallback demo de tenant real; falha de API produz erro explícito, retry e contato de suporte, nunca conteúdo Bar Aurora ou dados sintéticos.

<!-- completed-task-id:be3279304c2379cf -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.1 Segurança P0 e isolamento** — Tornar onboarding do piloto `invite-only`; `ENABLE_TESTING_ENDPOINTS`, simuladores e criação demo ficam `false` em produção.

<!-- completed-task-id:65d321c604a8958d -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.1 Segurança P0 e isolamento** — Corrigir o validador DoseClub para rejeitar placeholder, segredo ausente, worker parado e integração marcada pronta sem health real.

<!-- completed-task-id:b158be3d52f0fb0e -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.1 Segurança P0 e isolamento** — Revisar logs de webhooks e autenticação para não registrar telefone, token, segredo, PAN, CVV, PIN ou PII desnecessária.

<!-- completed-task-id:9f717405b810b2e8 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento** — Persistir aceite append-only com documento, versão, hash, usuário/contexto, timestamp e origem; consentimentos opcionais permanecem separados e revogáveis.

<!-- completed-task-id:65b8a55d3fb874e8 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento** — Corrigir landing GiroMesa para preservar `?plan=starter|professional|premium`, renderizar a escolha inicial e revalidar preço/plano no backend.

<!-- completed-task-id:da6f0ca3e09fdea3 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento** — Remover do DoseClub “dezenas de estabelecimentos”, SLA sem medição, white-label completo, isolamento absoluto, gerente dedicado e automação não homologada.

<!-- completed-task-id:68510e5038973862 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento** — Unificar preços e produtos da landing DoseClub com o catálogo central; fallback nunca publica preço diferente do backend.

<!-- completed-task-id:c171128527b8d26c -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento** — Identificar ambos como programa piloto/acesso antecipado, sem depoimento, número, disponibilidade ou resultado não comprovado.

<!-- completed-task-id:8446e821aa0d66cb -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento** — Implementar política de cookies com rejeição/revogação para analytics e marketing; cookies estritamente essenciais permanecem documentados.

<!-- completed-task-id:89d5a693043d45a6 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento** — Aplicar age gate 18+ no DoseClub e em jornada QR com álcool, sem substituir a conferência humana pelo estabelecimento.

<!-- completed-task-id:2c2aae698779dafb -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento** — Comprovante operacional deve mostrar estabelecimento, CNPJ, filial, endereço, pedido/mesa, data/hora, itens, taxa opcional, descontos, pagamentos parciais/mistos, operador e a indicação `COMPROVANTE NÃO FISCAL` enquanto fiscal estiver desligado.

<!-- completed-task-id:158a5af9b7efab40 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento › Landing pages baseadas em evidência** — Preservar as logos oficiais e evoluir as duas landings incrementalmente; GiroMesa permanece claro e refinado nas superfícies comerciais, com produto operacional `dark-first`, enquanto DoseClub preserva a identidade navy premium.

<!-- completed-task-id:4ed2d39d4532f4e9 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento › Landing pages baseadas em evidência** — Remover logos de clientes, avaliações, contadores, urgência artificial, badge “Popular”, “mais escolhido”, SLA, resultado financeiro e qualquer estatística sem origem, período, metodologia e autorização comprováveis.

<!-- completed-task-id:12a98da627946cdf -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento › Landing pages baseadas em evidência** — Manter navegação pública rasa e previsível: Produto, Operação, Planos, DoseClub, Segurança, Ajuda, Entrar e CTA principal; o menu móvel deve oferecer os mesmos destinos.

<!-- completed-task-id:869429f2bcecd188 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento › Landing pages baseadas em evidência** — Preservar `produto`, `plano` e `origem` até o backend, que revalida catálogo, entitlement, preço e disponibilidade antes de criar trial ou cobrança.

<!-- completed-task-id:1dd7e48fbd73ab64 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento › Landing pages baseadas em evidência** — Integrar a landing DoseClub ao catálogo canônico; em indisponibilidade, ocultar o preço ou mostrar “Consulte condições”, nunca publicar outro valor fixo.

<!-- completed-task-id:582debec6d881357 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento › Landing pages baseadas em evidência** — Classificar integrações como `disponível`, `em piloto` ou `planejada` a partir de configuração real; conectores desativados não aparecem como benefício contratado.

<!-- completed-task-id:a2a1287f5e94de79 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.2 Comercial, landing, jurídico e consentimento › Landing pages baseadas em evidência** — Explicar sem ambiguidade GiroMesa independente, DoseClub independente, combo, estoque compartilhado opcional e acesso federado condicionado a entitlement.

<!-- completed-task-id:4653bc05f52a6c7d -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor** — Preservar logos e direção visual; corrigir apenas regressões comprovadas de hierarquia, densidade, contraste, responsividade, foco, teclado e touch.

<!-- completed-task-id:1d8737093c326067 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor** — Proprietário/gerente recebe próxima ação, saúde do turno, alertas acionáveis e comparação de filial; logs, filas, JSON, IDs e diagnósticos ficam no backoffice.

<!-- completed-task-id:7262ad95e726b0af -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor** — Caixa, garçom, cozinha/bar, recepção e estoque veem somente módulos e ações do perfil, filial, entitlement e feature flag atuais.

<!-- completed-task-id:567c52ac8543d97d -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor** — Integração desativada não gera botão decorativo; o administrador recebe estado `não configurada`, `em homologação`, `ativa`, `degradada` ou `revogada` e a contingência.

<!-- completed-task-id:48a02e7d0ea8c6f8 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor** — Onboarding do parceiro é retomável e termina somente com filial, horário, usuários, catálogo, estoque, mesas/QR, estações, impressão, caixa e suporte configurados.

<!-- completed-task-id:bb596e048063edd2 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor** — Consumidor QR vê estabelecimento/mesa corretos, preço/taxa, comanda, preparo, chamado, pré-conta, erro e indisponibilidade sem dados pessoais ou fallback demo.

<!-- completed-task-id:3bc54819c3a307d8 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor** — DoseClub explica e executa clube individual, combo, saldo em ml, consumo, estorno, idade e integração opcional, sem misturar pagamento do consumidor com assinatura SaaS.

<!-- completed-task-id:9573c1581c401db0 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Operação de pico e economia de interação** — Criar perfil por dispositivo com filial, modo inicial (`mesa`, `balcão`, `bar`, `caixa`, `KDS` ou `expedição`), estação, impressora e permissão para trocar de modo.

<!-- completed-task-id:cac0520bc3c7f452 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Operação de pico e economia de interação** — No garçom, manter mesa, total, estado e itens não enviados sempre visíveis; oferecer busca, categorias, favoritos, recentes e repetição de item em um toque.

<!-- completed-task-id:14a2e668c275ec21 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Operação de pico e economia de interação** — Manter ação principal na zona inferior do celular, feedback imediato, sincronização explícita e recuperação sem perda de rascunho em erro ou reconexão.

<!-- completed-task-id:34018d098238f935 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Operação de pico e economia de interação** — Unificar divisão/recebimento em um fluxo com modos por item, pessoa/assento, valor e partes iguais, mantendo total, recebido e restante visíveis em todas as etapas.

<!-- completed-task-id:eb6c6b2b1e9d6484 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Operação de pico e economia de interação** — Preservar os atalhos atuais do PDV, testar conflitos em campos/dialogs e exibir ajuda acessível; atalhos configuráveis ficam fora do gate do piloto.

<!-- completed-task-id:da9742c1d6a75cad -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Operação de pico e economia de interação** — Exigir rota válida `produto/categoria → estação KDS → impressora de contingência` antes de ativar uma estação; bebida, comida e expedição não podem depender de escolha manual a cada pedido.

<!-- completed-task-id:774eb91cc2af5f62 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Operação de pico e economia de interação** — Adicionar ou comprovar KDS de expedição, recall do último ticket e confirmação de entrega; permitir seleção, avanço, retorno e recall por teclado/bump bar sem touchscreen.

<!-- completed-task-id:95040272a2a9b04f -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Operação de pico e economia de interação** — Bloquear fechamento do turno enquanto existirem comandas, dinheiro de garçom, divergências, impressões, fiscal ou integrações pendentes, indicando a ação corretiva.

<!-- completed-task-id:0e39ef6532edbe80 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Operação de pico e economia de interação** — Em perda de internet, mostrar capacidade reduzida sem sucesso falso, bloquear mutações inseguras e orientar contingência por impressora, 4G ou procedimento manual; offline transacional completo permanece fora do piloto.

<!-- completed-task-id:ab921001e1555705 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Personalização controlada e marca do ecossistema** — Permitir logo da casa, capa, mensagem, cores dentro de faixas acessíveis, destaques, instruções, QR e modelos controlados; continuar proibindo CSS, script e fonte externa.

<!-- completed-task-id:852c22dffffa6fa3 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Personalização controlada e marca do ecossistema** — Manter “Tecnologia GiroMesa” discreto, acessível e imutável no QR; mostrar “DoseClub conectado” apenas quando integração e entitlement estiverem ativos.

<!-- completed-task-id:3c14e37ebd55fe09 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.3 Acabamento do produto para proprietário, equipe e consumidor › Personalização controlada e marca do ecossistema** — Não permitir que personalização esconda preço, termos, estado, indisponibilidade, consentimento, marca mínima ou ação de suporte.

<!-- completed-task-id:c9a137395f8f75b9 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › E-mail e autenticação** — Manter uma única `EMAIL_FROM`, remetente e `reply-to` reais; eliminar `example.com` dos workflows e exemplos de release.

<!-- completed-task-id:f6ba2d0cd4a5e880 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Cobrança SaaS, pagamentos operacionais e Dose Club** — Isolar Asaas em `platform_billing`, cobrando somente assinaturas GiroMesa, Dose Club e combo.

<!-- completed-task-id:5417c0bafb31a6ec -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Cobrança SaaS, pagamentos operacionais e Dose Club** — No DoseClub, converter `priceCents` para decimal antes de enviar `value`; testar explicitamente R$ 99,00 e R$ 299,00 e impedir ativação ao apenas criar a assinatura.

<!-- completed-task-id:a681f0d3e2b65f45 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Cobrança SaaS, pagamentos operacionais e Dose Club** — Implementar `POST /v1/webhooks/asaas/platform` com autenticação, persistência anterior ao processamento, idempotência, fila, reconciliação e ativação somente após evento financeiro confirmado.

<!-- completed-task-id:03bec3e493b0d2c0 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Cobrança SaaS, pagamentos operacionais e Dose Club** — Criar ledger neutro para dinheiro, Pix externo, crédito, débito, voucher, cortesia e outros.

<!-- completed-task-id:5370ff6e1a7f52c2 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Cobrança SaaS, pagamentos operacionais e Dose Club** — Registrar referência/NSU, operador, filial, auditoria, pagamento parcial, misto, estorno e divergência.

<!-- completed-task-id:205067047694d1ef -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Cobrança SaaS, pagamentos operacionais e Dose Club** — Completar a máquina de estados da intenção individual/combo; liberar saldo e entitlement somente após confirmação autorizada, idempotente e reconciliada.

<!-- completed-task-id:200a641d4449d64a -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Cobrança SaaS, pagamentos operacionais e Dose Club** — Manter arquitetura para conectores bancários opcionais por filial, sem exigir conta Asaas.

<!-- completed-task-id:26d922650e3de90a -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › TEF e conciliação de adquirentes** — Preservar o fluxo atual de terminal externo: método, valor, bandeira, NSU/código de autorização, operador, filial, divergência, estorno e conciliação manual auditada.

<!-- completed-task-id:ba9ac4658584a18a -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › WhatsApp não oficial** — No piloto, usar `WHATSAPP_TRANSPORT=disabled` e CTA manual `wa.me`; automação Web/QR não é gate e só pode ser ativada após decisão jurídica documentada e aceite explícito do risco.

<!-- completed-task-id:77c1c168dd14abe2 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › WhatsApp não oficial** — Nenhuma confirmação de pedido, pagamento, reserva, consumo ou segurança depende de WhatsApp; e-mail, interface e procedimento humano são contingências obrigatórias.

<!-- completed-task-id:4de119f446bc0212 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Hardware, fiscal e infraestrutura** — Corrigir cancelamento Focus para respeitar o ambiente configurado; nunca cair silenciosamente de produção para homologação.

<!-- completed-task-id:9c4094791bec2f46 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Hardware, fiscal e infraestrutura** — Enquanto iFood estiver desativado, usar o Gestor de Pedidos e lançamento manual com origem externa, chave de correlação e proteção contra duplicidade.

<!-- completed-task-id:77ca8788a6976ed6 -->
- [x] **Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias** — Lint, typecheck, unitários, integração PostgreSQL, migrations em banco vazio, build.

<!-- completed-task-id:193947d26e102bf2 -->
- [x] **Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias** — Isolamento multitenant, concorrência, idempotência e perda/reconexão de rede.

<!-- completed-task-id:0be06de84b831b11 -->
- [x] **Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias** — QR público: token, rotação, personalização, timeline, chamados, comanda e ausência de PII.

<!-- completed-task-id:c81ceabb9daa8605 -->
- [x] **Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias** — Pagamentos: Asaas rejeitado no fluxo operacional; cobrança SaaS não altera comanda.

<!-- completed-task-id:0ac7a8f2fcef7468 -->
- [x] **Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias** — Dose Club: compra individual, combo, confirmação, concorrência, retry, estorno e isolamento.

<!-- completed-task-id:69950cb94850f6ab -->
- [x] **Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias** — Testar rotas públicas legais, versão/hash de aceite, cookies, age gate, contato e ausência de claims/preços inconsistentes.

<!-- completed-task-id:6322a2ee830633fd -->
- [x] **Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias** — Testar senha de provisionamento, convite, reset, MFA, sessões, rate limit, IDOR, CSRF, XSS, SSRF, HMAC/replay, QR rotacionado e webhook duplicado.

<!-- completed-task-id:a42839658dbda474 -->
- [x] **Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias** — Testar health público sanitizado e acesso negado a métricas, alertas, backup e backoffice sem permissão/MFA.

<!-- completed-task-id:aa46d19c40709c65 -->
- [x] **APIs, dados e tipos novos › Jurídico e comunicação** — Criar `LegalDocumentVersion` e `LegalAcceptance` append-only no GiroMesa, equivalentes ao histórico já existente no DoseClub, sem guardar conteúdo livre do cliente.

<!-- completed-task-id:3d0708777eb6a153 -->
- [x] **APIs, dados e tipos novos › Jurídico e comunicação** — Criar eventos de entrega Resend para mensagem, provider id, estado, tentativa, timestamp e erro sanitizado; bounce/complaint alimenta supressão, não reenvio infinito.

<!-- completed-task-id:78e0334b4d9d0985 -->
- [x] **APIs, dados e tipos novos › Jurídico e comunicação** — Manter versão e hash dos documentos em código/configuração revisada; publicação jurídica é separada de alteração arbitrária pelo tenant.

<!-- completed-task-id:cec759341f2453bc -->
- [x] **APIs, dados e tipos novos › Cobrança e pagamentos** — Separar `PlatformBilling` de `RestaurantPayments` em módulos, permissões e webhooks.

<!-- completed-task-id:aa72c6b59c69b64c -->
- [x] **APIs, dados e tipos novos › Cobrança e pagamentos** — Garantir idempotência, auditoria, tenant, filial, operador e concorrência em confirmações/estornos.

<!-- completed-task-id:8ea0a8225b626983 -->
- [x] **APIs, dados e tipos novos › Cobrança e pagamentos** — Preservar registros operacionais Asaas existentes como legado, sem permitir novos registros.

<!-- completed-task-id:c749faf567694210 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Capacidade cloud** — Executar API sem estado em pelo menos duas instâncias atrás do proxy reverso.

<!-- completed-task-id:2c2b06033964a3a1 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Capacidade cloud** — Separar API, workers, PostgreSQL e Redis, com pools, limites e métricas explícitos.

<!-- completed-task-id:42aded8e79b96ba6 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Capacidade cloud** — Garantir idempotência para lançamento, pagamento, cancelamento e fechamento.

<!-- completed-task-id:c1e477d135895089 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Capacidade cloud** — Manter operação com uma instância da API indisponível e sem dependência de sessão armazenada no processo.

<!-- completed-task-id:cd7f8e7deae75618 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Hardening do frontend** — Tipar eventos realtime por filial, agregado, mesa, pedido e estação; cada tela ignora eventos não relacionados e faz sincronização completa apenas na abertura ou reconexão.

<!-- completed-task-id:65ec613a7f20ac68 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Hardening do frontend** — Agrupar rajadas, impedir requisições sobrepostas e impedir resposta antiga de substituir estado mais recente.

<!-- completed-task-id:227123391639ef2a -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Hardening do frontend** — No salão, mover visualmente por `requestAnimationFrame`, confirmar o layout ao finalizar o arraste, memorizar mesas e substituir `JSON.stringify` por dirty flag.

<!-- completed-task-id:307c412d99d02625 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Hardening do frontend** — No PDV, buscar clientes no servidor e atualizar somente a comanda afetada.

<!-- completed-task-id:4fdbc7151977bfa4 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Hardening do frontend** — No KDS, carregar tickets ativos da estação vinculada e aplicar deltas sem recarregar toda a produção a cada evento.

<!-- completed-task-id:dd15cf48c2bb20e7 -->
- [x] **Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Escrita durável e reconciliação** — Gerar e persistir a chave idempotente no dispositivo antes da primeira tentativa de toda mutação operacional crítica; timeout ou reconexão nunca gera uma chave nova.

<!-- completed-task-id:074615b03c41f6df -->
- [x] **Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Escrita durável e reconciliação** — Retornar recibo técnico de confirmação com identificador da operação, versão e horário do servidor; a interface só apresenta sucesso definitivo após esse recibo.

<!-- completed-task-id:68090c9aeabb6b0a -->
- [x] **Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Escrita durável e reconciliação** — Reconciliar respostas perdidas consultando a operação pela chave idempotente, sem repetir efeitos; impedir alteração do payload em reenvio da mesma chave.

<!-- completed-task-id:0fa331e74b1be5ba -->
- [x] **Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Escrita durável e reconciliação** — Aplicar idempotência, ordenação e controle de concorrência a pedido, item, envio à produção, desconto, cancelamento, transferência, pagamento, fechamento e estoque.

<!-- completed-task-id:70bc17de34b0093d -->
- [x] **Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Escrita durável e reconciliação** — Manter dados comerciais, evento operacional, outbox e auditoria na mesma transação sempre que representarem uma única ação do operador.

<!-- completed-task-id:942948081d8aeb26 -->
- [x] **Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Escrita durável e reconciliação** — Criar matriz de cobertura que prove que toda mutação crítica possui confirmação, idempotência, auditoria e uma estratégia explícita de recuperação.

<!-- completed-task-id:6dc5863207964e43 -->
- [x] **Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Testes e Gate A2** — Simular resposta perdida depois do commit e comprovar reenvio com a mesma chave sem duplicação de item, pagamento, baixa de estoque ou ticket de produção.

<!-- completed-task-id:0abb40417a622e6a -->
- [x] **Adendo de campo — piloto F1 Boteco › A2 — preservação de lançamentos e histórico › Testes e Gate A2** — Demonstrar que histórico não pode ser apagado pela interface operacional e que ações administrativas autorizadas permanecem auditadas.

<!-- completed-task-id:840e8ba27ea89dc4 -->
- [x] **Adendo de campo — piloto F1 Boteco › A3 — operação em nuvem e continuidade BYOD › Continuidade segura no navegador** — Conectar a outbox local tipada às mutações críticas somente depois de existir recibo técnico e consulta por chave idempotente no servidor.

<!-- completed-task-id:3e9945074b077bb1 -->
- [x] **Adendo de campo — piloto F1 Boteco › A3 — operação em nuvem e continuidade BYOD › Continuidade segura no navegador** — Exibir pendente, confirmado, rejeitado e precisa de intervenção, preservando a mesma chave em reload, troca de rede e reenvio.

<!-- completed-task-id:0eff0898759641cc -->
- [x] **Adendo de campo — piloto F1 Boteco › A3 — operação em nuvem e continuidade BYOD › Gate A3** — Navegador nunca devolve dado autenticado de sessão anterior e nunca confirma operação apenas local como concluída.

<!-- completed-task-id:bcb78e31ef0c0f4e -->
- [x] **Adendo de campo — piloto F1 Boteco › A3 — operação em nuvem e continuidade BYOD › Gate A3** — A continuidade cloud passa por reload, perda e retorno de rede com reconciliação idempotente; o Hub só entra no gate após possuir especificação e homologação próprias.

<!-- completed-task-id:c55f24a9d26c21d0 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Dados e regras centrais** — Criar validação central reutilizada por abertura, lançamento, cancelamento, envio à produção, transferência e demais mutações da comanda; frontend nunca é a barreira de segurança.

<!-- completed-task-id:17c3a455668533ef -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Arquitetura de autorização** — Fechar, liberar ou transferir a mesa revoga as credenciais antigas; QR da nova mesa exige nova validação. Grupo de mesas define uma mesa pública principal.

<!-- completed-task-id:d3b523be3caea862 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Validação de presença** — Direcionar aprovação ao responsável B1; sem responsável, encaminhar à fila gerencial ou recepção configurada.

<!-- completed-task-id:5bc32b62d318f3ad -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Comanda, pedidos e solicitações** — No fluxo revisado, exibir recebido, em conferência, aceito, preparando, pronto, entregue ou recusado; somente após aceite enviar às estações configuradas.

<!-- completed-task-id:efaf8ecc57bca2ce -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Comanda, pedidos e solicitações** — No fluxo direto, reutilizar o roteamento existente de KDS/impressão; produtos alcoólicos continuam exigindo validação humana antes da produção.

<!-- completed-task-id:101e54aee28aa588 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Comanda, pedidos e solicitações** — Permitir chamado, motivo, pré-conta, divisão pretendida e preferência de pagamento como solicitação estruturada; isso nunca registra pagamento, altera saldo ou fecha mesa.

<!-- completed-task-id:d5b5e77b834848d5 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Comanda, pedidos e solicitações** — Aplicar cooldown e uma solicitação equivalente ativa por mesa; responsável B1 recebe primeiro, com contingência para gerente/recepção.

<!-- completed-task-id:cf1cc3f7fff3fece -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Frontend** — Oferecer prévia/simulação antes da publicação sem gerar ações operacionais reais.

<!-- completed-task-id:bbfb5e8b94f1594c -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Frontend** — Na aprovação, mostrar mesa, horário e ação; confirmar com um toque e manter o cliente informado enquanto aguarda, usando realtime com contingência.

<!-- completed-task-id:214f805150a16309 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Segurança, confiabilidade e escala** — Substituir rate limit em memória por limite distribuído em Redis, combinando sessão, mesa, IP e ação sem registrar tokens completos.

<!-- completed-task-id:aeee938fdd16f3c4 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Segurança, confiabilidade e escala** — Aplicar cooldown progressivo, bloqueio de força bruta, origem confiável, CSRF, política de referrer e minimização de payload/logs.

<!-- completed-task-id:f7aa7d1ea1d76ec0 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Segurança, confiabilidade e escala** — Manter carrinho local, mas reenviar apenas com a mesma chave idempotente e a sessão ainda válida; reconciliar timeout antes de novo envio.

<!-- completed-task-id:606f77b2b6a2e6a4 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Segurança, confiabilidade e escala** — Nunca aplicar pedido pendente a uma ocupação posterior da mesa.

<!-- completed-task-id:92d765ae8344224c -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Segurança, confiabilidade e escala** — Consolidar o realtime público para evitar consulta periódica completa por conexão; dimensionar para 120 mesas, 12 operadores e até cinco dispositivos por mesa.

<!-- completed-task-id:73e53738839862dd -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Gate B2** — Gate: QR permanente sozinho não executa ação protegida; toda ação pertence à sessão vigente, é idempotente e auditável; encerramento revoga acesso imediatamente.

<!-- completed-task-id:24f852d936094f0e -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Estrutura da filial e modelo central** — Criar `Configurações > Estrutura da filial`, separando Salão, Produção e Estoque, com atalhos contextuais nos módulos correspondentes.

<!-- completed-task-id:98134f35aeffbfee -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Estrutura da filial e modelo central** — Permitir criar, renomear e arquivar locais de estoque por filial; local com histórico nunca é apagado e permissões definem quem movimenta, recebe, confere ou aprova.

<!-- completed-task-id:f952624d738f84fd -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Estrutura da filial e modelo central** — Corrigir consultas e políticas para saldo por tenant, filial, item e localização, preservando o consolidado da filial apenas como visão derivada.

<!-- completed-task-id:1efbfca0938b67fe -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Estrutura da filial e modelo central** — Criar transferência com cabeçalho, linhas, origem, destino, responsáveis, motivo, status, versão e chave idempotente; confirmação gera saída e entrada vinculadas de forma indivisível.

<!-- completed-task-id:bf86be08cb5c89f6 -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Estrutura da filial e modelo central** — Suportar `Rascunho`, `Aguardando recebimento`, `Concluída` e `Cancelada`; operação concluída recebe estorno auditado em vez de edição ou exclusão.

<!-- completed-task-id:e469dac3e5b2669f -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Fluxo híbrido e retornáveis** — Permitir transferência imediata ou conferida conforme regra da filial, setor, quantidade e tipo; estoque em trânsito permanece visível até o recebimento.

<!-- completed-task-id:78714af4176ca0d0 -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Fluxo híbrido e retornáveis** — No recebimento, registrar quantidade enviada, recebida, divergência, motivo e responsáveis; limites configuráveis encaminham exceções para aprovação gerencial.

<!-- completed-task-id:86320ea9b5ccdf42 -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Fluxo híbrido e retornáveis** — Representar garrafas, engradados, barris e outros retornáveis no mesmo ledger de estoque, identificados como itens retornáveis e sem serializar cada unidade física.

<!-- completed-task-id:d65c2296c188f3c9 -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Fluxo híbrido e retornáveis** — Mapear produto para retornável esperado; venda ou consumo confirmado reduz o produto cheio e gera o vazio esperado somente quando a embalagem estiver configurada.

<!-- completed-task-id:c69c7f1dbd57e5ce -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Fluxo híbrido e retornáveis** — Implementar troca com fornecedor como operação vinculada de vazios entregues e produtos cheios recebidos, preservando quebras, extravios e conferências.

<!-- completed-task-id:083ea3e1997aae24 -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Fluxo híbrido e retornáveis** — Na integração Dose Club, gerar retornável somente quando o consumo confirmado estiver associado à embalagem configurada; retry nunca duplica baixa ou vasilhame.

<!-- completed-task-id:e0cf51e316ac516f -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Frontend e operação diária** — Abrir Estoque com as tarefas `Transferir produtos`, `Receber fornecedor`, `Conferir um setor` e `Controlar vasilhames`, deixando histórico e detalhes técnicos em camada secundária.

<!-- completed-task-id:f6533c4120cb5f25 -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Frontend e operação diária** — Criar transferência em quatro passos: origem, destino, itens/quantidades e revisão; mostrar linguagem operacional como `Depósito → Geladeira do bar`.

<!-- completed-task-id:89a25aa34027f68b -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Frontend e operação diária** — Na conferência, comparar quantidade do sistema, quantidade contada e diferença; permitir busca e futuro leitor de código de barras sem torná-lo dependência inicial.

<!-- completed-task-id:f9601e41db33eb35 -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Frontend e operação diária** — Mostrar em Vasilhames: vazios esperados, conferidos, disponíveis para troca, quebrados/extraviados e última troca com fornecedor.

<!-- completed-task-id:614213b5335882fd -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Frontend e operação diária** — Adaptar fluxos a desktop, tablet e celular; cada perfil vê somente os locais e ações permitidos na filial atual.

<!-- completed-task-id:bf165072dafa7702 -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Segurança, confiabilidade e Gate C1** — Proteger saldo e transferência com transação de banco de dados, bloqueio por item/local, versão, idempotência e política explícita para saldo negativo.

<!-- completed-task-id:ac05339310d1820c -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Segurança, confiabilidade e Gate C1** — Atualizar saldos e pendências em tempo real com sincronização de contingência; operação incerta permanece visível e reconciliável, nunca é repetida silenciosamente.

<!-- completed-task-id:dead9a6ad6cfe8ed -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Segurança, confiabilidade e Gate C1** — Cobrir transferência imediata e conferida, recebimento parcial, divergência, estorno, troca com fornecedor, quebra, concorrência e retry após resposta perdida.

<!-- completed-task-id:34e07a4a85298955 -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Segurança, confiabilidade e Gate C1** — Cobrir isolamento entre tenants/filiais, permissões, auditoria, 12 operadores simultâneos e integração GiroMesa/Dose Club sem baixa ou retornável duplicado.

<!-- completed-task-id:735842856d91a659 -->
- [x] **Adendo de campo — piloto F1 Boteco › C1 — estoque por setor, transferências e vasilhames › Segurança, confiabilidade e Gate C1** — Gate: todo saldo por setor permanece correto e auditável; nenhuma transferência fica aplicada somente em um lado; cheios, vazios e divergências são reconciliáveis.

<!-- completed-task-id:ecb43c2cd9e21818 -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Regras configuráveis e cálculo** — Oferecer por filial `Responsável pela mesa`, `Autoria de cada lançamento` e `Fundo coletivo por turno`; o F1 inicia por autoria e novas filiais recebem escolha explicada.

<!-- completed-task-id:d8f79518052df9b9 -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Regras configuráveis e cálculo** — Configurar percentual e base da taxa sugerida como consumo líquido, consumo bruto ou lançamento manual; padrão inicial é 10% sobre consumo líquido.

<!-- completed-task-id:16399db71cc0f4dc -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Regras configuráveis e cálculo** — Apurar vendas brutas, cancelamentos, descontos, consumo líquido, taxa sugerida, taxa recebida, valor para rateio, pagamentos pendentes e ajustes em centavos.

<!-- completed-task-id:d32be34225b5eea4 -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Regras configuráveis e cálculo** — Distribuir apenas taxa efetivamente recebida; pagamento parcial/misto rateia de modo determinístico e transferência da mesa nunca reescreve autoria passada.

<!-- completed-task-id:6b9b8c8fd5ad3db1 -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Regras configuráveis e cálculo** — Guardar a regra efetiva e os componentes do cálculo no fechamento para que alterações futuras da filial não modifiquem turnos antigos.

<!-- completed-task-id:97693abfa0751546 -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Fluxo de fechamento e frontend** — Criar `Equipe > Fechamento do turno`, com atalho no caixa e no encerramento do turno; listar garçom, vendas, serviço recebido, dinheiro pendente e próxima ação.

<!-- completed-task-id:09f411d58f18720d -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Fluxo de fechamento e frontend** — Detalhar vendas, descontos, cancelamentos, formas de pagamento, mesas, ajuda, dinheiro, perdas e comissões sem expor dados de colegas ao perfil garçom.

<!-- completed-task-id:c7991ed48c66b73a -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Fluxo de fechamento e frontend** — Implementar `Em apuração`, `Aguardando conferência`, `Conferido`, `Fechado` e `Reaberto para correção`; fechamento e reabertura exigem idempotência e auditoria.

<!-- completed-task-id:f3209328477a65ea -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Fluxo de fechamento e frontend** — Tornar confirmação do garçom configurável; gerente pode fechar sem ela apenas com permissão e motivo. Dinheiro pendente de entrega ao caixa bloqueia o fechamento.

<!-- completed-task-id:2bf794569db0b978 -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Fluxo de fechamento e frontend** — Gerar comprovante térmico, PDF e planilha a partir do mesmo snapshot; exportação para folha permanece desabilitada até validação contábil/jurídica da regra da filial.

<!-- completed-task-id:c1c075ad38dc7465 -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Segurança, testes e Gate D1** — Proteger apuração e fechamento com versão, bloqueio por garçom/turno e chave idempotente; fechar duas vezes nunca duplica valores.

<!-- completed-task-id:9239ffb40272aeca -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Segurança, testes e Gate D1** — Cobrir ajuda e transferência, desconto/cancelamento aprovado, serviço recusado, pagamento parcial/misto, arredondamento, dinheiro pendente, reabertura e mudança posterior de configuração.

<!-- completed-task-id:98cca370a129eb80 -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Segurança, testes e Gate D1** — Cobrir isolamento entre tenants, filiais e perfis, fechamento simultâneo de 12 garçons e igualdade entre tela, térmica, PDF e planilha.

<!-- completed-task-id:7e3df31fe0d2caf1 -->
- [x] **Adendo de campo — piloto F1 Boteco › D1 — fechamento por garçom e turno › Segurança, testes e Gate D1** — Gate: cada fechamento é reproduzível, imutável sem reabertura auditada e distingue venda, serviço sugerido, serviço recebido, comissão e pendências sem executar folha.

<!-- completed-task-id:f00be0d585e9213d -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Limite do produto e modelo** — Criar ocorrência vinculada a tenant, filial, turno, mesa, comanda, responsável B1 no instante, autores envolvidos, valores imutáveis, tipo, relato, status e auditoria.

<!-- completed-task-id:8189f0a855cf00ac -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Limite do produto e modelo** — Preencher saldo não pago, valor de cardápio, serviço sugerido e pagamentos realizados; complementos entram no histórico e não reescrevem os fatos originais.

<!-- completed-task-id:b448310bdfd74f0c -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Análise gerencial e frontend** — Disponibilizar `Registrar ocorrência` na mesa, comanda, caixa e fechamento; tipos são saída sem pagar, pagamento recusado, erro operacional, suspeita de fraude, divergência de caixa e outro.

<!-- completed-task-id:58c7ef7c15d21df9 -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Análise gerencial e frontend** — Implementar `Registrada`, `Em análise`, `Aguardando informações`, `Concluída` e `Valor recuperado`, com relato do funcionário, observações e evidências autorizadas.

<!-- completed-task-id:32e8d07dcd23149f -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Análise gerencial e frontend** — Permitir decisões `Perda da casa`, `Valor recuperado`, `Sem responsabilidade individual` ou `Encaminhada para análise externa`, sem campo operacional de culpado.

<!-- completed-task-id:2119f934238fedbd -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Análise gerencial e frontend** — Mostrar no D1 quantidade, saldo não pago, valor de referência e situação, sempre fora dos totais a pagar ao funcionário.

<!-- completed-task-id:455884ab4598f31a -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Análise gerencial e frontend** — Exibir em tela, impressão e exportação: `Documento informativo. Não realiza desconto salarial nem substitui análise jurídica, trabalhista ou administrativa.`

<!-- completed-task-id:38304b0789af8c68 -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Análise gerencial e frontend** — Versionar regra interna da filial com responsável, vigência e aceite administrativo; mudança futura não altera ocorrência anterior.

<!-- completed-task-id:8e4a47af826f620f -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Segurança, testes e Gate D2** — Garantir uma ocorrência ativa equivalente por comanda, criação idempotente, RBAC, isolamento multitenant/filial e trilha append-only de mudanças e acessos sensíveis.

<!-- completed-task-id:ba9eebda98fe3e91 -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Segurança, testes e Gate D2** — Ao receber pagamento posterior, reconciliar a ocorrência como valor recuperado sem apagar o histórico nem duplicar caixa, pagamento ou fechamento.

<!-- completed-task-id:577d846e7eb3c6db -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Segurança, testes e Gate D2** — Cobrir transferência/ajuda, autoria B1, pagamento parcial/tardio, concorrência, duplicidade, reabertura do turno, regra alterada e exportação sem desconto implícito.

<!-- completed-task-id:edde5708a3ebd864 -->
- [x] **Adendo de campo — piloto F1 Boteco › D2 — ocorrência de consumo não pago › Segurança, testes e Gate D2** — Gate: ocorrência preserva fatos e decisão gerencial, aparece separada no D1 e jamais altera automaticamente remuneração, folha ou valor devido ao trabalhador.

<!-- completed-task-id:dea6988bfc394535 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Modelos e apuração** — Criar políticas versionadas com vigência, filial, elegibilidade, período, base, atribuição, faixas, aplicação integral ou progressiva, bônus e exceção por funcionário.

<!-- completed-task-id:ed005168fa04f2a7 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Modelos e apuração** — Explicar e simular a política antes da ativação; dados históricos da simulação não geram comissão nem alteram fechamento.

<!-- completed-task-id:1d9c737fe6e8b9ad -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Modelos e apuração** — Exibir durante o período vendas válidas, faixa atual, próxima meta, estimativa e valores pendentes; consolidar somente após período, turnos e pagamentos elegíveis.

<!-- completed-task-id:e093ef93af8b7248 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Modelos e apuração** — Tratar estorno posterior como ajuste identificado em período seguinte; alteração retroativa exige permissão, justificativa e nova apuração auditada.

<!-- completed-task-id:54a931cdeaf1dc4e -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Registro administrativo e visão financeira** — Implementar `Em apuração`, `Aprovado`, `Pagamento parcial`, `Registrado como pago` e `Cancelado ou ajustado`, separando serviço, partnership e demais componentes.

<!-- completed-task-id:6afef6e53bdaf019 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Registro administrativo e visão financeira** — Registrar valor, saldo, data/hora, forma, referência, observação, usuário, comprovante opcional e confirmação opcional do funcionário.

<!-- completed-task-id:d853f13249edb510 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Registro administrativo e visão financeira** — Exibir que o pagamento foi informado pelo estabelecimento e não processado ou verificado pelo GiroMesa; correção ocorre por estorno, nunca exclusão silenciosa.

<!-- completed-task-id:f7f0e2618a8691c0 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Registro administrativo e visão financeira** — Permitir vínculo opcional de pagamento em dinheiro à saída do caixa; Pix e transferência permanecem `Não conciliado com banco` até conferência ou E2.

<!-- completed-task-id:70e5fa4e78124896 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Registro administrativo e visão financeira** — Levar aos relatórios receita recebida, serviço destinado à equipe, partnership previsto/aprovado/pago, perdas D2, pendências e resultado operacional estimado.

<!-- completed-task-id:ee4473b129aeb6f6 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Registro administrativo e visão financeira** — Tratar serviço recebido como valor destinado à equipe, não receita própria; parceria entra como custo gerencial e ocorrência D2 como perda operacional da casa.

<!-- completed-task-id:50a3559b6fd57d74 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Segurança, testes e Gate D3** — Proteger política, apuração, aprovação, pagamento e estorno com RBAC, versão, idempotência, auditoria e isolamento multitenant/filial.

<!-- completed-task-id:c4177e6a95809d9b -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Segurança, testes e Gate D3** — Cobrir faixas integrais/progressivas, limites exatos, parcial, estorno, política nova, exceção individual, pagamento maior que saldo, vínculo ao caixa e valor não conciliado.

<!-- completed-task-id:4f74a3168bd86712 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Segurança, testes e Gate D3** — Garantir igualdade entre D1, relatório financeiro, comprovante e exportação; não criar pagamento bancário, folha ou obrigação contábil automática.

<!-- completed-task-id:3fbd0385503a2db5 -->
- [x] **Adendo de campo — piloto F1 Boteco › D3 — partnership e comissões configuráveis › Segurança, testes e Gate D3** — Gate: toda comissão explica base, regra, faixa, período, versão, apurado, aprovado, pago e pendente; caixa e relatórios refletem somente lançamentos explicitamente vinculados.

<!-- completed-task-id:da5872959b7f3e9a -->
- [x] **Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Modelo comercial e arquitetura multitenant** — Substituir o token global de emissão por referência segura ao token principal e por credenciais cifradas de cada filial, sem segredo no navegador, log, banco em claro ou Git.

<!-- completed-task-id:af7b8a1ed37ed093 -->
- [x] **Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Modelo comercial e arquitetura multitenant** — Manter vínculo auditável entre tenant, filial, empresa Focus, ambiente, emitente, certificado, token, série, numeração, ativação e consumo da franquia.

<!-- completed-task-id:e1f0821bad441002 -->
- [x] **Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Onboarding guiado do proprietário e contador** — Proprietário inicia a ativação fiscal, confirma os dados empresariais e convida o contador por acesso temporário, restrito à configuração fiscal daquela filial.

<!-- completed-task-id:7d5872e170bb3dc1 -->
- [x] **Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Onboarding guiado do proprietário e contador** — Contador informa ou valida CNPJ, IE, regime, endereço, credenciamento SEFAZ, CSC e ID, série/numeração, NCM, CFOP, CEST quando aplicável, origem, CST/CSOSN, IBS/CBS e regras.

<!-- completed-task-id:a308d56a842a9c42 -->
- [x] **Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Onboarding guiado do proprietário e contador** — Mostrar apenas estados orientados à ação — `Faltam dados`, `Aguardando contador`, `Em homologação`, `Pronto para produção` e `Ação necessária` — com detalhes técnicos expansíveis e trilha de auditoria.

<!-- completed-task-id:2effb9f71f93c5ec -->
- [x] **Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Homologação antes da contratação e ativação de produção** — Cobrir contratos, mapeamento, rejeições, duplicidade, timeout, concorrência e indisponibilidade com simulador e testes internos independentes da Focus.

<!-- completed-task-id:8086d1b256f61397 -->
- [x] **Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Homologação antes da contratação e ativação de produção** — Manter `FISCAL_PRODUCTION_ENABLED=false` e bloqueio adicional por filial enquanto o ambiente estiver em homologação, ainda que exista token de produção.

<!-- completed-task-id:52651a25b8ce9c23 -->
- [x] **Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Homologação antes da contratação e ativação de produção** — Corrigir cancelamento para respeitar o ambiente do documento e implementar webhook idempotente com consulta periódica como contingência.

<!-- completed-task-id:c793fa1fa744fd53 -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Núcleo único e oferta por nível de automação** — Criar uma única intenção de pagamento para comanda, balcão e delivery, com adaptadores de execução `manual`, `smartpos` e `tef`; conciliação de recebíveis permanece um processo posterior e independente da autorização na maquininha.

<!-- completed-task-id:cad2f23fc9a6ff47 -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Núcleo único e oferta por nível de automação** — Controlar as capacidades por entitlement e por filial, sem bifurcar PDV ou regras de pagamento por plano: operação universal no nível essencial, SmartPOS no profissional e SmartPOS + TEF + conciliação automática no nível enterprise.

<!-- completed-task-id:d97740f9a99909f6 -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Núcleo único e oferta por nível de automação** — Preservar pagamento manual com maquininha externa como contingência em todos os planos, inclusive quando uma integração estiver indisponível.

<!-- completed-task-id:ae94171028164a80 -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Experiência operacional simples** — Manter uma única ação `Receber` para garçom e caixa. A interface mostra valor total ou parcial, meios utilizados, terminal disponível e resultado; termos como TEF, PinPad, adquirente e NSU ficam na configuração administrativa, com explicação curta e detalhes técnicos expansíveis.

<!-- completed-task-id:0b7885dd5b654424 -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Experiência operacional simples** — Criar onboarding por filial com quatro respostas compreensíveis: maquininhas portáteis comuns, maquininhas inteligentes integradas, caixas fixos com PinPad ou combinação.

<!-- completed-task-id:8f6546462387b967 -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Experiência operacional simples** — Permitir selecionar itens ou valor, dividir entre pessoas e combinar dinheiro, Pix, débito, crédito, voucher e outros meios sem duplicar o pagamento ou fechar a comanda antes da confirmação válida.

<!-- completed-task-id:2627bba2c9cd588f -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Experiência operacional simples** — No modo manual, registrar operador, mesa/comanda, valor, método, horário, terminal e, quando informado, NSU ou autorização; nunca exigir referência que impeça a contingência.

<!-- completed-task-id:12a68e2cbb219142 -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › SmartPOS para cobrança móvel e TEF para caixa fixo** — Tratar `aguardando cliente`, `autorizado`, `confirmado`, `negado`, `cancelado`, `resultado desconhecido` e `estornado`; resultado desconhecido exige consulta antes de nova cobrança e toda repetição usa a mesma idempotency key.

<!-- completed-task-id:9d1db5a5e3ec075e -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › SmartPOS para cobrança móvel e TEF para caixa fixo** — Não armazenar número, trilha, senha ou dado sensível do cartão. GiroMesa guarda apenas identificadores operacionais permitidos, como adquirente, terminal, bandeira, parcelas, NSU, autorização e referências de conciliação retornadas pelo provedor.

<!-- completed-task-id:26ac60edb0a77703 -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Conciliação financeira e gate do piloto** — Oferecer três níveis de conferência sem confundi-los com estoque: registro manual no essencial, importação assistida de extrato no profissional e API automática no enterprise.

<!-- completed-task-id:91183407cc645d7b -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Conciliação financeira e gate do piloto** — Mostrar ao proprietário e gerente somente exceções e totais úteis no fechamento; detalhes técnicos e arquivos de origem ficam em uma área de conferência expansível.

<!-- completed-task-id:64cbba0eb45ef33c -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › TEF e conciliação de adquirentes** — Implementar timeout, consulta, cancelamento e repetição idempotente sem armazenar ou registrar PAN completo, CVV ou PIN.

<!-- completed-task-id:97eabbaa5f8900be -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Backoffice, observabilidade e suporte** — Não implementar impersonação silenciosa; suporte começa read-only e qualquer ação excepcional exige motivo, elevação temporária e auditoria visível.

<!-- completed-task-id:01ea6170bb8275b3 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Backoffice, observabilidade e suporte** — Definir alertas: SEV-1 para perda/vazamento/cobrança/acesso cruzado; SEV-2 para PDV, caixa, KDS ou consumo indisponível; SEV-3 para função com contingência.

<!-- completed-task-id:4e0b18f62c248a32 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Gate** — A UI operacional não exibe conector desativado como opção funcional; o administrador vê estado, dependência, contingência e responsável pela ativação.

<!-- completed-task-id:a9bc3295dac25eff -->
- [x] **Fase 10 — fundação Enterprise Premium › Regra global de UX — informação em camadas** — Exibir por padrão estado atual, resumo de impacto e ação principal; mover exceções raras para `Entender esta opção` ou `Opções avançadas`.

<!-- completed-task-id:063f4c9f6ba9fed2 -->
- [x] **Fase 10 — fundação Enterprise Premium › Regra global de UX — informação em camadas** — Usar painéis laterais curtos e ajuda contextual em vez de preencher telas com textos permanentes; manter glossário e manual pesquisável para aprofundamento.

<!-- completed-task-id:953c93c82db7b80f -->
- [x] **Fase 10 — fundação Enterprise Premium › Regra global de UX — informação em camadas** — Adaptar explicações e ações ao perfil: operação diária não recebe conteúdo técnico administrativo, mas nunca perde orientação sobre bloqueios e próxima ação.

<!-- completed-task-id:3982c278fac30080 -->
- [x] **Fase 10 — fundação Enterprise Premium › Regra global de UX — informação em camadas** — Toda alteração sensível deve antecipar sua consequência em linguagem direta, por exemplo: `Todos os garçons poderão lançar em qualquer mesa`.

<!-- completed-task-id:05792e8f2d03312e -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Teste “sexta lotada”** — Executar 90 minutos de carga contínua, pico concentrado de 15 minutos, requisições repetidas, reinício de uma API, atraso temporário de PostgreSQL/Redis e reconexão de terminal.

<!-- completed-task-id:f2b293168ca2370a -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Gate A1** — Zero lançamento confirmado perdido, duplicado ou aplicado fora de ordem; zero saldo incorreto e zero acesso cruzado.

<!-- completed-task-id:13903b87d8d00bf2 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Gate A1** — Escritas com p95 abaixo de 500 ms e p99 abaixo de 1,5 s; HTTP 5xx abaixo de 0,1%, sempre recuperável sem duplicação.

<!-- completed-task-id:b4a393337bbad5e6 -->
- [x] **Adendo de campo — piloto F1 Boteco › A1 — capacidade para 120 mesas e 12 dispositivos › Gate A1** — Operação cloud continua com uma instância da API indisponível; o Hub BYOD terá gate próprio nos requisitos de continuidade e não mascara falha de capacidade cloud.

<!-- completed-task-id:dcbd38fe2ec7c9b4 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Dados e regras centrais** — Distribuir um setor expandindo-o em atribuições por mesa; não criar uma segunda estrutura de praça enquanto essa representação simples atender ao uso real.

<!-- completed-task-id:5570c9555f89b249 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Frontend e operação diária** — Criar `Equipe > Organização do atendimento` com resumo do estado atual, explicação simples, ação `Alterar` e painel `Entender esta regra`.

<!-- completed-task-id:d2246a9c0591787d -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Concorrência, conexão e recuperação** — Guardar versão da atribuição nos lançamentos pendentes; reenvio preserva autoria e conflitos vão para `Requer atenção`, sem aplicação ou descarte silencioso.

<!-- completed-task-id:ab31dd0fffcf8780 -->
- [x] **Adendo de campo — piloto F1 Boteco › B1 — praça por garçom e responsabilidade da mesa › Concorrência, conexão e recuperação** — Atualizar atribuições em tempo real, mantendo polling como contingência.

<!-- completed-task-id:91b44d68c604a537 -->
- [x] **Adendo de campo — piloto F1 Boteco › B2 — QR opcional, presença física e atendimento seguro › Gate B2** — Executar carga com até 600 consumidores simultâneos sem fila perdida, vazamento de comanda ou tempestade de consultas; respeitar metas do A1.

<!-- completed-task-id:d12de94f3eacb1c8 -->
- [x] **Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Onboarding guiado do proprietário e contador** — Receber certificado A1 e senha por fluxo seguro, encaminhá-los à Focus e eliminar o material temporário após confirmação; GiroMesa guarda somente metadados e referência.

<!-- completed-task-id:f20559e7c52f40a1 -->
- [x] **Adendo de campo — piloto F1 Boteco › E1 — NFC-e gerenciada via Focus NFe › Homologação antes da contratação e ativação de produção** — Preparar medição de NFC-e por tenant/filial, franquia, excedentes e alertas, sem ativar cobrança antes da definição comercial.

<!-- completed-task-id:53bc1a26402761e8 -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › SmartPOS para cobrança móvel e TEF para caixa fixo** — Parear dispositivos por tenant, filial e terminal, revogar pareamento e encaminhar o valor exato para a SmartPOS escolhida ou atribuída ao operador, recebendo o resultado sem redigitação. O F1 usará este caminho como preferência por levar maquininhas às mesas.

<!-- completed-task-id:6252b3aed2668926 -->
- [x] **Adendo de campo — piloto F1 Boteco › E2 — Pagamentos presenciais e conciliação multicanal › Conciliação financeira e gate do piloto** — Conciliar valor autorizado, taxas, antecipações, cancelamentos, chargebacks, data prevista e valor efetivamente liquidado; divergência vira ocorrência financeira com responsável, evidência, resolução e auditoria, sem alterar silenciosamente a comanda original.

<!-- completed-task-id:11ab0995a198d4d6 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › 15.0 Congelamento e release reproduzível** — Fixar fingerprint SSH em `known_hosts`; remover `accept-new` e falhar em mismatch.

<!-- completed-task-id:4d7ce67e2674c911 -->
- [x] **Fase 15 — hardening de produção, jurídico e integrações externas › Backoffice, observabilidade e suporte** — Mostrar por tenant/filial: release, migrations, web/API/worker, filas, outbox, dead-letter, e-mail, integrações, backup, última reconciliação e incidentes.

<!-- completed-task-id:a531e73f1d59ff31 -->
- [x] **Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias** — Testar carga piloto sem meta inventada: erro abaixo de 1%, nenhuma duplicação, nenhum saldo negativo ou acesso cruzado e p95 das rotas comuns abaixo de 500 ms.

<!-- completed-task-id:a7949f63bf056fc9 -->
- [x] **Fase 16 — aceite integral técnico, visual, operacional e jurídico › Suítes obrigatórias** — `git diff --check`, segurança, secrets scan e migrações.
