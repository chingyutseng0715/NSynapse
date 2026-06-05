#!/bin/bash
# NEXUS — Server Setup Script
# Run this on the Ubuntu server after copying the project files
# Usage: bash deploy.sh

set -e

echo ""
echo "  NEXUS Deep Tech Intelligence — Server Setup"
echo "  ============================================"
echo ""

# ── Node.js ──────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "[1/5] Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
else
  echo "[1/5] Node.js already installed: $(node -v)"
fi

# ── Ollama ───────────────────────────────────────────────
if ! command -v ollama &> /dev/null; then
  echo "[2/5] Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "[2/5] Ollama already installed"
fi

# ── Pull model ───────────────────────────────────────────
# Point Ollama to the project's model folder
export OLLAMA_MODELS="$(pwd)/model"
echo "      Using model path: $OLLAMA_MODELS"

# Check if model already exists (copied manually via SCP)
if ollama list 2>/dev/null | grep -q "llama3.3"; then
  echo "[3/5] llama3.3:70b already present — skipping download"
else
  echo "[3/5] Model not found locally, pulling llama3.3:70b (~43GB)..."
  ollama pull llama3.3:70b
fi

# ── App dependencies ─────────────────────────────────────
echo "[4/5] Installing app dependencies..."
npm install

# ── PM2 ──────────────────────────────────────────────────
echo "[5/5] Setting up PM2 process manager..."
sudo npm install -g pm2
pm2 delete nexus 2>/dev/null || true
pm2 start server.js --name nexus
pm2 save
pm2 startup | tail -1 | sudo bash || true

echo ""
echo "  Done! NEXUS is running at http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "  Useful commands:"
echo "    pm2 logs nexus       — view live logs"
echo "    pm2 restart nexus    — restart the app"
echo "    pm2 stop nexus       — stop the app"
echo "    ollama list          — see downloaded models"
echo ""
