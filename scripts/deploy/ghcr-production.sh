#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/apps/giro_mesa}"
cd "${APP_DIR}"

if [ ! -f .env ]; then
  echo "Missing ${APP_DIR}/.env. Create the VPS runtime env file before deploying." >&2
  exit 1
fi

if [ -f .deploy-images.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.deploy-images.env
  set +a
fi

GHCR_USERNAME="${GHCR_USERNAME:?set GHCR_USERNAME}"
GHCR_TOKEN_GIRO_MESA="${GHCR_TOKEN_GIRO_MESA:?set GHCR_TOKEN_GIRO_MESA}"
API_IMAGE_SHA="${API_IMAGE_SHA:-${GIROMESA_API_IMAGE:-}}"
WEB_IMAGE_SHA="${WEB_IMAGE_SHA:-${GIROMESA_WEB_IMAGE:-}}"
WORKER_IMAGE_SHA="${WORKER_IMAGE_SHA:-${GIROMESA_WORKER_IMAGE:-}}"
DEPLOY_SHA="${DEPLOY_SHA:-${GIROMESA_DEPLOY_SHA:-manual}}"

: "${API_IMAGE_SHA:?set API_IMAGE_SHA or GIROMESA_API_IMAGE}"
: "${WEB_IMAGE_SHA:?set WEB_IMAGE_SHA or GIROMESA_WEB_IMAGE}"
: "${WORKER_IMAGE_SHA:?set WORKER_IMAGE_SHA or GIROMESA_WORKER_IMAGE}"

export GIROMESA_API_IMAGE="${API_IMAGE_SHA}"
export GIROMESA_WEB_IMAGE="${WEB_IMAGE_SHA}"
export GIROMESA_WORKER_IMAGE="${WORKER_IMAGE_SHA}"

cat > .deploy-images.env <<DEPLOY_IMAGES
GIROMESA_API_IMAGE=${GIROMESA_API_IMAGE}
GIROMESA_WEB_IMAGE=${GIROMESA_WEB_IMAGE}
GIROMESA_WORKER_IMAGE=${GIROMESA_WORKER_IMAGE}
GIROMESA_DEPLOY_SHA=${DEPLOY_SHA}
DEPLOY_IMAGES
chmod 600 .deploy-images.env

compose() {
  docker compose --env-file .env -f docker-compose.prod.yml -f docker-compose.ghcr.yml "$@"
}

wait_container_running() {
  local service="$1"
  local container_id

  container_id="$(compose ps -q "${service}")"
  if [ -z "${container_id}" ]; then
    echo "Compose service ${service} did not create a container." >&2
    exit 1
  fi

  for attempt in $(seq 1 30); do
    if [ "$(docker inspect -f '{{.State.Running}}' "${container_id}")" = "true" ]; then
      return 0
    fi
    sleep 2
  done

  echo "Compose service ${service} is not running." >&2
  docker logs "${container_id}" >&2 || true
  exit 1
}

wait_container_healthy() {
  local service="$1"
  local container_id
  local status

  container_id="$(compose ps -q "${service}")"
  if [ -z "${container_id}" ]; then
    echo "Compose service ${service} did not create a container." >&2
    exit 1
  fi

  for attempt in $(seq 1 45); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${container_id}")"
    case "${status}" in
      healthy | none)
        return 0
        ;;
      unhealthy)
        echo "Compose service ${service} became unhealthy." >&2
        docker logs "${container_id}" >&2 || true
        exit 1
        ;;
    esac
    sleep 2
  done

  echo "Compose service ${service} did not become healthy before deploy timeout." >&2
  docker logs "${container_id}" >&2 || true
  exit 1
}

wait_http() {
  local url="$1"

  for attempt in $(seq 1 45); do
    if curl --fail --silent --show-error "${url}" >/dev/null; then
      return 0
    fi
    sleep 2
  done

  echo "HTTP health check failed for ${url}." >&2
  exit 1
}

echo "${GHCR_TOKEN_GIRO_MESA}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

compose pull api web worker
compose up -d postgres redis

for attempt in $(seq 1 30); do
  if compose exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    break
  fi
  if [ "${attempt}" = "30" ]; then
    echo "PostgreSQL did not become ready before deploy." >&2
    exit 1
  fi
  sleep 2
done

mkdir -p backups
backup_file="backups/pre-deploy-${DEPLOY_SHA}-$(date +%Y%m%d-%H%M%S).sql"
compose exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "${backup_file}"
test -s "${backup_file}"

if compose run --rm api pnpm --filter @giromesa/db db:check-applied; then
  echo "Database migrations are already applied; skipping drizzle-kit migrate."
else
  compose run --rm api pnpm db:migrate
  compose run --rm api pnpm --filter @giromesa/db db:check-applied
fi

systemd_stopped=0
rollback_systemd() {
  if [ "${systemd_stopped}" = "1" ]; then
    systemctl start giromesa-api.service giromesa-web.service 2>/dev/null || true
  fi
}
trap rollback_systemd ERR

systemctl stop giromesa-api.service giromesa-web.service 2>/dev/null || true
systemd_stopped=1

compose up -d --remove-orphans api web worker

for service in api web worker; do
  wait_container_running "${service}"
done
wait_container_healthy api
wait_container_healthy web

compose ps
wait_http http://127.0.0.1:3333/health/ready
wait_http http://127.0.0.1:3002/

trap - ERR
systemctl disable --now giromesa-api.service giromesa-web.service 2>/dev/null || true
printf '%s\n' "${DEPLOY_SHA}" > PRODUCTION_VERSION
