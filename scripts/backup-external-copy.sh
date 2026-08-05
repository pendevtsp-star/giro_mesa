#!/usr/bin/env sh
set -eu

: "${BACKUP_RCLONE_REMOTE:?BACKUP_RCLONE_REMOTE is required}"

BACKUP_DIR="${BACKUP_DIR:-backups}"
WAL_DIR="${WAL_ARCHIVE_DIR:-${BACKUP_DIR}/wal}"
STATUS_FILE="${BACKUP_STATUS_FILE:-${BACKUP_DIR}/external-status.json}"
RCLONE_CONFIG="${BACKUP_RCLONE_CONFIG:-}"

command -v rclone >/dev/null 2>&1 || {
  echo "rclone is required for external backup copy." >&2
  exit 1
}

test -d "${BACKUP_DIR}" || {
  echo "Backup directory does not exist: ${BACKUP_DIR}" >&2
  exit 1
}

copy_full_backups() {
  rclone "$@" copy --checksum --immutable "${BACKUP_DIR}" "${BACKUP_RCLONE_REMOTE%/}/postgres" \
    --exclude 'wal/**' \
    --exclude 'external-status.json'
}

copy_wal() {
  rclone "$@" copy --checksum --immutable "${WAL_DIR}" "${BACKUP_RCLONE_REMOTE%/}/postgres/wal"
}

if [ -n "${RCLONE_CONFIG}" ]; then
  copy_full_backups --config "${RCLONE_CONFIG}"
  if [ -d "${WAL_DIR}" ]; then
    copy_wal --config "${RCLONE_CONFIG}"
  fi
else
  copy_full_backups
  if [ -d "${WAL_DIR}" ]; then
    copy_wal
  fi
fi

LATEST_WAL=""
if [ -d "${WAL_DIR}" ]; then
  LATEST_WAL="$(find "${WAL_DIR}" -type f -printf '%T@ %f\n' | sort -nr | head -n 1 | cut -d' ' -f2- || true)"
fi

umask 077
COPIED_AT_EPOCH="$(date +%s)"
printf '{"copiedAt":"%s","copiedAtEpoch":%s,"remote":"%s","latestWal":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${COPIED_AT_EPOCH}" "${BACKUP_RCLONE_REMOTE}" \
  "${LATEST_WAL}" > "${STATUS_FILE}"

echo "External backup copy completed."
