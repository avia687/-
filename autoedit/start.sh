#!/usr/bin/env bash
# One click: starts the app (web UI + task queue + learning scheduler) and opens the browser.
cd "$(dirname "$0")"
[[ -d .venv ]] || ./setup.sh
source .venv/bin/activate
PORT=${PORT:-8765}
IP=$(python - <<'PY'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
try:
    s.connect(("8.8.8.8", 80)); print(s.getsockname()[0])
except Exception:
    print("127.0.0.1")
PY
)
echo "AutoEdit:   http://localhost:$PORT"
echo "בטלפון (אותה רשת WiFi): http://$IP:$PORT   ← פתחו ובחרו 'הוסף למסך הבית'"
python - "$IP" "$PORT" <<'PY' 2>/dev/null || true
import sys, qrcode
q = qrcode.QRCode(border=1); q.add_data(f"http://{sys.argv[1]}:{sys.argv[2]}"); q.print_ascii(invert=True)
PY
( sleep 2; (command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT") || (command -v open >/dev/null && open "http://localhost:$PORT") ) >/dev/null 2>&1 &
exec autoedit serve --port "$PORT"
