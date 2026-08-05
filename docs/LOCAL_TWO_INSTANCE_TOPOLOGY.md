# Topologia local com duas instâncias da API

Este cenário reproduz duas instâncias independentes da API, com PostgreSQL e Redis compartilhados e um proxy Nginx na porta `3335`. Ele é somente local e não altera o Compose de produção.

Valide a definição com `pnpm topology:local:check`. Para executar, prepare um `.env` local válido e use `docker compose -f docker-compose.yml -f docker-compose.topology-local.yml up --build api-proxy`.

Cada API limita o pool a 12 conexões. Com duas instâncias, o teto configurado é 24 conexões da aplicação. As métricas `giromesa_db_pool_*` mostram total, ociosas, fila e erros por `API_INSTANCE_ID`; as métricas `giromesa_realtime_*` mostram consumidores SSE, streams compartilhados, polls e lotes de deltas.

O proxy desabilita buffering para SSE. Esta topologia valida compartilhamento, fan-out e limites locais; não representa homologação de infraestrutura nem autoriza publicação.
