#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT="${BACKUP_DIR}/giromesa-${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

if [ ! -f ".env" ]; then
  echo ".env not found. Run this from the production deploy directory." >&2
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "${OUTPUT}"
echo "Backup written to ${OUTPUT}"
