#!/usr/bin/env sh
set -eu

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${ALLOW_RESTORE_DRILL:?Set ALLOW_RESTORE_DRILL=true}"

if [ "${ALLOW_RESTORE_DRILL}" != "true" ]; then
  echo "Restore drill not authorized." >&2
  exit 1
fi

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DRILL_DB="giromesa_restore_drill_$(date -u +%Y%m%d%H%M%S)"
CONTAINER_BACKUP="/tmp/${DRILL_DB}.dump"

test -s "${BACKUP_FILE}"
if [ -f "${BACKUP_FILE}.sha256" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum --check "${BACKUP_FILE}.sha256"
  else
    shasum -a 256 --check "${BACKUP_FILE}.sha256"
  fi
fi

POSTGRES_CONTAINER="$(docker compose -f "${COMPOSE_FILE}" ps -q postgres)"
test -n "${POSTGRES_CONTAINER}" || {
  echo "PostgreSQL container is not running." >&2
  exit 1
}

POSTGRES_USER="$(docker compose -f "${COMPOSE_FILE}" exec -T postgres sh -lc 'printf %s "$POSTGRES_USER"')"

cleanup() {
  docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    dropdb --if-exists --username="${POSTGRES_USER}" "${DRILL_DB}" >/dev/null 2>&1 || true
  docker exec "${POSTGRES_CONTAINER}" rm -f "${CONTAINER_BACKUP}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker cp "${BACKUP_FILE}" "${POSTGRES_CONTAINER}:${CONTAINER_BACKUP}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres createdb --username="${POSTGRES_USER}" "${DRILL_DB}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_restore --username="${POSTGRES_USER}" --dbname="${DRILL_DB}" --no-owner \
    --no-privileges --exit-on-error "${CONTAINER_BACKUP}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  psql --username="${POSTGRES_USER}" --dbname="${DRILL_DB}" --set=ON_ERROR_STOP=1 \
    --command="SELECT COUNT(*) AS tenants FROM tenants;" \
    --command="SELECT COUNT(*) AS orders FROM orders;" \
    --command="SELECT COUNT(*) AS audit_logs FROM audit_logs;"

echo "Restore drill passed in isolated database ${DRILL_DB}."
