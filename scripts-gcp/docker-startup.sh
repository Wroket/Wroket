#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[startup] $*"
}

log "Updating apt packages"
apt-get update -y

log "Installing prerequisites"
apt-get install -y ca-certificates curl gnupg lsb-release

log "Adding Docker apt repository"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME:-bookworm}")"
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian ${CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

log "Installing Docker Engine"
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

log "Enabling and starting Docker"
systemctl enable --now docker

log "Adding user to docker group (best-effort)"
usermod -aG docker "${SUDO_USER:-$(logname 2>/dev/null || echo francois)}" || true

log "Done"

