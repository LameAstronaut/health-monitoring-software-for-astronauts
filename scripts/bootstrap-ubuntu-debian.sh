#!/usr/bin/env bash
# Install server prerequisites from Docker's official Ubuntu/Debian repository.
set -euo pipefail
if [[ "${1:-}" == "--help" ]]; then
  echo 'Usage: sudo bash scripts/bootstrap-ubuntu-debian.sh'
  echo 'Installs Docker Engine/Compose, git, make, and Python 3 on Ubuntu/Debian.'
  exit 0
fi
if [[ "${EUID}" -ne 0 ]]; then
  echo 'Run this bootstrap with sudo.' >&2
  exit 1
fi
# shellcheck source=/dev/null
source /etc/os-release
case "${ID}:${VERSION_ID}" in
  ubuntu:22.04|ubuntu:24.04|ubuntu:26.04|ubuntu:26.10|debian:12|debian:13) ;;
  *) echo "Unsupported release: ${PRETTY_NAME}. Use supported Ubuntu/Debian." >&2; exit 1 ;;
esac
server_arch="$(dpkg --print-architecture)"
case "$server_arch" in
  amd64|arm64) ;;
  *) echo "Unsupported server architecture: $server_arch" >&2; exit 1 ;;
esac
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git make python3
if ! docker compose version >/dev/null 2>&1; then
  for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
    if [[ "$(dpkg-query -W -f='${db:Status-Status}' "$package" 2>/dev/null || true)" == 'installed' ]]; then
      echo "Existing $package installation needs manual Docker/Compose reconciliation; nothing was removed." >&2
      exit 1
    fi
  done
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --location "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  server_codename="${UBUNTU_CODENAME:-${VERSION_CODENAME}}"
  cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/${ID}
Suites: ${server_codename}
Components: stable
Architectures: ${server_arch}
Signed-By: /etc/apt/keyrings/docker.asc
EOF
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
docker compose version
echo 'Server prerequisites ready. Next: make server-config ORIGIN=https://your-hostname'
echo 'Then: sudo bash scripts/server.sh up'
