# Estrategia de Hardware

## MVP

Sem dependencia de hardware local. Impressao e equipamentos ficam planejados para fases futuras.

## Fase 2

- Impressoras termicas e cozinha via conector local.
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

Criar `HardwareProvider`/servico local quando houver necessidade real. O backend deve enviar comandos idempotentes e receber confirmacao.
