#!/usr/bin/env sh
set -eu

SOURCE="${1:?WAL source is required}"
WAL_FILE="${2:?WAL filename is required}"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/var/lib/postgresql/wal-archive}"

case "${WAL_FILE}" in
  *"/"* | "" )
    echo "Invalid WAL filename." >&2
    exit 1
    ;;
esac

umask 077
mkdir -p "${WAL_ARCHIVE_DIR}"
TEMP_FILE="${WAL_ARCHIVE_DIR}/.${WAL_FILE}.partial"
TARGET_FILE="${WAL_ARCHIVE_DIR}/${WAL_FILE}"

if [ -f "${TARGET_FILE}" ]; then
  exit 0
fi

cp "${SOURCE}" "${TEMP_FILE}"
mv "${TEMP_FILE}" "${TARGET_FILE}"
