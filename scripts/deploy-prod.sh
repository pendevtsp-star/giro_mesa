#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3333/health/ready}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1:3000}"
CURL_BIN="${CURL_BIN:-curl}"

if [ ! -f ".env" ]; then
  echo ".env not found. Create production secrets before deploy." >&2
  exit 1
fi

echo "Creating pre-deploy database backup..."
if docker compose -f "${COMPOSE_FILE}" ps --status running postgres | grep -q postgres; then
  scripts/backup-postgres.sh
else
  echo "Postgres is not running yet; skipping pre-deploy backup."
fi

echo "Pulling images..."
docker compose -f "${COMPOSE_FILE}" pull

echo "Starting services..."
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "Waiting for API health..."
for attempt in $(seq 1 30); do
  if "${CURL_BIN}" -fsS "${API_HEALTH_URL}" >/dev/null 2>&1; then
    break
  fi
  if [ "${attempt}" = "30" ]; then
    echo "API healthcheck failed" >&2
    docker compose -f "${COMPOSE_FILE}" ps
    exit 1
  fi
  sleep 3
done

echo "Waiting for web health..."
for attempt in $(seq 1 30); do
  if "${CURL_BIN}" -fsS "${WEB_HEALTH_URL}" >/dev/null 2>&1; then
    break
  fi
  if [ "${attempt}" = "30" ]; then
    echo "Web healthcheck failed" >&2
    docker compose -f "${COMPOSE_FILE}" ps
    exit 1
  fi
  sleep 3
done

docker compose -f "${COMPOSE_FILE}" ps
echo "Deploy completed"
