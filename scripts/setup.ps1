# LoreRelay  Equick setup (Windows)
# Usage:
#   .\scripts\setup.ps1
#   .\scripts\setup.ps1 -Locale ja -GmProvider grok
#   .\scripts\setup.ps1 -GameWorkspace "C:\AI\my-adventure"

param(
    [ValidateSet('ja', 'en', 'zh-CN', 'zh-TW')]
    [string]$Locale = 'ja',
    [ValidateSet('grok', 'clipboard', 'ollama', 'koboldcpp')]
    [string]$GmProvider = 'grok',
    [string]$SkillPath = '',
    [string]$GameWorkspace = '',
    [switch]$SkipVsix,
    [switch]$SkipNpm
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host " OK: $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host " WARN: $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host " FAIL: $msg" -ForegroundColor Red }

$VsceRoot = Split-Path $PSScriptRoot -Parent
Set-Location $VsceRoot
Write-Step "LoreRelay setup"
Write-Host "Extension root: $VsceRoot"

# --- Find GM skill ---
function Find-SkillScript {
    param([string]$Override)
    if ($Override -and (Test-Path $Override)) {
        return (Resolve-Path $Override).Path
    }
    $candidates = @(
        (Join-Path (Split-Path $VsceRoot -Parent) 'TextAdventureGMSkill\scripts\comfyui_generate.py'),
        'C:\AI\TextAdventureGMSkill\scripts\comfyui_generate.py',
        (Join-Path $VsceRoot '..\TextAdventureGMSkill\scripts\comfyui_generate.py'),
        (Join-Path $env:USERPROFILE '.grok\skills\text-adventure-gm\scripts\comfyui_generate.py'),
        (Join-Path $env:USERPROFILE '.gemini\config\skills\text-adventure-gm\scripts\comfyui_generate.py')
    )
    foreach ($p in $candidates) {
        try {
            $resolved = Resolve-Path $p -ErrorAction SilentlyContinue
            if ($resolved) { return $resolved.Path }
        } catch {}
    }
    return $null
}

$skillScript = Find-SkillScript -Override $SkillPath
if (-not $skillScript) {
    Write-Fail "TextAdventureGMSkill not found (comfyui_generate.py)."
    Write-Host "Clone or copy the skill next to this repo, or pass -SkillPath."
    exit 1
}
Write-Ok "GM skill: $skillScript"

# --- Prerequisites ---
Write-Step "Checking prerequisites"
$checks = @()

if (Get-Command node -ErrorAction SilentlyContinue) {
    $nv = node -v
    Write-Ok "Node.js $nv"
} else {
    $checks += 'Node.js (https://nodejs.org/)'
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    $pv = python --version 2>&1
    Write-Ok "Python $pv"
    $reqFile = Join-Path $skillRoot 'scripts\requirements.txt'
    if (Test-Path $reqFile) {
        Write-Step "Installing Python dependencies (ChromaDB, etc.)"
        python -m pip install -r $reqFile 2>&1 | Out-Host
        Write-Ok "Python dependencies installed"
    }
} else {
    $checks += 'Python (for dice.py / ComfyUI scripts)'
}

$codeCmd = Get-Command code -ErrorAction SilentlyContinue
if ($codeCmd) {
    Write-Ok "VS Code CLI (code)"
} else {
    Write-Warn "VS Code CLI not in PATH  Einstall extension manually or add code to PATH"
}

$grokExe = Join-Path $env:USERPROFILE '.grok\bin\grok.exe'
if (Test-Path $grokExe) {
    Write-Ok "Grok CLI: $grokExe"
} elseif (Get-Command grok -ErrorAction SilentlyContinue) {
    Write-Ok "Grok CLI in PATH"
} elseif ($GmProvider -eq 'grok') {
    Write-Warn "Grok CLI not found  Euse -GmProvider clipboard or install Grok Build"
}

# --- npm build ---
if (-not $SkipNpm) {
    Write-Step "Installing dependencies & building extension"
    if (Test-Path 'package-lock.json') {
        npm ci
    } else {
        npm install
    }
    npm run compile
    npm test
    Write-Ok "Build & validation passed"
}

# --- VSIX (optional) ---
$vsixPath = $null
if (-not $SkipVsix) {
    Write-Step "Packaging VSIX (optional)"
    try {
        npx --yes @vscode/vsce package --out $VsceRoot 2>&1 | Out-Host
        $vsix = Get-ChildItem -Path $VsceRoot -Filter 'lorerelay-*.vsix' |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($vsix) {
            $vsixPath = $vsix.FullName
            Write-Ok "VSIX: $vsixPath"
        }
    } catch {
        Write-Warn "VSIX packaging skipped ($($_.Exception.Message))"
    }
}

# --- Game workspace ---
if (-not $GameWorkspace) {
    $GameWorkspace = Join-Path (Split-Path $VsceRoot -Parent) 'my-adventure'
}
$GameWorkspace = [System.IO.Path]::GetFullPath($GameWorkspace)
if (-not (Test-Path $GameWorkspace)) {
    New-Item -ItemType Directory -Path $GameWorkspace | Out-Null
    Write-Ok "Created game workspace: $GameWorkspace"
}

$starterState = Join-Path $GameWorkspace 'game_state.json'
if (-not (Test-Path $starterState)) {
    @'
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
'@ | Set-Content -Path $starterState -Encoding UTF8
    Write-Ok "Starter game_state.json created"
}

# --- Workspace settings (game folder) ---
$wsSettingsDir = Join-Path $GameWorkspace '.vscode'
New-Item -ItemType Directory -Path $wsSettingsDir -Force | Out-Null

$settings = [ordered]@{
    'textAdventure.skillPath'       = $skillScript
    'textAdventure.locale'          = $Locale
    'textAdventure.gmBridge.provider' = $GmProvider
    'textAdventure.grokBridge.enabled' = ($GmProvider -eq 'grok')
    'textAdventure.grokBridge.fallbackToClipboard' = $true
    'textAdventure.bgm.enabled'     = $true
    'textAdventure.sfx.enabled'     = $true
}
if ($GmProvider -eq 'ollama') {
    $settings['textAdventure.gmBridge.ollama.model'] = 'llama3.2'
    $settings['textAdventure.gmBridge.ollama.url'] = 'http://localhost:11434'
}
if ($GmProvider -eq 'koboldcpp') {
    $settings['textAdventure.gmBridge.koboldcpp.url'] = 'http://127.0.0.1:5001'
}

$settingsJson = ($settings | ConvertTo-Json -Depth 5)
Set-Content -Path (Join-Path $wsSettingsDir 'settings.json') -Value $settingsJson -Encoding UTF8
Write-Ok "Wrote $wsSettingsDir\settings.json"

# --- Multi-root workspace file ---
$parent = Split-Path $VsceRoot -Parent
$skillRoot = Split-Path (Split-Path $skillScript -Parent) -Parent
$workspaceFile = Join-Path $parent 'text-adventure.code-workspace'

$workspace = @{
    folders = @(
        @{ path = (Resolve-Path $GameWorkspace).Path; name = 'Game' }
        @{ path = $skillRoot; name = 'GM Skill' }
        @{ path = $VsceRoot; name = 'Extension (dev)' }
    )
    settings = $settings
}
$workspace | ConvertTo-Json -Depth 6 | Set-Content -Path $workspaceFile -Encoding UTF8
Write-Ok "Workspace file: $workspaceFile"

# --- Install VSIX if code CLI available ---
if ($vsixPath -and $codeCmd) {
    Write-Step "Installing VSIX into VS Code"
    & code --install-extension $vsixPath --force 2>&1 | Out-Host
    Write-Ok "Extension installed from VSIX"
}

# --- Summary ---
Write-Step "Next steps"
Write-Host @"

1. Open workspace:
     code "$workspaceFile"

2. Command Palette (Ctrl+Shift+P):
     LoreRelay: Open Game UI

3. Tell your GM to read SKILL.md and start the game:
     $($skillRoot)\SKILL.md

4. GM bridge: $GmProvider | Locale: $Locale

5. Docs:
     GM_BRIDGE_PRESETS.md   EOllama / Kobold / Grok presets
     ANTIGRAVITY_GUIDE.md   Eclipboard mode for Antigravity

"@

if ($checks.Count -gt 0) {
    Write-Warn "Missing optional prerequisites:"
    $checks | ForEach-Object { Write-Host "  - $_" }
}

Write-Host "Setup complete." -ForegroundColor Green
