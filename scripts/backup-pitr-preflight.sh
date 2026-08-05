#!/usr/bin/env sh
set -eu

: "${BACKUP_RCLONE_REMOTE:?BACKUP_RCLONE_REMOTE is required}"

BACKUP_DIR="${BACKUP_DIR:-backups}"
WAL_DIR="${WAL_ARCHIVE_DIR:-${BACKUP_DIR}/wal}"
STATUS_FILE="${BACKUP_STATUS_FILE:-${BACKUP_DIR}/external-status.json}"
MAX_WAL_AGE_SECONDS="${BACKUP_MAX_WAL_AGE_SECONDS:-300}"
RCLONE_CONFIG="${BACKUP_RCLONE_CONFIG:-}"

command -v rclone >/dev/null 2>&1 || {
  echo "rclone is required for PITR preflight." >&2
  exit 1
}
test -d "${WAL_DIR}" || {
  echo "WAL archive directory does not exist: ${WAL_DIR}" >&2
  exit 1
}

LATEST_WAL_EPOCH="$(find "${WAL_DIR}" -type f -printf '%T@\n' | sort -nr | head -n 1 | cut -d. -f1 || true)"
test -n "${LATEST_WAL_EPOCH}" || {
  echo "No archived WAL found." >&2
  exit 1
}

NOW_EPOCH="$(date +%s)"
WAL_AGE="$((NOW_EPOCH - LATEST_WAL_EPOCH))"
if [ "${WAL_AGE}" -gt "${MAX_WAL_AGE_SECONDS}" ]; then
  echo "Latest archived WAL is ${WAL_AGE}s old; limit is ${MAX_WAL_AGE_SECONDS}s." >&2
  exit 1
fi

test -s "${STATUS_FILE}" || {
  echo "No successful external backup copy status was found." >&2
  exit 1
}
EXTERNAL_COPY_EPOCH="$(sed -n 's/.*"copiedAtEpoch":\([0-9][0-9]*\).*/\1/p' "${STATUS_FILE}")"
test -n "${EXTERNAL_COPY_EPOCH}" || {
  echo "External backup status is invalid." >&2
  exit 1
}
EXTERNAL_COPY_AGE="$((NOW_EPOCH - EXTERNAL_COPY_EPOCH))"
if [ "${EXTERNAL_COPY_AGE}" -gt "${MAX_WAL_AGE_SECONDS}" ]; then
  echo "Latest external backup copy is ${EXTERNAL_COPY_AGE}s old; limit is ${MAX_WAL_AGE_SECONDS}s." >&2
  exit 1
fi

REMOTE_LIST="$(mktemp)"
trap 'rm -f "${REMOTE_LIST}"' EXIT
if [ -n "${RCLONE_CONFIG}" ]; then
  rclone --config "${RCLONE_CONFIG}" lsf "${BACKUP_RCLONE_REMOTE%/}/postgres/wal" --max-depth 1 > "${REMOTE_LIST}"
else
  rclone lsf "${BACKUP_RCLONE_REMOTE%/}/postgres/wal" --max-depth 1 > "${REMOTE_LIST}"
fi
test -s "${REMOTE_LIST}" || {
  echo "No WAL was found in external storage." >&2
  exit 1
}
echo "PITR preflight passed; local WAL age is ${WAL_AGE}s and external copy age is ${EXTERNAL_COPY_AGE}s."
