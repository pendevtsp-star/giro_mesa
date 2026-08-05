#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
BACKUP_MIN_BYTES="${BACKUP_MIN_BYTES:-1024}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="${BACKUP_DIR}/giromesa-${TIMESTAMP}.dump"
CHECKSUM="${OUTPUT}.sha256"
LATEST="${BACKUP_DIR}/latest.json"

mkdir -p "${BACKUP_DIR}"
umask 077

if [ ! -f ".env" ]; then
  echo ".env not found. Run this from the production deploy directory." >&2
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=9 --no-owner --no-privileges' > "${OUTPUT}"

test -s "${OUTPUT}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres pg_restore --list < "${OUTPUT}" >/dev/null

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${OUTPUT}" > "${CHECKSUM}"
else
  shasum -a 256 "${OUTPUT}" > "${CHECKSUM}"
fi

BYTES="$(wc -c < "${OUTPUT}" | tr -d ' ')"
if [ "${BYTES}" -lt "${BACKUP_MIN_BYTES}" ]; then
  echo "Backup is smaller than ${BACKUP_MIN_BYTES} bytes." >&2
  exit 1
fi

printf '{"createdAt":"%s","file":"%s","bytes":%s,"checksumFile":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "${OUTPUT}")" "${BYTES}" "$(basename "${CHECKSUM}")" > "${LATEST}"

find "${BACKUP_DIR}" -type f \( -name 'giromesa-*.dump' -o -name 'giromesa-*.dump.sha256' \) \
  -mtime "+${RETENTION_DAYS}" -delete

echo "Backup validated: ${OUTPUT} (${BYTES} bytes)"
