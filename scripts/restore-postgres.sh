#!/usr/bin/env sh
set -eu

echo "Production restore is disabled by policy." >&2
echo "Use scripts/restore-drill-postgres.sh against an isolated database and follow docs/BACKUP_RESTORE.md." >&2
exit 1
