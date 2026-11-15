#!/usr/bin/env bash
# Every image is built and all services run on this machine; no external app hosting.
set -euo pipefail
server_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
server_env="${ASTRA_SERVER_ENV:-${server_root}/deploy/server.env}"
server_project="${ASTRA_COMPOSE_PROJECT:-memento-mori}"
server_command="${1:-help}"
case "$server_command" in
  help|--help|-h)
    echo 'Usage: bash scripts/server.sh {configure ORIGIN|up|update|check|backup|status|logs|stop}'
    echo 'up/update build locally and restart the complete server stack; volumes are retained.'
    exit 0 ;;
  configure)
    exec python3 "$server_root/scripts/configure_server.py" --output "$server_env" --origin "${2:?Supply the public HTTP(S) origin}" ;;
esac
if [[ ! -f "$server_env" ]]; then
  echo 'Configure first: bash scripts/server.sh configure https://your-hostname' >&2
  exit 1
fi
docker compose version >/dev/null
docker info >/dev/null
compose() {
  docker compose --project-name "$server_project" --env-file "$server_env" -f "$server_root/deploy/compose.yaml" "$@"
}
compose config --quiet
case "$server_command" in
  up|update)
    # Sequential builds bound peak memory on small free-tier servers.
    compose build api
    compose build web
    if [[ -n "$(compose ps --status running --quiet api)" ]]; then
      compose exec -T api python /app/scripts/backup_database.py
    fi
    # Recreate the worker with the API's new network namespace on every release.
    compose stop web worker api
    compose up -d --force-recreate --wait --wait-timeout 180
    compose exec -T api python /app/scripts/check_server.py
    echo 'All services are hosted on this server. View recent logs with server.sh logs.'
    ;;
  check) compose exec -T api python /app/scripts/check_server.py ;;
  backup) compose exec -T api python /app/scripts/backup_database.py ;;
  status) compose ps ;;
  logs) compose logs --follow --tail 100 ;;
  stop) compose stop ;;
  *) echo "Unknown command: $server_command" >&2; exit 1 ;;
esac
