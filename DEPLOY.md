# Production Deployment

## First Time Setup
```bash
chmod +x systemd-setup.sh && sudo ./systemd-setup.sh
```

## Deploy New Code
```bash
git pull && npm run build && systemctl restart kahaani
```

## Service Commands
```bash
systemctl status kahaani    # Check if running
systemctl restart kahaani   # Restart app
systemctl stop kahaani      # Stop app
```

## View Logs
```bash
journalctl -u kahaani -f           # Live logs (Ctrl+C to exit)
journalctl -u kahaani --lines 100  # Last 100 lines
```
