#!/usr/bin/env sh
set -eu

DEPLOY_DIR="${1:-$(pwd)}"
CRON_FILE="${BACKUP_CRON_FILE:-/etc/cron.d/giromesa-backup}"

test -f "${DEPLOY_DIR}/docker-compose.prod.yml" || {
  echo "Run from the GiroMesa production deploy directory or pass it as the first argument." >&2
  exit 1
}

cat > "${CRON_FILE}" <<EOF
# GiroMesa external PostgreSQL protection. Secrets stay in ${DEPLOY_DIR}/.backup.env (0600).
* * * * * root cd ${DEPLOY_DIR} && set -a && . ./.backup.env && set +a && ./scripts/backup-external-copy.sh >> /var/log/giromesa-backup.log 2>&1
*/5 * * * * root cd ${DEPLOY_DIR} && set -a && . ./.backup.env && set +a && ./scripts/backup-pitr-preflight.sh >> /var/log/giromesa-backup.log 2>&1
0 2 * * * root cd ${DEPLOY_DIR} && set -a && . ./.backup.env && set +a && ./scripts/backup-postgres.sh && ./scripts/backup-external-copy.sh >> /var/log/giromesa-backup.log 2>&1
EOF

chmod 600 "${CRON_FILE}"
echo "Installed ${CRON_FILE}. Run the preflight before relying on this schedule."
