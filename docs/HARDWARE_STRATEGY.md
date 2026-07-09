# Estrategia de Hardware

## Estado atual

O GiroMesa continua sem dependencia obrigatoria de hardware local, mas agora possui base tecnica para impressao de comandas:

- cadastro de impressoras em `printer_devices`;
- rotas de impressao em `print_routes`;
- fila idempotente em `print_jobs`;
- jobs criados automaticamente ao enviar pedido para KDS;
- provider mock para renderizar comanda termica;
- painel web para visualizar impressoras, rotas e fila;
- formularios no painel para cadastrar impressoras e rotas por filial;
- conector local em `apps/local-connector` com `dry-run` e saida ESC/POS via TCP.
- credencial propria do conector local via token opaco `gm_print_*`, hash salvo no banco e token exibido uma unica vez.
- heartbeat do conector com status online/offline, ultima conexao, versao, host e modo `dry-run`.

O conector real ainda deve ser homologado em hardware fisico antes de producao.

## Modelo operacional

1. PDV envia pedido para cozinha.
2. Backend cria tickets KDS.
3. Para cada rota ativa da estacao, backend cria um `print_job` com `idempotency_key`.
4. Conector local consulta jobs `pending`.
5. Conector marca `printing`, imprime e marca `printed`.
6. Falhas viram `failed`, permitindo retry.
7. Reimpressao cria novo job com auditoria e motivo.

## Conector local

Rodar em modo sem impressora:

```bash
CONNECTOR_DRY_RUN=true pnpm --filter @giromesa/local-connector dev
```

Rodar apontando para impressora de rede ESC/POS:

```bash
CONNECTOR_DRY_RUN=false CONNECTOR_PRINTER_HOST=192.168.15.41 CONNECTOR_PRINTER_PORT=9100 pnpm --filter @giromesa/local-connector dev
```

Variaveis:

- `API_URL`: URL da API GiroMesa.
- `GIROMESA_BRANCH_ID`: filial que o conector deve atender.
- `GIROMESA_CONNECTOR_TOKEN`: token do conector gerado no painel de impressao.
- `CONNECTOR_DRY_RUN`: `true` por padrao.
- `CONNECTOR_POLL_MS`: intervalo de polling.
- `CONNECTOR_PRINTER_HOST`: IP da impressora de rede.
- `CONNECTOR_PRINTER_PORT`: porta TCP, normalmente `9100`.

`CONNECTOR_PRINTER_HOST` e `CONNECTOR_PRINTER_PORT` sao fallback opcional. Em operacao normal, cada `print_job` carrega host, porta e configuracao vindos da impressora cadastrada em `printer_devices`, permitindo varias impressoras reais por filial no mesmo conector.

## Credencial do conector

Endpoints internos:

- `GET /api/v1/printing/connectors/config`
- `POST /api/v1/printing/connectors/configure`
- `POST /api/v1/printing/connectors/heartbeat`
- `POST /api/v1/printing/connectors/revoke`

O token do conector:

- usa prefixo `gm_print_`;
- e retornado uma unica vez na criacao/rotacao;
- tem somente os escopos `print_jobs:read` e `print_jobs:process`;
- fica vinculado a uma filial;
- autentica chamadas com header `x-giromesa-connector-key`;
- pode ler jobs pendentes e marcar `printing`, `printed` ou `failed`;
- nao pode criar impressoras, rotas, retry operacional ou reimpressao.

## Configuracao ESC/POS por impressora

Campos aceitos em `printer_devices.config`:

- `codepage`: `cp850`, `cp860` ou `cp1252`.
- `cutMode`: `partial` ou `full`.
- `boldHeader`: ativa negrito nas primeiras linhas da comanda.
- `beep`: envia beep ao final.
- `openDrawer`: aciona gaveta antes da impressao.

O conector usa os dados do job para decidir host, porta e comandos ESC/POS. Nao assumir uma unica impressora global por filial.

## Fase 2

- Homologar impressoras termicas de cozinha/bar/caixa via conector local.
- Leitores de codigo de barras.
- Gaveta de dinheiro.
- Tablets KDS.

## Fase 3

- TEF/maquininhas.
- Balancas.
- Totem de autoatendimento.
- Customer display.
- RFID/pulseira/comanda.

## Abstracao

Manter `PrintProvider`/conector local como camada de hardware. O backend envia comandos idempotentes e recebe confirmacao por status do job. Navegador nao deve ser o mecanismo principal de impressao operacional.
