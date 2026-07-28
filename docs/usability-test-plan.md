# Plano de Testes de Usabilidade - GiroMesa

**Data:** 2026-07-22
**Versao:** 1.0
**Objetivo:** Validar todas as funcionalidades implementadas e identificar problemas de usabilidade

---

## 1. Dashboard do Bar/Restaurante (`/app`)

### 1.1 KPI Cards
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Vendas hoje | Verificar se valor e real (nao hardcoded) | Valor vindo da API `getDashboardSummary` |
| Pedidos ativos | Contar pedidos abertos no KDS + QR | Numero real de pedidos ativos |
| Mesas ocupadas | Contar mesas com status != "free" | Fracao real (ex: 3/8) |
| Caixa atual | Verificar saldo do caixa | Valor real da sessao de caixa |

### 1.2 Widget Personalizacao
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Botao Personalizar | Clicar no botao | Abre seletor de widgets |
| Toggle widget | Desligar um widget | Widget some com animacao |
| Persistencia | Recarregar pagina | Widgets mantem estado via localStorage |

### 1.3 ShiftPriorities
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Atendimento | Clicar em "Abrir PDV" | Navega para `/app?view=pos` |
| Producao | Verificar badge "Tudo em ordem" | Aparece quando nao ha tickets KDS |
| Gestao | Clicar em "Relatorios" | Navega para `/app/reports` |

### 1.4 OperationalReadiness
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Onboarding pendente | Verificar se proxima acao e "concluir onboarding" | Botao direciona para `/app/onboarding` |
| Turno fechado | Verificar se proxima acao e "abrir turno" | Botao direciona para `/app/cash` |
| Caixa fechado | Verificar se proxima acao e "abrir caixa" | Botao direciona para `/app/cash` |
| Tudo pronto | Verificar se proxima acao e "operar PDV" | Botao abre PDV |

---

## 2. Cardapio Digital Publico (`/m/[tenantSlug]`)

### 2.1 Carregamento
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Acesso publico | Acessar `/m/bar-aurora-demo` sem login | Pagina carrega com dados do tenant |
| Branding | Verificar cores e logo | Branding do Bar Aurora aplicado |
| Fallback | Derrubar API | Exibe dados demo hardcoded |

### 2.2 Navegacao
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Filtro categorias | Clicar em uma categoria | Produtos filtrados |
| Busca | Digitar "Negroni" | Produtos filtrados por nome |
| Limpar busca | Limpar campo de busca | Todos os produtos aparecem |

### 2.3 Produtos
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Imagem | Verificar se produtos com imageUrl mostram imagem | Imagem exibida, nao icone |
| Sem imagem | Verificar produtos sem imageUrl | Icone placeholder exibido |
| Preco | Verificar formatacao | Valor em R$ formatado |
| Modificadores | Clicar em produto com modifierGroupCount > 0 | Abre modal de modificadores |
| Sem modificadores | Clicar em produto sem modificadores | Adiciona direto ao carrinho (se houver) |

### 2.4 Paginacao
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Load more | Rolar ate o final | Botao "Carregar mais" aparece |
| Carregar mais | Clicar no botao | Mais produtos carregam |
| Todos carregados | Carregar todos | Botao some |

### 2.5 Responsividade
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Mobile | Acessar em tela < 768px | Layout coluna unica |
| Tablet | Acessar em tela 768-1024px | Layout adaptado |
| Desktop | Acessar em tela > 1024px | Layout completo |

---

## 3. Pedido QR (`/q/[tableCode]`)

### 3.1 Resolucao da Mesa
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Codigo invalido | Acessar `/q/INVALIDO` | Erro amigavel ou redirect |
| Mesa livre | Acessar `/q/M01` | Mesa resolvida, menu exibido |
| Mesa ocupada | Acessar mesa com pedido aberto | Status exibido |

### 3.2 Carrinho
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Adicionar item | Clicar "+" no produto | Item adicionado ao carrinho |
| Quantidade | Clicar "+" varias vezes | Quantidade incrementa |
| Remover item | Clicar "-" no carrinho | Quantidade decrementa |
| Remover ultimo | Remover ultimo item | Carrinho fica vazio |
| Total | Adicionar varios itens | Total calculado corretamente |

### 3.3 Modificadores
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Abrir modal | Clicar em produto com modificadores | Modal abre |
| Selecionar opcao | Marcar uma opcao | Opcao selecionada |
| Obrigatorio | Tentar enviar sem selecionar obrigatorio | Erro de validacao |
| Maximo | Tentar selecionar mais que maxChoices | Limite respeitado |
| Preco | Verificar preco com modifier | Preco base + delta exibido |

### 3.4 Envio do Pedido
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Enviar | Clicar "Enviar pedido" | Pedido criado via API |
| Carrinho vazio | Tentar enviar sem itens | Erro de validacao |
| Sucesso | Pedido enviado com sucesso | Mensagem de confirmacao, carrinho limpo |
| Erro API | Derrubar API durante envio | Mensagem de erro amigavel |

### 3.5 Acoes
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Chamar garcom | Clicar "Chamar garcom" | Evento registrado |
| Pre-conta | Clicar "Pre-conta" | Evento registrado |
| Imprimir | Clicar "Imprimir" | Documento abre em nova aba |

---

## 4. Gerador de QR Code Estilizado

### 4.1 Conceito (A IMPLEMENTAR)
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Acesso | Rota `/qr-generator` ou `/app/qr-generator` | Pagina de geracao de QR |
| Selecao de mesa | Selecionar mesa | QR gerado para aquela mesa |
| Personalizacao | Escolher cores/logo | QR reflete branding do tenant |
| Download | Clicar "Baixar QR" | Arquivo PNG/SVG baixado |
| Impressao | Clicar "Imprimir QR" | Dialog de impressao abre |
| QR unico | Gerar QR para mesma mesa | Mesmo link, design diferente |

### 4.2 Formato do QR
| Elemento | Descricao |
|----------|-----------|
| Link | `https://dominio.com/q/[tableCode]` |
| Logo | Logo do tenant centralizado |
| Cores | Primaria e secundaria do tenant |
| Texto | "Escaneie para ver o cardapio" |
| Borda | Arredondada com cor da marca |

---

## 5. Perfis de Acesso (RBAC)

### 5.1 Admin/Proprietario
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Acesso total | Login como admin | Todas as 17 rotas acessiveis |
| Configuracoes | Acessar `/app/settings` | Permite alterar branding |
| Equipe | Acessar `/app/team` | Gerencia usuarios |
| Seguranca | Acessar `/app/security` | Gerencia permissoes |

### 5.2 Gerente
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Dashboard | Acessar `/app` | KPIs visiveis |
| Relatorios | Acessar `/app/reports` | Relatorios acessiveis |
| Configuracoes | Tentar acessar `/app/settings` | Acesso bloqueado |
| Equipe | Tentar acessar `/app/team` | Acesso bloqueado |

### 5.3 Vendedor/Garcom
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| PDV | Acessar `/app?view=pos` | PDV funcional |
| Salao | Acessar `/app/salon` | Mapa de mesas visivel |
| Garcom | Acessar `/app/waiter` | Stepper funcional |
| KDS | Tentar acessar `/app/kds` | Acesso bloqueado (sem permissao) |

### 5.4 Caixa
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Caixa | Acessar `/app/cash` | Gestao de caixa funcional |
| Pagamentos | Receber pagamento | Pagamento registrado |
| Fechamento | Fechar caixa | Sessao fechada |

### 5.5 Cozinha/Bar
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| KDS | Acessar `/app/kds` | Tickets exibidos |
| Avancar status | Marcar "Iniciar" | Status muda para "preparing" |
| Marcar pronto | Marcar "Pronto" | Status muda para "ready" |
| Entregar | Marcar "Entregar" | Status muda para "served" |

### 5.6 Backoffice SaaS
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Login | Acessar `/platform` | Login de plataforma |
| Tenants | Listar tenants | Todos os tenants exibidos |
| Criar tenant | Criar novo tenant | Tenant criado com onboarding |
| Status | Alterar status de tenant | Trial/Active/Suspended |

---

## 6. Dashboard SaaS (Backoffice) (`/platform`)

### 6.1 Visao Geral
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Metricas | Verificar KPIs | Total de tenants, receita, etc. |
| Tenants recentes | Listar ultimos tenants | Lista ordenada por data |
| Busca | Buscar tenant | Filtragem funcional |

### 6.2 Gestao de Tenants
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Detalhes | Clicar em tenant | Pagina de detalhes |
| Status | Alterar status | Mudanca refletida |
| Comunicacao | Enviar comunicacao | Notificacao enviada |
| Asaas | Simular checkout | Link de pagamento gerado |

---

## 7. Funcionalidades Operacionais

### 7.1 PDV (Ponto de Venda)
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Abrir PDV | Clicar "Abrir PDV" | Modo PDV ativado |
| Selecionar mesa | Clicar na mesa | Mesa selecionada |
| Adicionar item | Clicar no produto | Item adicionado ao ticket |
| Modificadores | Selecionar modificadores | Modificadores aplicados |
| Enviar cozinha | Clicar "Enviar" | Pedido enviado para KDS |
| Receber pagamento | Selecionar metodo e valor | Pagamento registrado |
| Fechar conta | Clicar "Fechar" | Conta fechada, mesa liberada |

### 7.2 KDS (Cozinha/Bar)
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Tickets | Verificar tickets pendentes | Lista de tickets exibida |
| Filtro estacao | Filtrar por estacao | Tickets filtrados |
| Filtro status | Filtrar por status | Tickets filtrados |
| Avancar | Clicar "Iniciar" | Status muda |
| Som | Ativar som | Notificacao sonora ao ficar pronto |

### 7.3 Estoque
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Itens | Listar itens de estoque | Lista exibida |
| Alertas | Verificar itens abaixo do minimo | Alertas exibidos |
| Ajuste | Ajustar estoque | Quantidade atualizada |
| Historico | Ver historico de movimentacoes | Historico exibido |

### 7.4 Fiscal
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Documentos | Listar documentos fiscais | Lista exibida |
| Emitir | Emitir NFC-e para venda | Documento emitido (mock) |
| Cancelar | Cancelar documento | Status atualizado |
| Retry | Tentar novamente | Retry executado |

### 7.5 Relatorios
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Vendas por periodo | Filtrar por data | Dados agregados |
| Performance | Ver metricas | Tempo medio, cancelamentos |
| Financeiro | Ver resumo | Receita, pagamentos, fluxo |
| Exportar | Exportar relatorio | Arquivo gerado |

### 7.6 Delivery
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Criar delivery | Criar delivery para pedido | Delivery criado |
| Atualizar status | Mudar status | Status atualizado |
| Cancelar | Cancelar delivery | Delivery cancelado |
| Listar | Listar deliveries | Lista exibida |

### 7.7 Impressao
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Pre-conta | Imprimir pre-conta | Documento gerado |
| Comprovante | Imprimir comprovante | Documento gerado |
| Resumo caixa | Imprimir resumo | Documento gerado |
| Retry | Tentar novamente | Retry executado |

### 7.8 Onboarding
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Checklist | Ver checklist | Passos exibidos |
| Completar | Marcar passo como feito | Progresso atualizado |
| Pular | Pular passo | Passo marcado como skipped |
| Bloquear | Bloquear passo | Passo marcado como blocked |

---

## 8. Testes Transversais

### 8.1 Performance
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Tempo de carregamento | Medir FCP | < 2 segundos |
| LCP | Medir LCP | < 4 segundos |
| CLS | Medir CLS | < 0.1 |
| Bundle size | Verificar tamanho do bundle | < 150KB first load |

### 8.2 Acessibilidade
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Tab navigation | Navegar com Tab | Todos os elementos focaveis acessiveis |
| Screen reader | Usar NVDA/VoiceOver | Conteudo acessivel |
| Contraste | Verificar contraste | WCAG AA (4.5:1) |
| Reduced motion | Ativar reduced motion | Animacoes desabilitadas |

### 8.3 Seguranca
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| CSRF | Enviar mutation sem token | Rejeitado |
| Rate limit | Enviar 20 requisicoes/min | Rate limit atingido |
| SQL injection | Tentar injetar SQL | Rejeitado |
| XSS | Tentar injetar script | Rejeitado |

### 8.4 Compatibilidade
| Teste | Acao | Resultado Esperado |
|-------|------|-------------------|
| Chrome | Testar no Chrome | Funcional |
| Firefox | Testar no Firefox | Funcional |
| Safari | Testar no Safari | Funcional |
| Edge | Testar no Edge | Funcional |
| Mobile Chrome | Testar no Android | Funcional |
| Mobile Safari | Testar no iOS | Funcional |

---

## 9. Cenarios de Uso (E2E)

### 9.1 Fluxo Completo: Pedido QR
1. Cliente escaneia QR da mesa
2. Cardapio carrega com produtos e modificadores
3. Cliente seleciona itens e modificadores
4. Cliente envia pedido
5. Pedido aparece no KDS
6. Cozinha prepara e marca como pronto
7. Garcom entrega
8. Cliente solicita pre-conta
9. Garcom recebe pagamento
10. Conta fechada, mesa liberada

### 9.2 Fluxo Completo: Garcom (Stepper)
1. Garcom acessa `/app/waiter`
2. Step 1: Seleciona mesa e quantidade de pessoas
3. Step 2: Adiciona produtos com modificadores
4. Step 3: Revisa pedido e recebe pagamento
5. Pedido enviado para cozinha
6. Mesa liberada

### 9.3 Fluxo Completo: Delivery
1. Cliente faz pedido (QR ou telefone)
2. Staff cria delivery no sistema
3. Status: pending → confirmed → preparing → ready
4. Entregador busca pedido
5. Status: out_for_delivery → delivered

### 9.4 Fluxo Completo: Fechamento de Caixa
1. Caixa abre sessao com valor inicial
2. Durante o turno, pagamentos sao registrados
3. Caixa pode registrar suprimento/sangria
4. Caixa fecha sessao informando valor contado
5. Sistema calcula diferenca
6. Se divergente, status = "disputed"

---

## 10. Checklist Final

### Antes de cada teste:
- [ ] API rodando (porta 3333)
- [ ] Web rodando (porta 3002)
- [ ] Banco de dados acessivel
- [ ] Seed executado (dados demo disponiveis)

### Apos cada teste:
- [ ] Funcionalidade validada
- [ ] Sem erros no console
- [ ] Sem violacoes de acessibilidade
- [ ] Layout responsivo OK

### Relatorio:
- [ ] Todos os testes documentados
- [ ] Bugs encontrados listados
- [ ] Sugestoes de melhoria anotadas
- [ ] Screenshots dos problemas

---

*Documento gerado por MiMoCode em 2026-07-22*
*Plano de testes de usabilidade para GiroMesa*
