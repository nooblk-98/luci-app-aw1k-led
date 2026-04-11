# Claude Instructions for luci-app-aw1k-led

## Project
LuCI package for the Arcadyan AW1000 router on OpenWrt.
Controls RGB LEDs based on 5G SINR and CSQ signal quality.

## Router Access
- IP: 192.168.1.1
- User: root
- Password: none (no password set)
- SSH: `ssh -o StrictHostKeyChecking=no root@192.168.1.1`
- File upload: `cat <file> | ssh -o StrictHostKeyChecking=no root@192.168.1.1 "cat > <dest>"`

## Key Paths on Router
- LuCI JS view: `/www/luci-static/resources/view/aw1k-led/settings.js`
- Night mode script: `/usr/bin/led-night-mode.sh`
- LED status script: `/usr/bin/led-status-check.sh`
- LuCI cache: `/tmp/luci-indexcache*.json` — delete after syncing JS files

## Sync Workflow
1. Edit files locally
2. Upload to router via SSH stdin pipe
3. Delete LuCI cache: `ssh ... "rm -f /tmp/luci-indexcache*.json"`
4. Hard refresh browser in incognito (Ctrl+Shift+R)

## Important Constraints
- Busybox `sleep` does NOT support decimals — use `python3 -c "import time; time.sleep(0.x)"` for sub-second delays
- `usleep` and `nanosleep` are NOT available on this router
- Available LED triggers on green:power: `none timer heartbeat default-on netdev phy0rx phy0tx phy0assoc phy0radio phy1rx phy1tx phy1assoc phy1radio`
- No `oneshot` or `pattern` trigger available

## Commit Style
- No `Co-Authored-By` trailers in commit messages
- Short, clear commit messages without bullet lists
- Push directly to `main`

## UI Style
- No emoji in UI buttons or labels (emoji in Night Mode test buttons are ok as agreed)
- No separate white card containers in tabs — keep flat like other LuCI tabs
- No LED Test tab (removed)
- No Preview on LEDs / Restore service buttons in LED Colors tab (removed)

## GitHub
- Repo: https://github.com/nooblk-98/luci-app-aw1k-led
- Topics: openwrt, luci, aw1000, arcadyan, led, 5g, openwrt-package
- Workflows: build.yml (IPK + APK), release.yml (auto release notes)
