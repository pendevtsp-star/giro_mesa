# Evidências — fases 13 e 14

**Data:** 2026-08-03  
**Escopo:** GiroMesa e DoseClub, mantidos em repositórios, bancos e sessões separados.  
**Publicação:** nenhuma; não houve commit, push ou deploy.

## Fase 13 — personalização, QR premium e aquisição orgânica

- Experiência pública disponível em português, inglês e espanhol.
- Categorias renomeáveis por filial, recomendações de produtos e motivos rápidos de
  atendimento configuráveis.
- Validação de tenant e filial para categorias e produtos expostos pelo QR.
- Modelos, paleta, fontes, URLs e conteúdo continuam controlados; CSS, scripts e
  fontes arbitrárias são rejeitados.
- CTA GiroMesa/DoseClub mantém a marca de forma discreta e registra apenas contador
  diário agregado por tenant, filial, destino e campanha. A tabela não contém mesa,
  pedido, token, usuário ou dado pessoal.
- Publicação, agendamento e rollback da experiência não exigem reimpressão do QR.

Migração GiroMesa: `0027_commercial_attribution_daily.sql`.

## Fase 14 — ecossistema GiroMesa e DoseClub

- GiroMesa publica catálogo canônico para `giromesa`, `doseclub` e `bundle`.
- Assinaturas GiroMesa e entitlements explícitos são resolvidos pela plataforma;
  `integration.shared_inventory` permanece independente do plano.
- Handoff autenticado emite token HMAC de 60 segundos e uso único. O token que passa
  pelo navegador não contém e-mail, nome, slug ou entitlements.
- A troca ocorre servidor-servidor com chave exclusiva; o GiroMesa resolve identidade
  e entitlements atuais e consome o `jti` atomicamente.
- DoseClub vincula somente tenant e funcionário previamente provisionados e cria sua
  própria sessão. Login nativo, banco e operação standalone permanecem independentes.
- A landing DoseClub consome o catálogo do GiroMesa por proxy same-origin e usa
  apresentação local apenas como fallback quando o catálogo estiver indisponível.
- Campanhas cruzadas são opcionais e auditadas, sem compartilhar cliente, carteira,
  saldo ou histórico de fidelidade.

Migrações:

- GiroMesa: `0028_fantastic_meltdown.sql`.
- DoseClub: `20260803170000_federated_identity_handoff/migration.sql`.

## Validação executada

### GiroMesa

- Biome: 403 arquivos aprovados.
- Typecheck: 8 pacotes aprovados.
- Testes unitários: 260 aprovados; integrações condicionadas por ambiente permanecem
  separadas da suíte unitária.
- Integração PostgreSQL focada das fases 13 e 14 aprovada em banco descartável,
  incluindo aplicação incremental das migrations `0027` e `0028`.
- Build: 8 pacotes aprovados.
- Segurança e migration safety: aprovados.
- E2E isolado: 58 cenários aprovados e 10 cenários de auditoria visual dedicados
  ignorados pela configuração padrão da suíte.
- `git diff --check`: aprovado.

### DoseClub

- Prisma validate: aprovado.
- Migration federada aplicada no PostgreSQL local e `prisma migrate status` confirmou
  as 36 migrations em dia; o container de teste foi desligado depois da validação.
- Lint e typecheck: 4 pacotes aprovados.
- Testes: 190 aprovados e 23 integrações DB-gated ignoradas.
- Contrato federado focado: token trocado no envelope `identity`, reuso rejeitado e
  login nativo preservado quando a federação está desligada.
- Build: 4 pacotes aprovados, incluindo a rota dinâmica de catálogo.
- `git diff --check`: aprovado.

## Pendências externas transferidas para a Fase 15

- Provisionar DNS/proxy de `accounts.giromesa.com.br`.
- Configurar os dois segredos federados somente nos ambientes de execução.
- Aplicar migrations nos bancos alvo e homologar o handoff entre os deployments reais.
- Executar a matriz visual dedicada com os serviços publicados e validar falha real de
  rede entre os produtos.
