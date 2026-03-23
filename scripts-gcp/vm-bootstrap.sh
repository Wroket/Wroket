#!/usr/bin/env bash
set -euo pipefail

echo "[bootstrap] Updating apt packages..."
sudo apt-get update -y

echo "[bootstrap] Installing Docker..."
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "[bootstrap] Enabling Docker service..."
sudo systemctl enable docker
sudo systemctl start docker

echo "[bootstrap] Add current user to docker group..."
sudo usermod -aG docker "$USER" || true

echo "[bootstrap] Installing Nginx..."
sudo apt-get install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx

echo "[bootstrap] Done. Re-login may be needed for docker group."

