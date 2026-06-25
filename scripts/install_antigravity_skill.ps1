param(
    [string]$ProjectDir = $PSScriptRoot
)

# Force console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Determine language code
$culture = [System.Globalization.CultureInfo]::CurrentUICulture.Name
$lang = "en"
if ($culture -like "ja*") { $lang = "ja" }
elseif ($culture -eq "zh-CN" -or $culture -like "zh-Hans*") { $lang = "zh-CN" }
elseif ($culture -eq "zh-TW" -or $culture -like "zh-Hant*" -or $culture -eq "zh-HK" -or $culture -eq "zh-MO") { $lang = "zh-TW" }

# Path to installer locales
$jsonPath = Join-Path $ProjectDir "locales\installer.json"
$msg = $null

if (Test-Path $jsonPath) {
    try {
        $jsonContent = [System.IO.File]::ReadAllText($jsonPath, [System.Text.Encoding]::UTF8)
        $locales = ConvertFrom-Json $jsonContent
        $msg = $locales.$lang
    } catch {
        # Ignore and fallback
    }
}

# Fallback to English if json loading fails or key is missing
if ($null -eq $msg) {
    $msg = @{
        antigravity_title = "  Antigravity GM Skill Installer (for LoreRelay)"
        antigravity_installing = "Installing Antigravity GM Skill..."
        antigravity_src = "Source: {0}"
        antigravity_dest = "Destination: {1}"
        antigravity_err_no_skill = "[Error] GM Skill source folder not found.`nPlease make sure one of the following directories exists:`n  - {0}`n  - {1}"
        antigravity_err_copy_failed = "[Error] Failed to copy SKILL.md."
        antigravity_success = "[Success] GM Skill installed successfully! Please restart Antigravity."
    }
}

Write-Host "==================================================="
Write-Host $msg.antigravity_title
Write-Host "==================================================="
Write-Host ""
Write-Host $msg.antigravity_installing

$skillDest = Join-Path $env:USERPROFILE ".gemini\config\skills\text-adventure-gm"
$skillSrc = $null

$path1 = Join-Path $ProjectDir "skills\text-adventure-gm"
$path2 = Join-Path $ProjectDir "..\TextAdventureGMSkill"

if (Test-Path (Join-Path $path1 "SKILL.md")) {
    $skillSrc = $path1
} elseif (Test-Path (Join-Path $path2 "SKILL.md")) {
    $skillSrc = $path2
}

if ($null -eq $skillSrc) {
    Write-Host ($msg.antigravity_err_no_skill -f $path1, $path2) -ForegroundColor Red
    exit 1
}

Write-Host ($msg.antigravity_src -f $skillSrc)
Write-Host ($msg.antigravity_dest -f $skillDest)

if (-not (Test-Path $skillDest)) {
    New-Item -ItemType Directory -Force -Path $skillDest | Out-Null
}
$scriptsDest = Join-Path $skillDest "scripts"
if (-not (Test-Path $scriptsDest)) {
    New-Item -ItemType Directory -Force -Path $scriptsDest | Out-Null
}

try {
    Copy-Item -Path (Join-Path $skillSrc "SKILL.md") -Destination $skillDest -Force
} catch {
    Write-Host $msg.antigravity_err_copy_failed -ForegroundColor Red
    exit 1
}

# Copy scripts (*.py and *.json) if they exist
$scriptsSrc = Join-Path $skillSrc "scripts"
if (Test-Path $scriptsSrc) {
    Get-ChildItem -Path $scriptsSrc -File | Where-Object { $_.Extension -eq ".py" -or $_.Extension -eq ".json" } | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $scriptsDest -Force
    }
}

Write-Host $msg.antigravity_success -ForegroundColor Green
