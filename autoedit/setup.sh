#!/usr/bin/env bash
# AutoEdit - one-shot installer (macOS / Linux). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"
say() { printf "\n\033[1;35m==> %s\033[0m\n" "$*"; }

say "System packages (ffmpeg, espeak-ng, GL libs)"
if [[ "$(uname)" == "Darwin" ]]; then
  command -v brew >/dev/null || /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  brew install ffmpeg espeak-ng python@3.12 node || true
elif command -v apt-get >/dev/null; then
  SUDO=$([[ $EUID -ne 0 ]] && echo sudo || echo)
  $SUDO apt-get update -y
  $SUDO apt-get install -y ffmpeg espeak-ng libegl1 libgles2 libgl1 python3-venv python3-pip curl
elif command -v dnf >/dev/null; then
  sudo dnf install -y ffmpeg espeak-ng mesa-libEGL python3 python3-pip
fi
command -v ffmpeg >/dev/null || { echo "ffmpeg is required"; exit 1; }

say "Python environment"
PY=$(command -v python3.12 || command -v python3)
[[ -d .venv ]] || "$PY" -m venv .venv
source .venv/bin/activate
pip install --upgrade pip wheel >/dev/null
pip install -r requirements.txt
pip install -e . >/dev/null

say "Assets: fonts, LUTs, sound effects, music beds, AI models"
python -m autoedit.assets_setup --full

say "Web interface"
if [[ ! -f web/dist/index.html ]] && command -v npm >/dev/null; then
  (cd web && npm install --silent && npm run build)
fi

[[ -f .env ]] || cp .env.example .env
say "Done!  Start with:  ./start.sh"
echo "API keys (optional, recommended) go in .env - see README.md"
