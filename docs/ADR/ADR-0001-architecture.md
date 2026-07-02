# ADR-0001 - Arquitetura

## Decisao

Adotar modular monolith com Next.js, NestJS/Fastify, worker BullMQ, PostgreSQL e Redis.

## Motivo

O produto precisa validar muitos fluxos operacionais sem custo de orquestracao de microsservicos. Modulos e providers mantem caminho para extracao futura.

## Consequencias

Deploy inicial simples em VPS Docker. Exige disciplina de limites entre modulos e testes de regressao.
