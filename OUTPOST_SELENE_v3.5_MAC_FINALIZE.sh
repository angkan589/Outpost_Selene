#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

node_is_compatible() {
  local node_bin="$1"
  "$node_bin" -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19)) ? 0 : 1)' >/dev/null 2>&1
}

# Prefer Homebrew over the broken Miniconda Node shown in the user's log.
BREW=""
for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [[ -x "$candidate" ]]; then
    BREW="$candidate"
    eval "$("$BREW" shellenv)"
    break
  fi
done

# Check common standalone Node locations before falling back to Homebrew install.
NODE_DIR=""
for candidate_dir in /opt/homebrew/bin /usr/local/bin /opt/local/bin "$HOME/.volta/bin"; do
  if [[ -x "$candidate_dir/node" ]] && node_is_compatible "$candidate_dir/node"; then
    NODE_DIR="$candidate_dir"
    break
  fi
done

# Also check installed nvm versions (the script runs under bash, so an empty glob is safe).
if [[ -z "$NODE_DIR" ]]; then
  for candidate_node in "$HOME"/.nvm/versions/node/*/bin/node; do
    if [[ -x "$candidate_node" ]] && node_is_compatible "$candidate_node"; then
      NODE_DIR="$(dirname "$candidate_node")"
      break
    fi
  done
fi

if [[ -n "$NODE_DIR" ]]; then
  export PATH="$NODE_DIR:$PATH"
elif [[ -n "$BREW" ]]; then
  echo "No compatible standalone Node.js found. Installing Node.js 22 with Homebrew..."
  "$BREW" install node@22
  "$BREW" link --overwrite --force node@22
  export PATH="$("$BREW" --prefix node@22)/bin:$("$BREW" --prefix)/bin:$PATH"
else
  cat <<'MSG'
ERROR: No working Node.js 20.19+ / 22.12+ installation was found, and Homebrew is not installed.
Install the macOS Node.js 22 LTS .pkg from https://nodejs.org/en/download, then run this script again.
MSG
  exit 1
fi

hash -r
if ! node_is_compatible "$(command -v node)"; then
  echo "ERROR: Node.js is still incompatible: $(command -v node)"
  exit 1
fi

echo "===== VERIFIED RUNTIME ====="
node -v
npm -v

echo "===== CLEAN DEPENDENCY INSTALL ====="
npm ci

echo "===== AUTOMATED TESTS ====="
npm test

echo "===== FULL-MISSION SIMULATIONS ====="
npm run test:sim

echo "===== PRODUCTION BUILD ====="
npm run build

echo ""
echo "SUCCESS: Outpost Selene v3.5 passed installation, tests, simulations, and production build."
echo "Next: run 'npm run dev' in this folder and open the local URL printed by Vite."
