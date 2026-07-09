#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ] || [ ! -f "${BACKUP_FILE}" ]; then
  echo "Usage: scripts/restore-postgres.sh backups/giromesa-YYYYMMDD-HHMMSS.sql.gz" >&2
  exit 1
fi

if [ ! -f ".env" ]; then
  echo ".env not found. Run this from the production deploy directory." >&2
  exit 1
fi

echo "Restoring ${BACKUP_FILE}. This will write into the configured production database."
gunzip -c "${BACKUP_FILE}" | docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
echo "Restore completed"
