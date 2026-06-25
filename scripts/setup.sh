#!/usr/bin/env bash
# LoreRelay — quick setup (macOS / Linux)
# Usage:
#   ./scripts/setup.sh
#   ./scripts/setup.sh --locale en --gm grok
#   ./scripts/setup.sh --game-workspace ~/my-adventure

set -euo pipefail

LOCALE="ja"
GM_PROVIDER="grok"
SKILL_PATH=""
GAME_WORKSPACE=""
SKIP_VSIX=0
SKIP_NPM=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --locale) LOCALE="$2"; shift 2 ;;
    --gm) GM_PROVIDER="$2"; shift 2 ;;
    --skill-path) SKILL_PATH="$2"; shift 2 ;;
    --game-workspace) GAME_WORKSPACE="$2"; shift 2 ;;
    --skip-vsix) SKIP_VSIX=1; shift ;;
    --skip-npm) SKIP_NPM=1; shift ;;
    -h|--help)
      echo "Usage: $0 [--locale ja|en|zh-CN|zh-TW] [--gm grok|clipboard|ollama|koboldcpp]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

VSCE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$VSCE_ROOT"

step() { echo ""; echo "==> $*"; }
ok()   { echo " OK: $*"; }
warn() { echo " WARN: $*"; }
fail() { echo " FAIL: $*"; exit 1; }

step "LoreRelay setup"
echo "Extension root: $VSCE_ROOT"

find_skill() {
  if [[ -n "$SKILL_PATH" && -f "$SKILL_PATH" ]]; then
    realpath "$SKILL_PATH"
    return
  fi
  local parent="$(dirname "$VSCE_ROOT")"
  local candidates=(
    "$parent/TextAdventureGMSkill/scripts/comfyui_generate.py"
    "$VSCE_ROOT/../TextAdventureGMSkill/scripts/comfyui_generate.py"
    "$HOME/.grok/skills/text-adventure-gm/scripts/comfyui_generate.py"
    "$HOME/.gemini/config/skills/text-adventure-gm/scripts/comfyui_generate.py"
  )
  for p in "${candidates[@]}"; do
    if [[ -f "$p" ]]; then
      realpath "$p"
      return
    fi
  done
  return 1
}

SKILL_SCRIPT="$(find_skill)" || fail "TextAdventureGMSkill not found (comfyui_generate.py)"
ok "GM skill: $SKILL_SCRIPT"

step "Checking prerequisites"
MISSING=()

command -v node >/dev/null && ok "Node.js $(node -v)" || MISSING+=("Node.js")
command -v python3 >/dev/null && ok "Python $(python3 --version)" || \
  command -v python >/dev/null && ok "Python $(python --version)" || MISSING+=("Python")

if command -v code >/dev/null; then
  ok "VS Code CLI (code)"
else
  warn "VS Code CLI not in PATH"
fi

if [[ "$GM_PROVIDER" == "grok" ]]; then
  if [[ -x "$HOME/.grok/bin/grok" ]] || command -v grok >/dev/null; then
    ok "Grok CLI"
  else
    warn "Grok CLI not found — use --gm clipboard or install Grok Build"
  fi
fi

if [[ "$SKIP_NPM" -eq 0 ]]; then
  step "Installing dependencies & building extension"
  if [[ -f package-lock.json ]]; then npm ci; else npm install; fi
  npm run compile
  npm test
  ok "Build & validation passed"
fi

VSIX_PATH=""
if [[ "$SKIP_VSIX" -eq 0 ]]; then
  step "Packaging VSIX (optional)"
  if npx --yes @vscode/vsce package --out "$VSCE_ROOT" 2>/dev/null; then
    VSIX_PATH="$(ls -t "$VSCE_ROOT"/lorerelay-*.vsix 2>/dev/null | head -1 || true)"
    [[ -n "$VSIX_PATH" ]] && ok "VSIX: $VSIX_PATH" || warn "VSIX not produced"
  else
    warn "VSIX packaging skipped"
  fi
fi

[[ -n "$GAME_WORKSPACE" ]] || GAME_WORKSPACE="$(dirname "$VSCE_ROOT")/my-adventure"
mkdir -p "$GAME_WORKSPACE"
ok "Game workspace: $GAME_WORKSPACE"

STARTER="$GAME_WORKSPACE/game_state.json"
if [[ ! -f "$STARTER" ]]; then
  cat > "$STARTER" <<'EOF'
{
  "entries": [],
  "status": {
    "location": "---",
    "time": "---",
    "condition": ["Ready"],
    "inventory": [],
    "skills": []
  },
  "options": [],
  "theme": "fantasy"
}
EOF
  ok "Starter game_state.json created"
fi

mkdir -p "$GAME_WORKSPACE/.vscode"
SETTINGS_FILE="$GAME_WORKSPACE/.vscode/settings.json"

# Build JSON with jq if available, else heredoc
if command -v jq >/dev/null; then
  jq -n \
    --arg skill "$SKILL_SCRIPT" \
    --arg locale "$LOCALE" \
    --arg gm "$GM_PROVIDER" \
    '{
      "textAdventure.skillPath": $skill,
      "textAdventure.locale": $locale,
      "textAdventure.gmBridge.provider": $gm,
      "textAdventure.grokBridge.enabled": ($gm == "grok"),
      "textAdventure.grokBridge.fallbackToClipboard": true,
      "textAdventure.bgm.enabled": true,
      "textAdventure.sfx.enabled": true
    }' > "$SETTINGS_FILE"
else
  cat > "$SETTINGS_FILE" <<EOF
{
  "textAdventure.skillPath": "$SKILL_SCRIPT",
  "textAdventure.locale": "$LOCALE",
  "textAdventure.gmBridge.provider": "$GM_PROVIDER",
  "textAdventure.grokBridge.enabled": $( [[ "$GM_PROVIDER" == "grok" ]] && echo true || echo false ),
  "textAdventure.grokBridge.fallbackToClipboard": true,
  "textAdventure.bgm.enabled": true,
  "textAdventure.sfx.enabled": true
}
EOF
fi
ok "Wrote $SETTINGS_FILE"

PARENT="$(dirname "$VSCE_ROOT")"
SKILL_ROOT="$(dirname "$(dirname "$SKILL_SCRIPT")")"
WORKSPACE_FILE="$PARENT/text-adventure.code-workspace"

if command -v jq >/dev/null; then
  jq -n \
    --arg game "$(realpath "$GAME_WORKSPACE")" \
    --arg skill "$SKILL_ROOT" \
    --arg ext "$VSCE_ROOT" \
    --slurpfile s "$SETTINGS_FILE" \
    '{
      folders: [
        { path: $game, name: "Game" },
        { path: $skill, name: "GM Skill" },
        { path: $ext, name: "Extension (dev)" }
      ],
      settings: $s[0]
    }' > "$WORKSPACE_FILE"
else
  warn "jq not found — workspace file not generated (install jq or use settings.json only)"
fi
[[ -f "$WORKSPACE_FILE" ]] && ok "Workspace file: $WORKSPACE_FILE"

if [[ -n "$VSIX_PATH" ]] && command -v code >/dev/null; then
  step "Installing VSIX into VS Code"
  code --install-extension "$VSIX_PATH" --force || warn "VSIX install failed"
fi

step "Next steps"
cat <<EOF

1. Open workspace:
     code "$WORKSPACE_FILE"

2. Command Palette:
     Text Adventure: Open Game UI

3. GM skill:
     $SKILL_ROOT/SKILL.md

4. GM bridge: $GM_PROVIDER | Locale: $LOCALE

EOF

if [[ ${#MISSING[@]} -gt 0 ]]; then
  warn "Missing prerequisites:"
  printf '  - %s\n' "${MISSING[@]}"
fi

echo "Setup complete."