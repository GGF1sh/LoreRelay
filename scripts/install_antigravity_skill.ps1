param(
    [string]$ProjectDir = $PSScriptRoot
)

. (Join-Path $PSScriptRoot 'install_common.ps1')

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$culture = [System.Globalization.CultureInfo]::CurrentUICulture.Name
$lang = 'en'
if ($culture -match '^ja') { $lang = 'ja' }
elseif ($culture -match '^zh-CN' -or $culture -match '^zh-Hans') { $lang = 'zh-CN' }
elseif ($culture -match '^zh-TW' -or $culture -match '^zh-Hant') { $lang = 'zh-TW' }

$jsonPath = Join-Path $ProjectDir '..\locales\installer.json'
$loc = @{}
if (Test-Path $jsonPath) {
    try {
        $utf8 = [System.Text.Encoding]::UTF8
        $jsonContent = [System.IO.File]::ReadAllText($jsonPath, $utf8)
        $parsed = $jsonContent | ConvertFrom-Json
        if ($parsed.$lang) { $loc = $parsed.$lang } else { $loc = $parsed.en }
    } catch {
        Write-Warning 'Failed to parse locales/installer.json.'
    }
}

function Get-Loc([string]$key, [string]$default) {
    if ($loc.$key) { return $loc.$key }
    return $default
}

Write-Host '=================================================' -ForegroundColor Cyan
Write-Host (Get-Loc 'gm_title' '  LoreRelay Antigravity GM Skill Installer') -ForegroundColor Cyan
Write-Host '=================================================' -ForegroundColor Cyan
Write-Host ''

$sourceDir = (Resolve-Path (Join-Path $ProjectDir '..\antigravity-skill\text-adventure-gm') -ErrorAction SilentlyContinue).Path
$homeDir = [Environment]::GetFolderPath('UserProfile')
$targetParentDir = Join-Path $homeDir '.gemini\config\skills'
$targetDir = Join-Path $targetParentDir 'text-adventure-gm'

Write-Host ((Get-Loc 'gm_source' 'Source: {0}') -f $sourceDir)
Write-Host ((Get-Loc 'gm_target' 'Target: {0}') -f $targetDir)
Write-Host ''

if (-not $sourceDir -or -not (Test-Path $sourceDir)) {
    Write-Host (Get-Loc 'gm_err_no_source' '[Error] Source directory not found. Please ensure you are running this from the correct location.') -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $sourceDir 'SKILL.md'))) {
    Write-Host (Get-Loc 'gm_err_no_source' '[Error] Source directory not found. Please ensure you are running this from the correct location.') -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $targetParentDir)) {
    try {
        New-Item -ItemType Directory -Path $targetParentDir -Force | Out-Null
    } catch {
        Write-Host ((Get-Loc 'gm_err_mkdir' '[Error] Failed to create destination directory: {0}') -f $targetParentDir) -ForegroundColor Red
        exit 1
    }
}

Write-Host (Get-Loc 'gm_installing' 'Installing GM skill...')
try {
    Install-SkillFolderAtomic -SourceDir $sourceDir -TargetDir $targetDir
    Write-Host ''
    Write-Host (Get-Loc 'gm_success' 'GM skill installation completed successfully!') -ForegroundColor Green
    Write-Host (Get-Loc 'gm_success_hint' 'You can now use this skill via Antigravity.') -ForegroundColor Green
} catch {
    Write-Host (Get-Loc 'gm_err_failed' '[Error] Failed to install GM skill.') -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

exit 0
