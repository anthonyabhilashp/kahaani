#!/bin/bash

# ============================================
# Systemd Setup Script for Kahaani
# ============================================
# Run this script on your production server:
#   chmod +x systemd-setup.sh && sudo ./systemd-setup.sh
# ============================================

set -e

echo "=========================================="
echo "  Kahaani Systemd Setup"
echo "=========================================="

# Get the directory where this script is located
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect node path
NODE_PATH=$(which node)
NPM_PATH=$(which npm)

echo ""
echo "App directory: $APP_DIR"
echo "Node path: $NODE_PATH"
echo ""

echo "1. Building the app..."
cd "$APP_DIR"
npm run build

echo ""
echo "2. Creating systemd service file..."

cat > /etc/systemd/system/kahaani.service << EOF
[Unit]
Description=Kahaani - AI Video Generation App
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
ExecStart=$NPM_PATH run start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kahaani

# Environment variables (loaded from .env.local)
EnvironmentFile=$APP_DIR/.env.local

# Keep the service running
TimeoutStartSec=0
RemainAfterExit=no

[Install]
WantedBy=multi-user.target
EOF

echo ""
echo "3. Reloading systemd daemon..."
systemctl daemon-reload

echo ""
echo "4. Enabling service to start on boot..."
systemctl enable kahaani

echo ""
echo "5. Starting the service..."
systemctl restart kahaani

echo ""
echo "6. Checking status..."
systemctl status kahaani --no-pager

echo ""
echo "=========================================="
echo "  SETUP COMPLETE!"
echo "=========================================="
echo ""
echo "  COMMANDS:"
echo "  ----------------------------------------"
echo "  systemctl status kahaani   - Check status"
echo "  systemctl restart kahaani  - Restart app"
echo "  systemctl stop kahaani     - Stop app"
echo "  systemctl start kahaani    - Start app"
echo ""
echo "  LOGS:"
echo "  ----------------------------------------"
echo "  journalctl -u kahaani -f          - Live logs (Ctrl+C to exit)"
echo "  journalctl -u kahaani --lines 100 - Last 100 lines"
echo "  journalctl -u kahaani --since today - Today's logs"
echo ""
echo "  DEPLOY NEW VERSION:"
echo "  ----------------------------------------"
echo "  cd $APP_DIR && git pull && npm run build && systemctl restart kahaani"
echo ""
echo "=========================================="
